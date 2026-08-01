import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Signal, PrefabLibrary, HexPos, Tag, Resource, Hierarchy, SpawnRequest, Effect, Shape, Transform, Caster } from '@engine/protocol/components.js';
import { prefabCapability } from './prefab.js';
import { casterCapability } from './caster.js';
import { effectApplyCapability } from '../tier2/effect-apply.js';
import { destroyCapability } from '@atom-skills/destroy/index.js';
import { hierarchyCascadeCapability } from '../tier1/hierarchy-cascade.js';
import { hierarchyResolveCapability } from '../tier1/hierarchy-resolve.js';
import { gaugeCapability } from '../tier2/gauge.js';

// ═══════════════════════════════════════════════════════════════
//  REQ-F-032 验收：回合重置 = 纯重组 + 三处收窄扩展（零新系统）。
//  阵容槽位实体 = Caster{onSignal:'deploy', template:英雄, at:'self', overrides:{棋子的 HexPos/Tag}}（持久数据）
//  备战展开    = 发 'deploy' 信号 → N 槽各自产 SpawnRequest(带 overrides) → prefab 合并展开异构实例
//  结算清场    = Effect{onSignal:'wipe', kind:'destroy-tagged', value:阵营掩码} → 批量自销毁请求 → cascade 连挂件
//  跨回合      = 槽位无 Tag 不被清场；PrefabLibrary.seq 单调 → 每回合实例 id 唯一确定。
// ═══════════════════════════════════════════════════════════════

const ALLY = 1 << 1;
const ENEMY = 1 << 2;

type Cap = { systems: ReadonlyArray<Parameters<World['addSystem']>[0]> };
function mk(): World {
  const w = new World();
  for (const cap of [casterCapability, prefabCapability, effectApplyCapability, destroyCapability, hierarchyCascadeCapability] as unknown as Cap[]) {
    for (const s of cap.systems) w.addSystem(s);
  }
  // 模板库：单英雄模板（hp 资源 + 占位 HexPos/Tag，全部可被 overrides 改写）
  w.createEntity('lib');
  w.addComponent('lib', {
    type: 'PrefabLibrary',
    seq: 0,
    templates: {
      hero: {
        entities: {
          main: {
            Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
            HexPos: { q: 0, r: 0 },
            Tag: { flags: 0 },
            Resource: { id: 'hp', current: 100, min: 0, max: 100 },
          },
        },
      },
    },
  } as PrefabLibrary);
  return w;
}
// 阵容槽位：持久实体，自带 Caster（onSignal 释放自己的棋子）。无 Tag → 清场不波及。
function slot(w: World, id: string, q: number, r: number, side: number): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as never);
  w.addComponent(id, {
    type: 'Caster', onSignal: 'deploy', template: 'hero', at: 'self',
    overrides: { main: { HexPos: { q, r }, Tag: { flags: side } } },
  } as never);
}
function signal(w: World, name: string): void {
  w.createEntity(`sig:${name}`);
  w.addComponent(`sig:${name}`, { type: 'Signal', name, source: `sig:${name}` } as Signal);
}
const unsignal = (w: World, name: string) => w.destroyEntity(`sig:${name}`);
const alive = (w: World, id: string) => w.getAllEntities().includes(id);
const tagged = (w: World, mask: number) =>
  w.getAllEntities().filter((e) => ((w.getComponent<Tag>(e, 'Tag')?.flags ?? 0) & mask) !== 0);

