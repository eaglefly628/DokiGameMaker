// 生产流程板自检（owner 2026-07-10「N 步拆分·每步 review·不能只靠手册」）：
// 形态识别 · 内容指纹（排除 pipeline.json/gen-mock·变更即过期）· 看板推导（机器门×人门双验语义）。
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { detectForm, gameHash, boardFor, artSubState, STAGES, GATE_STAGES, pipelineFile, mockDebt, writeConcept, priorGaps, orderGate, acceptanceScenarioCount, MIN_ACCEPTANCE_SCENARIOS, REVIEW_CHECKLISTS, selfCheckArtifacts, selfCheckBlock, selfCheckNote, MIN_SELFCHECK_SHOTS } from './game-pipeline.mjs';

const withRoot = async (fn) => { const r = mkdtempSync(join(tmpdir(), 'gpipe-')); try { return await fn(r); } finally { rmSync(r, { recursive: true, force: true }); } };
const put = (root, rel, content) => { const p = join(root, rel); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2)); };

const MANIFEST = { name: 'G', capabilities: [], entities: { hero: { Sprite: { textureKey: 'art:knight' } } } };

describe('阶段表（八阶段·每阶段一本手册）', () => {
  it('8 阶段·手册列全非空·机器门阶段=S3/S4/S5/S8', () => {
    expect(STAGES).toHaveLength(8);
    expect(STAGES.every((s) => s.handbook)).toBe(true);
    expect(GATE_STAGES).toEqual(['S3', 'S4', 'S5', 'S8']);
  });
});

describe('形态识别', () => {
  it('library→cart · public manifest→builtin · src 目录→compiled · 都无→null', () => withRoot(async (root) => {
    put(root, 'library/g1/manifest.json', MANIFEST);
    put(root, 'public/games/g2/manifest.json', MANIFEST);
    mkdirSync(join(root, 'src/games/g3'), { recursive: true });
    expect(detectForm(root, 'g1')).toBe('cart');
    expect(detectForm(root, 'g2')).toBe('builtin');
    expect(detectForm(root, 'g3')).toBe('compiled');
    expect(detectForm(root, 'nope')).toBeNull();
  }));
});

describe('游戏内容指纹（证据过期的机器判据）', () => {
  it('稳定·文件变更即变·pipeline.json 与 gen/mock 不入指纹', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    const h0 = gameHash(root, 'g');
    expect(gameHash(root, 'g')).toBe(h0); // 幂等
    put(root, 'public/games/g/pipeline.json', { signoffs: {} });
    expect(gameHash(root, 'g')).toBe(h0); // 记账不自我过期
    put(root, 'public/games/g/art/gen/mock/art-01.png', 'noise');
    expect(gameHash(root, 'g')).toBe(h0); // mock 预览物不入指纹
    put(root, 'public/games/g/art/gen/art-01.png', 'real');
    const h1 = gameHash(root, 'g');
    expect(h1).not.toBe(h0); // 真图入指纹
    put(root, 'public/games/g/manifest.json', { ...MANIFEST, name: 'G2' });
    expect(gameHash(root, 'g')).not.toBe(h1); // manifest 变更即过期
    const h2 = gameHash(root, 'g');
    put(root, 'docs/design/g/requests.md', '### 工单回执一条');
    expect(gameHash(root, 'g')).toBe(h2); // 工单池台账不入指纹（回执/批注不作废复查·2026-07-17 修）
    put(root, 'docs/design/g/gdd.md', '# 设计变更');
    expect(gameHash(root, 'g')).not.toBe(h2); // 设计档变更仍然即过期（gdd/plan 真影响复查有效性）
  }));
});

describe('美术关子状态（复用五步条口径·MOCK 不算完成）', () => {
  const ledger = (rows, artStyle = {}) => ({ version: 1, artStyle, rows });
  it('无台账=dim·全 approved 无 mock=ok·有 MOCK=warn 且明说', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    expect(artSubState(root, 'g').state).toBe('dim');
    put(root, 'public/games/g/art/art-ledger.json', ledger([{ no: 'art-01', status: 'approved', gen: { mock: false } }], { packId: 'pixel-retro' }));
    expect(artSubState(root, 'g').state).toBe('ok');
    put(root, 'public/games/g/art/art-ledger.json', ledger([{ no: 'art-01', status: 'approved', gen: {} }, { no: 'art-02', status: 'replaced', gen: { mock: true } }]));
    const s = artSubState(root, 'g');
    expect(s.state).toBe('warn');
    expect(s.detail).toContain('MOCK 1');
  }));
});

