// 验收剧本 harness 自测（REQ-ACCEPT·图纸⑤）：
//  A. 真游戏扫：遍历所有含 docs/design/<g>/acceptance/*.scenario.jsonc 的游戏，装 adapter 跑全部剧本
//     （无 adapter / 坏剧本 / 断言不过 = 红）。推送门禁自动咬——PE/GD 随 S4 落 adapter+剧本即被覆盖。
//  B. 合成 fixture：测试内建 mini adapter + world 桩，自测 runner 语义（信号/tick/各断言算子/
//     失败报告格式/同 seed 同轨确定性/schema 拒坏本）——不依赖任何真游戏。
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonc, parseAndValidate, validateScenario, locOf, formatErrors } from './acceptance-schema.mjs';
import {
  snapshotScalars, evaluateAssertion, runScenario, formatScenarioResult,
  discoverGamesWithAcceptance, listScenarioFiles, runGame,
} from './acceptance-run.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// ═══ 合成 fixture：mini adapter + 确定性 world 桩 ═══
function makeAdapter() {
  return {
    createWorld(seed, config) {
      // seed 影响初值 → 同 seed 同轨·异 seed 异轨（确定性可测）。
      const start = (config?.start ?? 0) + ((seed >>> 0) % 100);
      const ent = {
        score: { Resource: { type: 'Resource', id: 'score', current: start, min: 0, max: 9999 } },
        hp: { Resource: { type: 'Resource', id: 'hp', current: 10, min: 0, max: 10 } },
        gate: { Flag: { type: 'Flag', id: 'open', active: false } },
        story: { StringVar: { type: 'StringVar', id: 'node', value: 's0' } },
        hero: { Transform: { type: 'Transform', x: 0, y: 0 } },
      };
      return {
        tick() { ent.score.Resource.current += 1; }, // 确定性推进
        getAllEntities() { return Object.keys(ent); },
        getComponent(id, type) { return ent[id]?.[type]; },
      };
    },
    applySignal(world, signal, args) {
      if (signal === 'add') world.getComponent('score', 'Resource').current += (args?.n ?? 1);
      else if (signal === 'hurt') world.getComponent('hp', 'Resource').current -= (args?.n ?? 1);
      else if (signal === 'open') world.getComponent('gate', 'Flag').active = true;
      else if (signal === 'goto') world.getComponent('story', 'StringVar').value = args.to;
      else if (signal === 'move') world.getComponent('hero', 'Transform').x = args.x;
    },
    readWorld(world) { return world; },
  };
}
const scen = (steps, extra = {}) => ({ name: 't', game: 'synthetic', seed: 0, steps, ...extra });

describe('snapshotScalars — 机读态提取（引擎协议·非游戏内部）', () => {
  it('扫出 res/flag/sv 三容器·忽略非容器组件', () => {
    const w = makeAdapter().createWorld(0);
    const s = snapshotScalars(w);
    expect(s.res).toEqual({ score: 0, hp: 10 });
    expect(s.flag).toEqual({ open: false });
    expect(s.sv).toEqual({ node: 's0' });
  });
});

describe('runner 语义 — 信号步 / tick 步', () => {
  it('信号步改状态（add→资源·open→flag·goto→sv·move→组件）', () => {
    const r = runScenario(makeAdapter(), scen([
      { signal: 'add', args: { n: 5 } }, { signal: 'open' }, { signal: 'goto', args: { to: 's2' } }, { signal: 'move', args: { x: 3 } },
      { expect: [{ res: 'score', eq: 5 }, { flag: 'open', eq: true }, { sv: 'node', eq: 's2' }, { comp: { entity: 'hero', component: 'Transform', field: 'x' }, eq: 3 }] },
    ]));
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });
  it('tick 步推进世界（score += tick 次数）', () => {
    const r = runScenario(makeAdapter(), scen([{ tick: 4 }, { expect: [{ res: 'score', eq: 4 }] }]));
    expect(r.ok).toBe(true);
  });
});

describe('runner 语义 — 各断言算子（闭集）', () => {
  it('res eq/gte/lte 三算子·通过与失败', () => {
    const good = runScenario(makeAdapter(), scen([{ signal: 'add', args: { n: 5 } }, { expect: [{ res: 'score', gte: 5 }, { res: 'score', lte: 5 }, { res: 'score', eq: 5 }] }]));
    expect(good.ok).toBe(true);
    const bad = runScenario(makeAdapter(), scen([{ signal: 'add', args: { n: 5 } }, { expect: [{ res: 'score', gte: 6 }] }]));
    expect(bad.ok).toBe(false);
    expect(bad.failures[0]).toMatchObject({ kind: 'res', target: 'score', op: 'gte', expected: 6, actual: 5 });
  });
  it('flag eq / sv eq / comp eq', () => {
    const r = runScenario(makeAdapter(), scen([{ expect: [{ flag: 'open', eq: false }, { sv: 'node', eq: 's0' }, { comp: { entity: 'hero', component: 'Transform', field: 'x' }, eq: 0 }] }]));
    expect(r.ok).toBe(true);
    const bad = runScenario(makeAdapter(), scen([{ expect: [{ flag: 'open', eq: true }] }]));
    expect(bad.ok).toBe(false);
    expect(bad.failures[0].actual).toBe(false);
  });
  it('目标不存在 → FAIL（区分「不存在」与值 undefined）', () => {
    const r = runScenario(makeAdapter(), scen([{ expect: [{ res: 'mana', eq: 0 }] }]));
    expect(r.ok).toBe(false);
    expect(r.failures[0].detail).toContain('不存在');
    expect(r.failures[0].actual).toBeUndefined();
  });
  it('evaluateAssertion 直测（comp 缺组件 = 不存在）', () => {
    const w = makeAdapter().createWorld(0);
    const s = snapshotScalars(w);
    expect(evaluateAssertion(w, s, { comp: { entity: 'ghost', component: 'X', field: 'y' }, eq: 1 }).ok).toBe(false);
    expect(evaluateAssertion(w, s, { res: 'hp', lte: 10 }).ok).toBe(true);
  });
});