describe('REQ-F-032 · overrides：同模板展开异构实例', () => {
  it('SpawnRequest.overrides 由 prefab 逐字段合并；未覆盖字段保模板值；模板本体不被污染', () => {
    const w = mk();
    w.createEntity('req');
    w.addComponent('req', {
      type: 'SpawnRequest', templateId: 'hero', x: 10, y: 20,
      overrides: { main: { HexPos: { q: 5, r: 2 }, Resource: { current: 30 } } },
    } as SpawnRequest);
    w.tick();
    const id = 'hero#0:main';
    expect(alive(w, id)).toBe(true);
    expect(w.getComponent<HexPos>(id, 'HexPos')).toMatchObject({ q: 5, r: 2 }); // 覆盖生效
    const res = w.getComponent<Resource>(id, 'Resource')!;
    expect(res.current).toBe(30); // 覆盖字段
    expect(res.max).toBe(100); // 未覆盖字段保模板值
    // 模板隔离：库里的模板数据未被改写
    const lib = w.getComponent<PrefabLibrary>('lib', 'PrefabLibrary')!;
    expect((lib.templates.hero.entities.main.HexPos as { q: number }).q).toBe(0);
  });

  it('Caster.overrides 原样透传：槽位实体展开自己的棋子到指定格/阵营', () => {
    const w = mk();
    slot(w, 'slot1', 3, 4, ALLY);
    signal(w, 'deploy');
    w.tick();
    unsignal(w, 'deploy');
    const id = 'hero#0:main';
    expect(alive(w, id)).toBe(true);
    expect(w.getComponent<HexPos>(id, 'HexPos')).toMatchObject({ q: 3, r: 4 });
    expect(w.getComponent<Tag>(id, 'Tag')!.flags).toBe(ALLY);
  });
});