describe('看板推导（机器门×复查门×人门三验·REQ-QC-三门）', () => {
  it('证据新鲜+复查+签核=绿；缺复查=黄；exit≠0=红；指纹变=过期黄', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    const h = gameHash(root, 'g');
    put(root, pipelineFile(root, 'g').slice(root.length + 1), {
      version: 1, slug: 'g',
      concept: { name: 'G', pitch: '测试', planWaiver: '纯数据' },
      signoffs: { S1: { by: 'o', note: 'n', at: '2026-07-10T00:00:00Z' }, S3: { by: 'o', note: 'n', at: '2026-07-10T00:00:00Z' } },
      evidence: { S3: { exit: 0, gameHash: h, at: '2026-07-10T00:00:00Z' }, S4: { exit: 1, gameHash: h, at: '2026-07-10T00:00:00Z' } },
      reviews: { S3: { verdict: 'PASS', note: '逐条核过', by: 'r', at: '2026-07-10T00:00:00Z', gameHash: h } },
    });
    let b = boardFor(root, 'g');
    const by = (id) => b.stages.find((s) => s.id === id);
    expect(by('S1').status).toBe('ok'); // 机器 ok + 签核 ok（S1 免复查）
    expect(by('S2').status).toBe('warn'); // 免 plan 裁决在案但未复查未签核
    expect(by('S3').status).toBe('ok'); // 证据绿 + 复查 PASS + 签核 → 三门齐才绿
    expect(by('S4').status).toBe('fail'); // exit 1 = 红
    expect(by('S8').status).toBe('dim'); // 未跑未查未签
    expect(b.next).toBe('S2'); // 第一个非绿即下一步
    // 游戏文件一动 → S3 证据过期（绿不是永久绿）
    put(root, 'public/games/g/manifest.json', { ...MANIFEST, name: 'G3' });
    b = boardFor(root, 'g');
    expect(b.stages.find((s) => s.id === 'S3').status).toBe('warn');
    expect(b.stages.find((s) => s.id === 'S3').machine.detail).toContain('过期');
  }));
  it('builtin 无 walkthrough 测试=玩法关直接红（testing.md 红线）·cart 免审计', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    const b = boardFor(root, 'g');
    expect(b.stages.find((s) => s.id === 'S4').status).toBe('fail');
    put(root, 'library/c/manifest.json', MANIFEST);
    const bc = boardFor(root, 'c');
    expect(bc.stages.find((s) => s.id === 'S5').machine.state).toBe('ok'); // 纯数据卡带天然合规
    expect(bc.form).toBe('cart');
  }));
  it('未知游戏 → ok:false', () => withRoot(async (root) => {
    expect(boardFor(root, 'ghost').ok).toBe(false);
  }));
});

describe('mockDebt（cart 终检的 mock 清账判据·REQ-WORKSHOP C2）', () => {
  const ledger = (rows) => ({ version: 1, rows });
  it('无台账=0 · 有 mock 行=计数 · retired 的 mock 行不计', () => withRoot(async (root) => {
    put(root, 'library/g/manifest.json', MANIFEST);
    expect(mockDebt(root, 'g')).toBe(0); // 无台账（纯免费库 placeholder）=清账
    put(root, 'public/games/g/art/art-ledger.json', ledger([
      { no: 'art-01', status: 'generated', gen: { mock: true } },
      { no: 'art-02', status: 'replaced', gen: { mock: true } },
      { no: 'art-03', status: 'replaced', gen: { mock: false } },
      { no: 'art-04', status: 'retired', gen: { mock: true } }, // 墓碑不计
    ]));
    expect(mockDebt(root, 'g')).toBe(2);
  }));
});