describe('runner 语义 — 失败报告格式（天然 bug 单：步号+期望 vs 实际+快照）', () => {
  it('formatScenarioResult 含步号/期望/实际/当步机读态', () => {
    const r = runScenario(makeAdapter(), scen([{ signal: 'hurt', args: { n: 3 } }, { expect: [{ res: 'hp', eq: 10 }] }]));
    const out = formatScenarioResult('synthetic/伤害', 'x.scenario.jsonc', r);
    expect(out).toContain('FAIL');
    expect(out).toContain('step #1');
    expect(out).toContain('期望');
    expect(out).toContain('实际');
    expect(out).toContain('当步机读态');
    expect(out).toContain('"hp":7'); // 快照带真实读数
  });
  it('全过时 formatScenarioResult=PASS + 检查点数', () => {
    const r = runScenario(makeAdapter(), scen([{ expect: [{ res: 'hp', eq: 10 }] }]));
    expect(formatScenarioResult('l', 'f', r)).toContain('PASS');
  });
  it('createWorld/step 抛错 → res.error（不崩·归一成红）', () => {
    const boom = { createWorld() { throw new Error('炸'); }, applySignal() {}, readWorld: (w) => w };
    const r = runScenario(boom, scen([{ tick: 1 }]));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('createWorld 抛错');
  });
});

describe('runner 语义 — 同 seed 同轨（确定性）', () => {
  it('同 seed 两跑轨迹逐字节一致·异 seed 轨迹不同', () => {
    const steps = [{ tick: 2 }, { expect: [{ res: 'score', gte: 0 }] }, { signal: 'add', args: { n: 3 } }, { expect: [{ res: 'score', gte: 0 }] }];
    const a1 = runScenario(makeAdapter(), scen(steps, { seed: 42 }));
    const a2 = runScenario(makeAdapter(), scen(steps, { seed: 42 }));
    expect(a1.trace).toEqual(a2.trace); // 同 seed 同轨
    const b = runScenario(makeAdapter(), scen(steps, { seed: 7 }));
    expect(b.trace).not.toEqual(a1.trace); // 异 seed 异轨（seed 真影响状态）
  });
});

// ═══ schema 校验器（图纸①·坏剧本报错带行位）═══
describe('schema — JSONC 解析（注释 + 尾逗号 + 行位）', () => {
  it('解析带 // 与 /* */ 注释和尾逗号·源位可读', () => {
    const v = parseJsonc(`{
      // 头注
      "name": "x", /* 行内 */ "game": "g", "seed": 1,
      "steps": [ { "tick": 1 }, ],
    }`);
    expect(v).toMatchObject({ name: 'x', game: 'g', seed: 1 });
    expect(v.steps).toHaveLength(1);
    expect(locOf(v).line).toBe(1);
    expect(locOf(v.steps[0]).line).toBe(4); // 步在第 4 行
  });
  it('语法错带行位（未闭合字符串）', () => {
    const r = parseAndValidate('{ "name": "x\n }');
    expect(r.ok).toBe(false);
    expect(r.errors[0].msg).toContain('语法');
    expect(r.errors[0].line).toBeGreaterThan(0);
  });
});