describe('REQ-F-032 · 回合循环：展开 → 清场 → 再展开', () => {
  it('N 槽同信号各自展开；destroy-tagged 按阵营清场（连挂件）；槽位幸存；次回合 id 全新', () => {
    const w = mk();
    slot(w, 'slotA', 1, 1, ALLY);
    slot(w, 'slotB', 2, 1, ALLY);
    slot(w, 'slotE', 5, 5, ENEMY);
    // 清场效果（常驻数据，等 wipe 信号）：两条 Effect 分别清两个阵营
    w.createEntity('fxA');
    w.addComponent('fxA', { type: 'Effect', onSignal: 'wipe', kind: 'destroy-tagged', targetId: '', value: ALLY } as Effect);
    w.createEntity('fxE');
    w.addComponent('fxE', { type: 'Effect', onSignal: 'wipe', kind: 'destroy-tagged', targetId: '', value: ENEMY } as Effect);

    // —— 回合 1：备战展开 ——
    signal(w, 'deploy');
    w.tick();
    unsignal(w, 'deploy');
    const r1 = [...tagged(w, ALLY | ENEMY)].sort();
    expect(r1).toHaveLength(3); // 三槽三棋
    expect(new Set(r1).size).toBe(3); // id 唯一
    // 给一个实例挂"名牌"子实体（模拟 PE 的挂件）——清场应被 cascade 连带
    w.createEntity('nameplate');
    w.addComponent('nameplate', { type: 'Hierarchy', parentId: r1[0], localX: 0, localY: -20, localRotation: 0, localScaleX: 1, localScaleY: 1 } as Hierarchy);

    // —— 结算：清场 ——
    signal(w, 'wipe');
    w.tick(); // Commit 写下全部 DestroyRequest
    unsignal(w, 'wipe');
    w.tick(); // 次拍 cascade 传播 + destroy-apply 移除
    for (const id of r1) expect(alive(w, id)).toBe(false); // 双方棋子全清
    expect(alive(w, 'nameplate')).toBe(false); // 挂件级联
    expect(alive(w, 'slotA')).toBe(true); // 阵容（槽位）持久
    expect(alive(w, 'slotE')).toBe(true);
    expect(alive(w, 'lib')).toBe(true);

    // —— 回合 2：重新展开 ——
    signal(w, 'deploy');
    w.tick();
    unsignal(w, 'deploy');
    const r2 = [...tagged(w, ALLY | ENEMY)].sort();
    expect(r2).toHaveLength(3);
    for (const id of r2) expect(r1).not.toContain(id); // seq 单调 → 新实例 id 全新（确定性可重放）
    expect(w.getComponent<HexPos>(r2.find((i) => w.getComponent<Tag>(i, 'Tag')!.flags === ENEMY)!, 'HexPos')).toMatchObject({ q: 5, r: 5 });
  });

  it('REQ-F-033 复合预制：@local: 内部引用重映射 —— 名牌/血条随展开而生、随单位而动、随清场而灭', () => {
    const w = mk();
    for (const cap of [hierarchyResolveCapability, gaugeCapability] as unknown as Cap[]) {
      for (const s of cap.systems) w.addSystem(s);
    }
    // 复合模板：单位 + 名牌子体 + 血条子体（内部引用全用 @local:main）
    const lib = w.getComponent<PrefabLibrary>('lib', 'PrefabLibrary')!;
    lib.templates.squad = {
      entities: {
        main: {
          Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
          Tag: { flags: ALLY },
          Resource: { id: 'hp', current: 40, min: 0, max: 100 },
        },
        nameplate: {
          Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
          Hierarchy: { parentId: '@local:main', localX: 0, localY: -30, localRotation: 0, localScaleX: 1, localScaleY: 1 },
        },
        hpbar: {
          Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
          Hierarchy: { parentId: '@local:main', localX: 0, localY: -22, localRotation: 0, localScaleX: 1, localScaleY: 1 },
          Shape: { kind: 'box', width: 40, height: 4 },
          Gauge: { resourceId: 'hp', fromParent: true, width: 40 },
        },
        // sidecar 也必须挂 Hierarchy{parentId:'@local:main'}：级联只沿 Hierarchy 边走（F-026 契约），
        // 只有 originEntity 引用的话清场后会幸存成孤儿——一实体两处 @local: 引用在此一并验证。
        ult: {
          Caster: { onSignal: 'ult', template: 'hero', at: 'self', originEntity: '@local:main' },
          Hierarchy: { parentId: '@local:main', localX: 0, localY: 0, localRotation: 0, localScaleX: 1, localScaleY: 1 },
          Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        },
      },
    };
    w.createEntity('req');
    w.addComponent('req', { type: 'SpawnRequest', templateId: 'squad', x: 100, y: 50 } as SpawnRequest);
    w.tick();
    const main = 'squad#0:main', plate = 'squad#0:nameplate', bar = 'squad#0:hpbar', ult = 'squad#0:ult';
    // 重映射：引用指向兄弟实例真名（不再是字面 'main'）
    expect(w.getComponent<Hierarchy>(plate, 'Hierarchy')!.parentId).toBe(main);
    expect(w.getComponent<Caster>(ult, 'Caster')!.originEntity).toBe(main);
    // 随单位而动 + gauge 读到父 hp（40/100 → 16px）：复合体活链
    expect(w.getComponent<Transform>(plate, 'Transform')!.y).toBe(50 - 30);
    expect(w.getComponent<Shape>(bar, 'Shape')!.width).toBe(16);
    // 多实例隔离：再展开一只，名牌指自己的 main（seq=1），不串
    w.createEntity('req2');
    w.addComponent('req2', { type: 'SpawnRequest', templateId: 'squad', x: 0, y: 0 } as SpawnRequest);
    w.tick();
    expect(w.getComponent<Hierarchy>('squad#1:nameplate', 'Hierarchy')!.parentId).toBe('squad#1:main');
    // 随清场而灭：destroy-tagged 只点名 main（带 Tag），挂件经 cascade 全部级联——孤儿不再永生
    w.createEntity('fx');
    w.addComponent('fx', { type: 'Effect', onSignal: 'wipe', kind: 'destroy-tagged', targetId: '', value: ALLY } as Effect);
    signal(w, 'wipe');
    w.tick();
    unsignal(w, 'wipe');
    w.tick();
    for (const id of [main, plate, bar, ult, 'squad#1:main', 'squad#1:nameplate']) expect(alive(w, id)).toBe(false);
  });

  it('REQ-F-033 边界：未知后缀保留原样（typo 显眼）；overrides 补丁值同样过重映射（槽位可改指向）', () => {
    const w = mk();
    const lib = w.getComponent<PrefabLibrary>('lib', 'PrefabLibrary')!;
    lib.templates.pair = {
      entities: {
        a: { Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } },
        b: { Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, Hierarchy: { parentId: '@local:nosuch', localX: 0, localY: 0, localRotation: 0, localScaleX: 1, localScaleY: 1 } },
      },
    };
    w.createEntity('req');
    w.addComponent('req', {
      type: 'SpawnRequest', templateId: 'pair', x: 0, y: 0,
      overrides: { b: { Hierarchy: { parentId: '@local:a' } } }, // 槽位补丁改指向 → 同享重映射
    } as SpawnRequest);
    w.tick();
    expect(w.getComponent<Hierarchy>('pair#0:b', 'Hierarchy')!.parentId).toBe('pair#0:a');
    // 不带补丁再展开：未知后缀 '@local:nosuch' 原样保留（不静默指向错误实体）
    w.createEntity('req2');
    w.addComponent('req2', { type: 'SpawnRequest', templateId: 'pair', x: 0, y: 0 } as SpawnRequest);
    w.tick();
    expect(w.getComponent<Hierarchy>('pair#1:b', 'Hierarchy')!.parentId).toBe('@local:nosuch');
  });

  it('destroy-tagged 不误伤：掩码不命中者与无 Tag 实体幸存', () => {
    const w = mk();
    w.createEntity('bystander'); // 无 Tag
    w.createEntity('other');
    w.addComponent('other', { type: 'Tag', flags: 1 << 6 } as Tag); // 别的阵营
    w.createEntity('victim');
    w.addComponent('victim', { type: 'Tag', flags: ALLY } as Tag);
    w.createEntity('fx');
    w.addComponent('fx', { type: 'Effect', onSignal: 'wipe', kind: 'destroy-tagged', targetId: '', value: ALLY } as Effect);
    signal(w, 'wipe');
    w.tick();
    unsignal(w, 'wipe');
    w.tick();
    expect(alive(w, 'victim')).toBe(false);
    expect(alive(w, 'other')).toBe(true);
    expect(alive(w, 'bystander')).toBe(true);
  });
});