describe('writeConcept（立项卡写入·CLI 与端点共用·REQ-WORKSHOP C1）', () => {
  it('写后 S1 机器门绿；字段级合并（只传 pitch 不覆盖已有 name）', () => withRoot(async (root) => {
    put(root, 'library/g/manifest.json', MANIFEST);
    writeConcept(root, 'g', { name: 'G 游戏', pitch: '一句话玩法' });
    let b = boardFor(root, 'g');
    expect(b.stages.find((s) => s.id === 'S1').machine.state).toBe('ok');
    expect(b.concept).toMatchObject({ name: 'G 游戏', pitch: '一句话玩法' }); // board 带 concept（S1 编辑预填）
    writeConcept(root, 'g', { pitch: '改口的玩法' });
    b = boardFor(root, 'g');
    expect(b.concept).toMatchObject({ name: 'G 游戏', pitch: '改口的玩法' }); // name 未被抹掉
  }));
});

describe('cart-S8 证据双轨（cart=gameHash·builtin=head·REQ-WORKSHOP C2）', () => {
  it('cart 的 S8 证据带 gameHash：新鲜=ok·游戏文件一动=过期', () => withRoot(async (root) => {
    put(root, 'library/c/manifest.json', MANIFEST);
    const h = gameHash(root, 'c');
    put(root, pipelineFile(root, 'c').slice(root.length + 1), {
      version: 1, slug: 'c', concept: {}, signoffs: {},
      evidence: { S8: { exit: 0, gameHash: h, at: '2026-07-11T00:00:00Z' } },
    });
    let b = boardFor(root, 'c');
    expect(b.stages.find((s) => s.id === 'S8').machine.state).toBe('ok');
    put(root, 'library/c/manifest.json', { ...MANIFEST, name: 'C2' });
    b = boardFor(root, 'c');
    expect(b.stages.find((s) => s.id === 'S8').machine.detail).toContain('过期');
  }));
  it('builtin 的 S8 证据仍走 head 语义（回归）；cart 的 S8 dim 文案=轻量终检', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    put(root, pipelineFile(root, 'g').slice(root.length + 1), {
      version: 1, slug: 'g', concept: {}, signoffs: {},
      evidence: { S8: { exit: 0, head: 'not-current-head', dirty: false, at: '2026-07-11T00:00:00Z' } },
    });
    const b = boardFor(root, 'g');
    expect(b.stages.find((s) => s.id === 'S8').machine.detail).toContain('过期'); // head 不匹配（fixture 无 git → head=''）
    put(root, 'library/c/manifest.json', MANIFEST);
    const bc = boardFor(root, 'c');
    expect(bc.stages.find((s) => s.id === 'S8').machine.detail).toContain('轻量终检');
  }));
});

// ═══ F·阶段顺序闸（REQ-GATE-硬化·「跳关可以，但从悄悄跳变记录在案的决定」）═══
describe('priorGaps / orderGate（顺序闸判定·纯函数）', () => {
  // 合成看板：S1 灰（欠机器门+人门）、S2 黄（欠复查门）、S3 绿。
  const board = {
    stages: [
      { id: 'S1', title: '立项卡', status: 'dim', machine: { state: 'dim' }, review: { state: 'ok' }, human: { state: 'dim' } },
      { id: 'S2', title: '能力计划', status: 'warn', machine: { state: 'ok' }, review: { state: 'dim' }, human: { state: 'ok' } },
      { id: 'S3', title: '骨架关', status: 'ok', machine: { state: 'ok' }, review: { state: 'ok' }, human: { state: 'ok' } },
      { id: 'S4', title: '玩法关', status: 'dim', machine: { state: 'dim' }, review: { state: 'dim' }, human: { state: 'dim' } },
    ],
  };
  it('列出前置非绿关+各关欠的门；已绿关不列', () => {
    const gaps = priorGaps(board, 'S4');
    expect(gaps.map((g) => g.id)).toEqual(['S1', 'S2']); // S3 绿被跳过
    expect(gaps[0].owes.join()).toContain('机器门');
    expect(gaps[0].owes.join()).toContain('人门');
    expect(gaps[1].owes.join()).toContain('复查门');
  });
  it('目标=S1 或全前置绿 → 无欠（gate 可直跑）', () => {
    expect(priorGaps(board, 'S1')).toEqual([]);
    const allGreen = { stages: board.stages.map((s) => ({ ...s, status: 'ok', machine: { state: 'ok' }, review: { state: 'ok' }, human: { state: 'ok' } })) };
    expect(priorGaps(allGreen, 'S4')).toEqual([]);
  });
  it('有欠+无理由 → 拒跑；有欠+带理由 → 放行且生成落痕记录', () => {
    expect(orderGate(board, 'S4', undefined).allowed).toBe(false);
    expect(orderGate(board, 'S4', '   ').allowed).toBe(false); // 空白理由不算
    const ok = orderGate(board, 'S4', '赶 demo 先跑玩法关');
    expect(ok.allowed).toBe(true);
    expect(ok.outOfOrder).toMatchObject({ stage: 'S4', reason: '赶 demo 先跑玩法关' });
    expect(ok.outOfOrder.at).toBeTruthy();
  });
  it('前置全绿 → allowed 且无落痕（不冤记乱序）', () => {
    const allGreen = { stages: board.stages.map((s) => ({ ...s, status: 'ok' })) };
    const d = orderGate(allGreen, 'S4', '理由');
    expect(d.allowed).toBe(true);
    expect(d.outOfOrder).toBeUndefined();
  });
});