describe('schema — 闭集校验（坏剧本装载即错）', () => {
  const good = { name: 'n', game: 'g', seed: 0, steps: [{ signal: 's', args: { a: 1 }, by: 'p1' }, { tick: 2 }, { expect: [{ res: 'hp', gte: 1 }, { flag: 'f', eq: true }, { sv: 'v', eq: 'x' }, { comp: { entity: 'e', component: 'C', field: 'k' }, eq: 3 }] }] };
  it('合法剧本通过', () => {
    expect(validateScenario(good).ok).toBe(true);
  });
  it('缺 name/game/seed/steps → 逐条报', () => {
    const r = validateScenario({});
    expect(r.ok).toBe(false);
    const msgs = r.errors.map((e) => e.path);
    expect(msgs).toEqual(expect.arrayContaining(['name', 'game', 'seed', 'steps']));
  });
  it('seed 非整数/负 → 拒', () => {
    expect(validateScenario({ ...good, seed: 1.5 }).ok).toBe(false);
    expect(validateScenario({ ...good, seed: -1 }).ok).toBe(false);
  });
  it('步既非 signal/tick/expect → 拒；同时两种 → 拒', () => {
    expect(validateScenario({ ...good, steps: [{ foo: 1 }] }).ok).toBe(false);
    expect(validateScenario({ ...good, steps: [{ signal: 's', tick: 1 }] }).ok).toBe(false);
  });
  it('tick 须 ≥1 整数', () => {
    expect(validateScenario({ ...good, steps: [{ tick: 0 }] }).ok).toBe(false);
    expect(validateScenario({ ...good, steps: [{ tick: 1.2 }] }).ok).toBe(false);
  });
  it('res 断言须恰一个比较算子·且为数字', () => {
    expect(validateScenario({ ...good, steps: [{ expect: [{ res: 'hp' }] }] }).ok).toBe(false); // 无算子
    expect(validateScenario({ ...good, steps: [{ expect: [{ res: 'hp', eq: 1, gte: 2 }] }] }).ok).toBe(false); // 两算子
    expect(validateScenario({ ...good, steps: [{ expect: [{ res: 'hp', eq: 'x' }] }] }).ok).toBe(false); // 非数字
  });
  it('flag.eq 须布尔·sv.eq 须字符串·comp 三字段齐全', () => {
    expect(validateScenario({ ...good, steps: [{ expect: [{ flag: 'f', eq: 1 }] }] }).ok).toBe(false);
    expect(validateScenario({ ...good, steps: [{ expect: [{ sv: 'v', eq: 3 }] }] }).ok).toBe(false);
    expect(validateScenario({ ...good, steps: [{ expect: [{ comp: { entity: 'e', component: 'C' }, eq: 1 }] }] }).ok).toBe(false); // 缺 field
  });
  it('未知字段（闭集）→ 拒·带路径', () => {
    const r = validateScenario({ ...good, bogus: 1 });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.msg.includes('未知字段'))).toBe(true);
  });
  it('expect 空数组 → 拒', () => {
    expect(validateScenario({ ...good, steps: [{ expect: [] }] }).ok).toBe(false);
  });
  it('坏剧本（JSONC 文本）报错带行位', () => {
    const r = parseAndValidate(`{
      "name": "x", "game": "g", "seed": 0,
      "steps": [
        { "res": "hp" }
      ]
    }`);
    expect(r.ok).toBe(false);
    // steps[0] 既非 signal/tick/expect
    expect(r.errors[0].path).toContain('steps[0]');
    expect(r.errors[0].line).toBe(4);
  });
});

// ═══ 发现/装载：无 adapter=红（真游戏扫的地基）═══
describe('runGame — 发现/装载门（无 adapter 或坏剧本=红）', () => {
  const withRoot = (fn) => { const r = mkdtempSync(join(tmpdir(), 'accept-')); try { return fn(r); } finally { rmSync(r, { recursive: true, force: true }); } };
  const putScenario = (root, slug, name, obj) => {
    const dir = join(root, 'docs', 'design', slug, 'acceptance');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), JSON.stringify(obj));
  };
  it('discover 找到含 acceptance 剧本的游戏·listScenarioFiles 列文件', () => withRoot((root) => {
    putScenario(root, 'gx', 'a.scenario.jsonc', scen([{ tick: 1 }], { game: 'gx' }));
    expect(discoverGamesWithAcceptance(root)).toContain('gx');
    expect(listScenarioFiles(root, 'gx').map((f) => f.name)).toEqual(['a.scenario.jsonc']);
  }));
  it('有剧本但无 adapter → runGame 红（点名缺 adapter）', async () => withRoot(async (root) => {
    putScenario(root, 'gx', 'a.scenario.jsonc', scen([{ tick: 1 }], { game: 'gx' }));
    const g = await runGame(root, 'gx');
    expect(g.ok).toBe(false);
    expect(g.error).toContain('缺 adapter');
  }));
});

// ═══ A. 真游戏扫（动态·PE/GD 落 adapter+剧本即被覆盖）═══
describe('真游戏验收扫（所有含 acceptance/ 的游戏）', () => {
  const slugs = discoverGamesWithAcceptance(REPO);
  if (!slugs.length) {
    it('当前无游戏含 acceptance/ 剧本目录（各 PE/GD 随 S4 落·此扫届时自动咬）', () => {
      expect(slugs).toEqual([]);
    });
  } else {
    for (const slug of slugs) {
      it(`${slug}：adapter 装载 + 全部剧本 conformance 绿`, async () => {
        const g = await runGame(REPO, slug);
        if (!g.ok) {
          const detail = g.error || g.scenarios.filter((s) => !s.ok)
            .map((s) => s.schemaErrors ? `坏剧本 ${s.name}（schema）：\n${formatErrors(s.schemaErrors)}` : formatScenarioResult(s.name, s.file, s.res))
            .join('\n');
          throw new Error(`${slug} 验收剧本未过：\n${detail}`);
        }
        expect(g.ok).toBe(true);
        expect(g.scenarios.length).toBeGreaterThan(0);
      });
    }
  }
});