// ── REQ-F-046/048①：升星合成 + 超员保额清场（PrefabOrigin 出身戳家族） ──
import { mergeRuleCapability } from './merge-rule.js';
import type { MergeRule, PrefabOrigin } from '@engine/protocol/components.js';
describe('REQ-F-046 · merge-rule N 换 1 升星', () => {
  const mkMerge = (): World => {
    const w = mk();
    for (const s of (mergeRuleCapability as unknown as Cap).systems) w.addSystem(s);
    const lib = w.getComponent<PrefabLibrary>('lib', 'PrefabLibrary')!;
    lib.templates.g1 = { entities: { main: { Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, Tag: { flags: ALLY }, Resource: { id: 'hp', current: 100, min: 0, max: 100 } } } };
    lib.templates.g2 = { entities: { main: { Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, Tag: { flags: ALLY }, Resource: { id: 'hp', current: 240, min: 0, max: 240 } } } };
    w.createEntity('mr');
    w.addComponent('mr', { type: 'MergeRule', template: 'g1', need: 3, into: 'g2' } as MergeRule);
    return w;
  };
  // 唯一 id 用确定性单调计数器（原为 Math.random，仅作唯一键·非测随机 → 换固定序号防测试代码裸随机，见 test-hygiene-check）。
  let reqSeq = 0;
  const buy = (w: World, n: number) => { for (let i = 0; i < n; i++) { const c = `req${reqSeq++}`; w.createEntity(c); w.addComponent(c, { type: 'SpawnRequest', templateId: 'g1', x: i * 10, y: 0 } as SpawnRequest); } };
  const countT = (w: World, t: string) => w.getAllEntities().filter((e) => w.getComponent<PrefabOrigin>(e, 'PrefabOrigin')?.templateId === t).length;

  it('凑 3 → 最老 3 个原子替换为 g2（锚在最老位置）；第 4 个不动；封顶无规则即止', () => {
    const w = mkMerge();
    buy(w, 2);
    w.tick(); // 展开 2 个 g1（seq 0,1）
    w.tick(); // merge 读上一拍实例：2 < 3 不合
    expect(countT(w, 'g1')).toBe(2);
    buy(w, 2); // 第 3、4 个
    w.tick(); // 展开（seq 2,3）
    w.tick(); // merge：取 seq 0,1,2 → 替换；prefab 同拍展开 g2
    w.tick(); // destroy-apply 上拍已清；再走一拍稳定
    expect(countT(w, 'g1')).toBe(1); // 第 4 个幸存
    expect(countT(w, 'g2')).toBe(1); // 升星产物
    const g2e = w.getAllEntities().find((e) => w.getComponent<PrefabOrigin>(e, 'PrefabOrigin')?.templateId === 'g2')!;
    expect(w.getComponent<Transform>(g2e, 'Transform')!.x).toBe(0); // 锚在最老（seq0 @ x=0）
  });
});