describe('boardFor 乱序标记（板消费 outOfOrder·旧板零回归）', () => {
  it('pf.outOfOrder → 对应关 outOfOrder 非空·其余关为 null', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    put(root, pipelineFile(root, 'g').slice(root.length + 1), {
      version: 1, slug: 'g', concept: {}, signoffs: {},
      outOfOrder: [{ stage: 'S5', reason: '设计验证优先', at: '2026-07-17T00:00:00Z' }],
    });
    const b = boardFor(root, 'g');
    expect(b.stages.find((s) => s.id === 'S5').outOfOrder).toMatchObject({ reason: '设计验证优先' });
    expect(b.stages.find((s) => s.id === 'S3').outOfOrder).toBeNull();
  }));
  it('旧 pipeline.json 无 outOfOrder 字段 → 全关 outOfOrder=null（零回归）', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    put(root, pipelineFile(root, 'g').slice(root.length + 1), { version: 1, slug: 'g', concept: {}, signoffs: {} });
    const b = boardFor(root, 'g');
    expect(b.stages.every((s) => s.outOfOrder === null)).toBe(true);
  }));
});

// ═══ S4 验收剧本门（REQ-ACCEPT·图纸④·「绿门不可玩」复盘）═══
describe('acceptanceScenarioCount / S4 存在性门', () => {
  it('无 acceptance 目录=0·计 *.scenario.jsonc·忽略其它文件', () => withRoot(async (root) => {
    put(root, 'src/games/g/index.ts', '// compiled');
    expect(acceptanceScenarioCount(root, 'g')).toBe(0);
    put(root, 'docs/design/g/acceptance/a.scenario.jsonc', '{}');
    put(root, 'docs/design/g/acceptance/b.scenario.jsonc', '{}');
    put(root, 'docs/design/g/acceptance/readme.md', '# 说明');
    put(root, 'docs/design/g/acceptance/notes.json', '{}'); // 非 .scenario.jsonc 不计
    expect(acceptanceScenarioCount(root, 'g')).toBe(2);
    put(root, 'docs/design/g/acceptance/c.scenario.jsonc', '{}');
    expect(acceptanceScenarioCount(root, 'g')).toBe(MIN_ACCEPTANCE_SCENARIOS);
  }));
  it('MIN=3；S4 板提示随场景数变（0/3（GD 补）→ 3/3 ✓）', () => withRoot(async (root) => {
    expect(MIN_ACCEPTANCE_SCENARIOS).toBe(3);
    put(root, 'public/games/g/manifest.json', MANIFEST); // builtin·无 walkthrough → S4 fail 但 detail 带剧本提示
    let s4 = boardFor(root, 'g').stages.find((s) => s.id === 'S4');
    expect(s4.machine.detail).toContain('验收剧本 0/3（GD 补）');
    for (const n of ['a', 'b', 'c']) put(root, `docs/design/g/acceptance/${n}.scenario.jsonc`, '{}');
    s4 = boardFor(root, 'g').stages.find((s) => s.id === 'S4');
    expect(s4.machine.detail).toContain('验收剧本 3/3 ✓');
  }));
  it('复查清单 S4 含「剧本作者=GD 非 PE」+「真浏览器试玩截图序列」两行', () => {
    const joined = REVIEW_CHECKLISTS.S4.join('\n');
    expect(joined).toContain('剧本作者=GD 非 PE');
    expect(joined).toContain('真浏览器试玩截图序列');
  });
});

// ═══ S4/S5 自证门（REQ-SELFCHECK·图纸①②·「自己玩自己看对照策划」）═══
describe('selfCheckArtifacts / selfCheckBlock（自证产物存在性·纯 fs）', () => {
  const shots = (root, slug, names) => names.forEach((n) => put(root, `docs/design/${slug}/self-check/shots/${n}`, 'img'));
  it('无目录=空盘点·计 png/jpg/jpeg·忽略非图片·子目录递归计入', () => withRoot(async (root) => {
    put(root, 'src/games/g/index.ts', '// compiled');
    expect(selfCheckArtifacts(root, 'g', 'S4')).toMatchObject({ ok: false, hasAlignment: false, shots: 0 });
    shots(root, 'g', ['01.png', '02.PNG', '03.jpg', '04.jpeg']);
    put(root, 'docs/design/g/self-check/shots/notes.md', '# 不是图'); // 非图片不计
    expect(selfCheckArtifacts(root, 'g', 'S4').shots).toBe(4);
    shots(root, 'g', ['r2/05.png']); // 按轮分子目录也算（手册要求「每轮都做」）
    expect(selfCheckArtifacts(root, 'g', 'S4').shots).toBe(MIN_SELFCHECK_SHOTS);
    expect(selfCheckArtifacts(root, 'g', 'S4').ok).toBe(false); // 图够了但对齐单还缺
    put(root, 'docs/design/g/self-check/S4-alignment.md', '# 对齐单');
    expect(selfCheckArtifacts(root, 'g', 'S4').ok).toBe(true);
    expect(selfCheckArtifacts(root, 'g', 'S5').ok).toBe(false); // 对齐单逐关独立（S5 未做）
  }));
  it('MIN=5；判词点名缺什么（缺单/图不足各自点名·齐活=null 放行）', () => withRoot(async (root) => {
    expect(MIN_SELFCHECK_SHOTS).toBe(5);
    put(root, 'src/games/g/index.ts', '// compiled');
    const b0 = selfCheckBlock(selfCheckArtifacts(root, 'g', 'S4'), 'S4');
    expect(b0).toContain('自证未做');
    expect(b0).toContain('self-check.md'); // 点名手册
    expect(b0).toContain('缺策划对齐单 S4-alignment.md');
    expect(b0).toContain('截图 0/5');
    put(root, 'docs/design/g/self-check/S4-alignment.md', '# 对齐单');
    shots(root, 'g', ['01.png', '02.png']);
    const b1 = selfCheckBlock(selfCheckArtifacts(root, 'g', 'S4'), 'S4');
    expect(b1).not.toContain('缺策划对齐单');
    expect(b1).toContain('截图 2/5');
    shots(root, 'g', ['03.png', '04.png', '05.png']);
    expect(selfCheckBlock(selfCheckArtifacts(root, 'g', 'S4'), 'S4')).toBeNull();
  }));
});