// ── REQ-F-049：部署门（Caster.requireHexPos）+ 出身格继承（SpawnRequest.originHex + '@origin-hex' 哨兵）──
describe('REQ-F-049 · 在板才出兵 + 实例落在持位者的格', () => {
  const mkSlot = (w: World, id: string, opts: { hex?: { q: number; r: number }; overrides?: object } = {}): void => {
    w.createEntity(id);
    w.addComponent(id, { type: 'Transform', x: 50, y: 60, rotation: 0, scaleX: 1, scaleY: 1 } as never);
    if (opts.hex) w.addComponent(id, { type: 'HexPos', ...opts.hex } as never);
    w.addComponent(id, {
      type: 'Caster', onSignal: 'deploy', template: 'hero', at: 'self', requireHexPos: true,
      overrides: opts.overrides ?? { main: { HexPos: '@origin-hex', Tag: { flags: ALLY } } },
    } as never);
  };

  it('部署门：锚点无 HexPos（在席）收信号静默；有 HexPos（在板）正常展开', () => {
    const w = mk();
    mkSlot(w, 'benched'); // 无 HexPos
    signal(w, 'deploy');
    w.tick();
    unsignal(w, 'deploy');
    expect(tagged(w, ALLY)).toHaveLength(0); // 在席不出兵
    w.addComponent('benched', { type: 'HexPos', q: 2, r: 3 } as never); // 拖上板（drag-place 同款写法）
    signal(w, 'deploy');
    w.tick();
    unsignal(w, 'deploy');
    expect(tagged(w, ALLY)).toHaveLength(1); // 上板即出兵
  });

  it("'@origin-hex' 哨兵：实例 HexPos=持位者当拍格（模板有 HexPos 整体覆写；显式静态 overrides 不受影响）", () => {
    const w = mk();
    mkSlot(w, 'slot1', { hex: { q: 4, r: 5 } });
    signal(w, 'deploy');
    w.tick();
    unsignal(w, 'deploy');
    const id = 'hero#0:main';
    expect(w.getComponent<HexPos>(id, 'HexPos')).toMatchObject({ q: 4, r: 5 }); // 哨兵代入持位者格
    // 持位者挪格（拖拽调位语义）→ 下次展开跟手
    const hp = w.getComponent<HexPos>('slot1', 'HexPos')!;
    hp.q = 6; hp.r = 1;
    signal(w, 'deploy');
    w.tick();
    unsignal(w, 'deploy');
    expect(w.getComponent<HexPos>('hero#1:main', 'HexPos')).toMatchObject({ q: 6, r: 1 });
  });

  it('哨兵补建：模板**无** HexPos 的实体也可经哨兵上板（仅哨兵路径建缺件）；无 originHex 则整条跳过', () => {
    const w = mk();
    const lib = w.getComponent<PrefabLibrary>('lib', 'PrefabLibrary')!;
    lib.templates.marker = { entities: { seat: { Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, Tag: { flags: ALLY } } } }; // 模板不带 HexPos
    // 路径 A：请求带 originHex → 补建
    w.createEntity('reqA');
    w.addComponent('reqA', { type: 'SpawnRequest', templateId: 'marker', x: 0, y: 0, originHex: { q: 3, r: 3 }, overrides: { seat: { HexPos: '@origin-hex' } } } as SpawnRequest);
    // 路径 B：同模板无 originHex → 哨兵跳过，不建半截组件
    w.createEntity('reqB');
    w.addComponent('reqB', { type: 'SpawnRequest', templateId: 'marker', x: 10, y: 0, overrides: { seat: { HexPos: '@origin-hex' } } } as SpawnRequest);
    w.tick();
    expect(w.getComponent<HexPos>('marker#0:seat', 'HexPos')).toMatchObject({ q: 3, r: 3 });
    expect(w.getComponent<HexPos>('marker#1:seat', 'HexPos')).toBeUndefined();
  });

  it('merge-rule 出身格继承：板上 3 连合成 → 产物留在最老实例的格（席上合成无格→产物留席）', async () => {
    const w = mk();
    const { mergeRuleCapability: mrc } = await import('./merge-rule.js');
    for (const s of (mrc as unknown as Cap).systems) w.addSystem(s);
    const lib = w.getComponent<PrefabLibrary>('lib', 'PrefabLibrary')!;
    lib.templates.m1 = { entities: { seat: { Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, Tag: { flags: ALLY } } } };
    lib.templates.m2 = { entities: { seat: { Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, Tag: { flags: ALLY } } } };
    w.createEntity('mr');
    w.addComponent('mr', { type: 'MergeRule', template: 'm1', need: 3, into: 'm2', intoOverrides: { seat: { HexPos: '@origin-hex' } } } as MergeRule);
    for (let i = 0; i < 3; i++) {
      w.createEntity(`r${i}`);
      w.addComponent(`r${i}`, { type: 'SpawnRequest', templateId: 'm1', x: i * 10, y: 0 } as SpawnRequest);
    }
    w.tick(); // 展开 3 个 m1
    w.addComponent('m1#0:seat', { type: 'HexPos', q: 5, r: 2 } as never); // 最老那只在板上（拖上板语义）
    w.tick(); // merge：销 3 spawn 1（originHex=最老实例的格）
    w.tick();
    const m2 = w.getAllEntities().find((e) => w.getComponent<PrefabOrigin>(e, 'PrefabOrigin')?.templateId === 'm2')!;
    expect(m2).toBeTruthy();
    expect(w.getComponent<HexPos>(m2, 'HexPos')).toMatchObject({ q: 5, r: 2 }); // 产物继承板位
  });
});