describe('selfCheckNote 新鲜度（图纸②·绑 gameHash·⚠提示不硬拦）', () => {
  it('缺产物=✗·齐活=✓·快照指纹与现指纹不符=⚠过期', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    expect(selfCheckNote(root, 'g', 'S4', undefined, gameHash(root, 'g'))).toContain('自证 ✗');
    put(root, 'docs/design/g/self-check/S4-alignment.md', '# 对齐单');
    for (const n of ['1', '2', '3', '4', '5']) put(root, `docs/design/g/self-check/shots/${n}.png`, 'img');
    const h = gameHash(root, 'g');
    expect(selfCheckNote(root, 'g', 'S4', { at: '2026-07-29T00:00:00Z', gameHash: h }, h)).toContain('自证 ✓');
    expect(selfCheckNote(root, 'g', 'S4', { at: '2026-07-29T00:00:00Z', gameHash: 'stale-hash' }, h)).toContain('⚠');
    expect(selfCheckNote(root, 'g', 'S4', { gameHash: 'stale-hash' }, h)).toContain('过期');
    expect(selfCheckNote(root, 'g', 'S4', {}, h)).toContain('自证 ✓'); // 无快照字段=不冤判过期
  }));
  it('板 S4/S5 机器门提示带自证态；cart 的 S5（天然免审计）不加自证提示', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    const stage = (slug, id) => boardFor(root, slug).stages.find((s) => s.id === id);
    expect(stage('g', 'S4').machine.detail).toContain('自证 ✗');
    expect(stage('g', 'S5').machine.detail).toContain('自证 ✗');
    put(root, 'library/c/manifest.json', MANIFEST);
    expect(stage('c', 'S5').machine.detail).not.toContain('自证');
    expect(stage('c', 'S4').machine.detail).toContain('自证 ✗'); // 卡带的玩法关同受自证约束
  }));
  it('复查清单 S4/S5 各含「对齐单抽样重走 ≥3 条」+「好玩三问」行', () => {
    for (const stage of ['S4', 'S5']) {
      const joined = REVIEW_CHECKLISTS[stage].join('\n');
      expect(joined).toContain('自证对齐单抽样重走 ≥3 条');
      expect(joined).toContain('⚠降格行的裁决去向');
      expect(joined).toContain('好玩三问');
    }
  });
});

// CLI 端到端：真跑 game-pipeline.mjs（APOLLO_PIPELINE_ROOT 注入临时根·不碰真仓库）。
const CLI = fileURLToPath(new URL('./game-pipeline.mjs', import.meta.url));
const runCli = (root, args) => spawnSync('node', [CLI, ...args], { env: { ...process.env, APOLLO_PIPELINE_ROOT: root }, encoding: 'utf8' });

describe('gate 顺序闸 CLI（真退出码+落痕+板 ⚠·REQ-GATE-硬化 F 点名）', () => {
  // 编译期 fixture：src/games/<slug> 目录存在（compiled）·空立项卡 → S1/S2 非绿。
  //   gate S3 对编译期游戏=「免 manifest 校验」exit0（不 spawn 重活）——放行路径便宜可测。
  const mkFixture = () => { const r = mkdtempSync(join(tmpdir(), 'ord-cli-')); mkdirSync(join(r, 'src', 'games', 'g'), { recursive: true }); return r; };

  it('前关欠 → gate 拒跑（退出码非 0 + stderr 指名欠项）', () => {
    const root = mkFixture();
    try {
      const r = runCli(root, ['gate', 'g', 'S3']);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('顺序闸');
      expect(r.stderr).toContain('S1'); // 指名前置欠关
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('--out-of-order → 放行·pipeline.json 落 outOfOrder 痕·board 显 ⚠乱序', () => {
    const root = mkFixture();
    try {
      const g = runCli(root, ['gate', 'g', 'S3', '--out-of-order', '赶 demo 骨架先跑']);
      expect(g.status).toBe(0);
      const pf = JSON.parse(readFileSync(join(root, 'public', 'games', 'g', 'pipeline.json'), 'utf8'));
      expect(pf.outOfOrder).toEqual([expect.objectContaining({ stage: 'S3', reason: '赶 demo 骨架先跑' })]);
      const b = runCli(root, ['board', 'g']);
      expect(b.stdout).toContain('⚠乱序');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('旧板（无 outOfOrder 字段）board 正常出图·无 ⚠（零回归）', () => {
    const root = mkFixture();
    try {
      const d = join(root, 'public', 'games', 'g');
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'pipeline.json'), JSON.stringify({ version: 1, slug: 'g', concept: { name: 'G', pitch: 'p' }, signoffs: {} }));
      const b = runCli(root, ['board', 'g']);
      expect(b.status).toBe(0);
      expect(b.stdout).not.toContain('⚠乱序');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  // REQ-ACCEPT·图纸④：S4 门存在性检查（<3 场景直接拒·不空转跑重活·此路径在 spawn 前返回·temp root 可测）。
  it('S4 gate：验收剧本 <3 → 拒过·点名「验收剧本不足（GD 补）」（不空转跑 vitest）', () => {
    const root = mkFixture();
    try {
      const r = runCli(root, ['gate', 'g', 'S4', '--out-of-order', '测 S4 存在性门']);
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toContain('验收剧本不足');
      const pf = JSON.parse(readFileSync(join(root, 'public', 'games', 'g', 'pipeline.json'), 'utf8'));
      expect(pf.evidence.S4.exit).not.toBe(0); // 落证据=红
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  // REQ-SELFCHECK·图纸①：自证产物缺 → S4/S5 门在 spawn 前拒（点名「自证未做·见 self-check.md」）。
  const putSelfCheck = (root, slug, stage) => {
    put(root, `docs/design/${slug}/self-check/${stage}-alignment.md`, '# 对齐单\n- 承诺 A ✅对齐');
    for (const n of ['01', '02', '03', '04', '05']) put(root, `docs/design/${slug}/self-check/shots/${n}.png`, 'img');
  };
  const putScenarios = (root, slug) => {
    for (const n of ['a', 'b', 'c']) put(root, `docs/design/${slug}/acceptance/${n}.scenario.jsonc`, JSON.stringify({ name: n, game: slug, seed: 1, steps: [{ tick: 1 }] }));
  };

  it('S4 gate：剧本够但自证产物缺 → 拒过·点名「自证未做」+手册（未进 conformance 重活）', () => {
    const root = mkFixture();
    try {
      putScenarios(root, 'g');
      const r = runCli(root, ['gate', 'g', 'S4', '--out-of-order', '测 S4 自证门']);
      expect(r.status).not.toBe(0);
      const out = r.stdout + r.stderr;
      expect(out).toContain('自证未做');
      expect(out).toContain('self-check.md');
      expect(out).not.toContain('conformance'); // 在 spawn 前就拒了（不空转跑重活）
      const pf = JSON.parse(readFileSync(join(root, 'public', 'games', 'g', 'pipeline.json'), 'utf8'));
      expect(pf.evidence.S4.exit).not.toBe(0);
      expect(pf.selfCheck).toBeUndefined(); // 产物不齐不记快照
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('S5 gate：自证产物缺 → 拒过·点名 S5-alignment.md；补齐后放行且落自证快照（绑 gameHash）', () => {
    const root = mkFixture();
    try {
      const bad = runCli(root, ['gate', 'g', 'S5', '--out-of-order', '测 S5 自证门']);
      expect(bad.status).not.toBe(0);
      expect(bad.stdout + bad.stderr).toContain('S5-alignment.md');
      putSelfCheck(root, 'g', 'S5');
      const ok = runCli(root, ['gate', 'g', 'S5', '--out-of-order', '测 S5 自证门放行']);
      const pf = JSON.parse(readFileSync(join(root, 'public', 'games', 'g', 'pipeline.json'), 'utf8'));
      expect(ok.stdout + ok.stderr).not.toContain('自证未做'); // 已越过自证门（后续 audit 红是另一回事）
      expect(pf.selfCheck.S5).toMatchObject({ shots: 5 });
      expect(pf.selfCheck.S5.gameHash).toBeTruthy(); // 新鲜度锚（图纸②）
      const b = runCli(root, ['board', 'g']);
      expect(b.stdout).toContain('自证 ✓');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60_000);

  // Lead 验收加固：≥3 场景后 gate 真进 conformance——temp 根注入下 runner 根须对齐（绝对脚本路径 +
  // APOLLO_ACCEPTANCE_ROOT 透传），落红须是真判词（缺 adapter），不许是脚本找不到的崩溃尾巴。
  it('S4 gate：3 场景 + 自证齐 → conformance 真判红（点名缺 adapter·非崩溃式落红）', () => {
    const root = mkFixture();
    try {
      putScenarios(root, 'g');
      putSelfCheck(root, 'g', 'S4');
      const r = runCli(root, ['gate', 'g', 'S4', '--out-of-order', '测 conformance 根对齐']);
      expect(r.status).not.toBe(0);
      const out = r.stdout + r.stderr;
      expect(out).toContain('conformance 未过');
      expect(out).toContain('缺 adapter'); // runner 的真实判词穿透到 gate 摘要（根对齐生效）
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 120_000);
});