describe('REQ-F-048① · destroy-tagged keepResource 超员保额', () => {
  it('保最老 N 个（按 seq 升序），清多余=入场逆序', () => {
    const w = mk();
    const lib = w.getComponent<PrefabLibrary>('lib', 'PrefabLibrary')!;
    lib.templates.u = { entities: { main: { Tag: { flags: ALLY }, Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } } } };
    for (let i = 0; i < 5; i++) { w.createEntity(`q${i}`); w.addComponent(`q${i}`, { type: 'SpawnRequest', templateId: 'u', x: 0, y: 0 } as SpawnRequest); }
    w.tick(); // 5 实例（seq 0..4）
    w.createEntity('cap'); w.addComponent('cap', { type: 'Resource', id: 'unit_cap', current: 3, min: 0, max: 9 } as Resource);
    w.createEntity('fx'); w.addComponent('fx', { type: 'Effect', onSignal: 'enforce_cap', kind: 'destroy-tagged', targetId: '', value: ALLY, keepResource: 'unit_cap' } as Effect);
    signal(w, 'enforce_cap');
    w.tick(); // Commit 写请求（保 seq 0,1,2；清 3,4）
    unsignal(w, 'enforce_cap');
    w.tick();
    const seqs = w.getAllEntities()
      .map((e) => w.getComponent<PrefabOrigin>(e, 'PrefabOrigin'))
      .filter((p): p is PrefabOrigin => !!p && p.templateId === 'u')
      .map((p) => p.seq).sort();
    expect(seqs).toEqual([0, 1, 2]); // 最老 3 个幸存，最新 2 个被卖
  });
});
