import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { WeightedSpawn, Resource, Transform, Signal, RandomSeed, SpawnRequest, PrefabLibrary, Shape, Clickable, InputQueue } from '@engine/protocol/components.js';
import { weightedSpawnCapability } from './weighted-spawn.js';
import { craftRecipeCapability } from './craft-recipe.js';
import { effectApplyCapability } from './effect-apply.js';
import { eventWhenCapability } from './event-when.js';
import { clickableCapability } from './clickable.js';
import {
  resourceCapability, destroyCapability, flagCapability, timerCapability,
  transformCapability, tagCapability, shapeCapability, colorCapability, spriteCapability,
} from '@atom-skills/index.js';
import { lifetimeCapability } from '@skills/tier1/index.js';
import { prefabCapability, casterCapability } from '@skills/tier3/index.js';

// weighted-spawn 系统级测试：afford 原子性 / 确定性抽 / 分布 / 落点 / 空表兜底 / 撞环回归。
function worldWithWS(): World {
  const w = new World();
  for (const s of weightedSpawnCapability.systems) w.addSystem(s);
  return w;
}

const xf = (x: number, y: number): Transform => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 });

function gen(w: World, id: string, ws: Omit<WeightedSpawn, 'type'>, t: Transform = xf(0, 0)): void {
  w.createEntity(id);
  w.addComponent(id, t);
  w.addComponent(id, { type: 'WeightedSpawn', ...ws } as WeightedSpawn);
}
function res(w: World, eid: string, id: string, current: number, min = 0, max = Infinity): void {
  w.addComponent(eid, { type: 'Resource', id, current, min, max } as Resource);
}
function seed(w: World, id: string, s: number): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'RandomSeed', seed: s, sequence: 0 } as RandomSeed);
}
function signal(w: World, name: string): void {
  const e = `sig:${name}`;
  if (!w.hasComponent(e, 'Signal')) w.createEntity(e);
  w.addComponent(e, { type: 'Signal', name, source: e } as Signal);
}
const sr = (w: World, eid: string): SpawnRequest | undefined => w.getComponent<SpawnRequest>(eid, 'SpawnRequest');
const cur = (w: World, eid: string): number => w.getComponent<Resource>(eid, 'Resource')!.current;

describe('weighted-spawn — metadata / 定序', () => {
  it('id / Commit 相位 / runsAfter craft-recipe+effect-apply（破 Resource/RandomSeed 双 RMW 伪环）', () => {
    expect(weightedSpawnCapability.id).toBe('t2-weighted-spawn');
    expect(weightedSpawnCapability.systems[0].phase).toBe(20); // Commit
    expect(weightedSpawnCapability.systems[0].runsAfter).toEqual(expect.arrayContaining(['craft-recipe', 'effect-apply']));
    expect(weightedSpawnCapability.components.writes).toEqual(['Resource', 'RandomSeed', 'SpawnRequest']);
  });
});

describe('weighted-spawn — afford 原子性（同 craft-recipe 口径）', () => {
  it('资源不足 → 整单不动（不扣、不 spawn）', () => {
    const w = worldWithWS();
    gen(w, 'g1', { onSignal: 'tap', cost: { id: 'energy', amount: 5 }, table: [{ templateId: 'a', weight: 1 }] });
    res(w, 'g1', 'energy', 3);
    seed(w, 'rng', 1);
    signal(w, 'tap');
    w.tick();
    expect(cur(w, 'g1')).toBe(3);
    expect(sr(w, 'g1')).toBeUndefined();
  });

  it('资源够 → 扣成本（钳 min）+ spawn', () => {
    const w = worldWithWS();
    gen(w, 'g1', { onSignal: 'tap', cost: { id: 'energy', amount: 5 }, table: [{ templateId: 'a', weight: 1 }] }, xf(0, 0));
    res(w, 'g1', 'energy', 5, 0);
    seed(w, 'rng', 1);
    signal(w, 'tap');
    w.tick();
    expect(cur(w, 'g1')).toBe(0); // 5-5=0，钳在 min
    expect(sr(w, 'g1')).toMatchObject({ templateId: 'a', x: 0, y: 0 });
  });

  it('资源 id 不匹配（自身 Resource 挂的是别的资源）→ 视为不可负担，不扣不 spawn', () => {
    const w = worldWithWS();
    gen(w, 'g1', { onSignal: 'tap', cost: { id: 'energy', amount: 1 }, table: [{ templateId: 'a', weight: 1 }] });
    res(w, 'g1', 'coins', 100); // 挂的是 coins，不是 energy
    seed(w, 'rng', 1);
    signal(w, 'tap');
    w.tick();
    expect(cur(w, 'g1')).toBe(100);
    expect(sr(w, 'g1')).toBeUndefined();
  });

  it('无 cost → 只 spawn 不扣（自身若有 Resource 也不受影响）', () => {
    const w = worldWithWS();
    gen(w, 'g1', { onSignal: 'tap', table: [{ templateId: 'a', weight: 1 }] }, xf(9, 9));
    res(w, 'g1', 'energy', 10);
    seed(w, 'rng', 1);
    signal(w, 'tap');
    w.tick();
    expect(cur(w, 'g1')).toBe(10);
    expect(sr(w, 'g1')).toMatchObject({ templateId: 'a', x: 9, y: 9 });
  });

  it('table 空但 cost 够 → 仍扣成本、只是抽不出模板不 spawn（触发即计费，产出命中与否是另一回事）', () => {
    const w = worldWithWS();
    gen(w, 'g1', { onSignal: 'tap', cost: { id: 'energy', amount: 2 }, table: [] });
    res(w, 'g1', 'energy', 10);
    seed(w, 'rng', 1);
    signal(w, 'tap');
    w.tick();
    expect(cur(w, 'g1')).toBe(8); // 已扣，不回滚
    expect(sr(w, 'g1')).toBeUndefined();
  });

  it('无信号 → 什么都不做', () => {
    const w = worldWithWS();
    gen(w, 'g1', { onSignal: 'tap', cost: { id: 'energy', amount: 1 }, table: [{ templateId: 'a', weight: 1 }] });
    res(w, 'g1', 'energy', 10);
    seed(w, 'rng', 1);
    w.tick(); // 无 signal
    expect(cur(w, 'g1')).toBe(10);
    expect(sr(w, 'g1')).toBeUndefined();
  });
});

describe('weighted-spawn — 空表 / 权重全零（不崩）', () => {
  it('空表 → 不 spawn 不崩', () => {
    const w = worldWithWS();
    gen(w, 'g1', { onSignal: 'tap', table: [] });
    seed(w, 'rng', 1);
    signal(w, 'tap');
    expect(() => w.tick()).not.toThrow();
    expect(sr(w, 'g1')).toBeUndefined();
  });

  it('权重全 0 → 不 spawn 不崩', () => {
    const w = worldWithWS();
    gen(w, 'g1', { onSignal: 'tap', table: [{ templateId: 'a', weight: 0 }, { templateId: 'b', weight: 0 }] });
    seed(w, 'rng', 1);
    signal(w, 'tap');
    expect(() => w.tick()).not.toThrow();
    expect(sr(w, 'g1')).toBeUndefined();
  });

  it('无 RandomSeed → fail-closed 不抽不 spawn', () => {
    const w = worldWithWS();
    gen(w, 'g1', { onSignal: 'tap', table: [{ templateId: 'a', weight: 1 }] });
    signal(w, 'tap');
    expect(() => w.tick()).not.toThrow();
    expect(sr(w, 'g1')).toBeUndefined();
  });
});

describe('weighted-spawn — 落点 = 自身 Transform·templateId 来自 table', () => {
  it('单项表：抽必得该项；SpawnRequest 落点为自身坐标', () => {
    const w = worldWithWS();
    gen(w, 'g1', { onSignal: 'tap', table: [{ templateId: 'fish_common', weight: 1 }] }, xf(33, 44));
    seed(w, 'rng', 42);
    signal(w, 'tap');
    w.tick();
    expect(sr(w, 'g1')).toMatchObject({ templateId: 'fish_common', x: 33, y: 44 });
  });
});

describe('weighted-spawn — 确定性', () => {
  it('同世界 RandomSeed 序列 → 同抽结果', () => {
    const run = (): string | undefined => {
      const w = worldWithWS();
      gen(w, 'g1', { onSignal: 'tap', table: [{ templateId: 'a', weight: 1 }, { templateId: 'b', weight: 1 }, { templateId: 'c', weight: 1 }] });
      seed(w, 'rng', 777);
      signal(w, 'tap');
      w.tick();
      return sr(w, 'g1')?.templateId;
    };
    expect(run()).toBe(run());
  });

  it('加权分布大致对（多次抽·高权重多）', () => {
    const w = worldWithWS();
    gen(w, 'g1', { onSignal: 'tap', table: [{ templateId: 'common', weight: 9 }, { templateId: 'rare', weight: 1 }] });
    seed(w, 'rng', 999);
    signal(w, 'tap'); // Signal 无清扫系统同装，持续在场 → 每 tick 都会重触发
    const counts: Record<string, number> = { common: 0, rare: 0 };
    const N = 400;
    for (let i = 0; i < N; i++) {
      w.tick();
      const req = sr(w, 'g1');
      if (req) counts[req.templateId] = (counts[req.templateId] ?? 0) + 1;
    }
    expect(counts.common + counts.rare).toBe(N);
    expect(counts.common).toBeGreaterThan(counts.rare * 3); // 9:1 权重 → common 显著多于 rare
  });

  it('确定性：同布局双跑 snapshot 相等', () => {
    const run = (): string => {
      const w = worldWithWS();
      gen(w, 'g1', { onSignal: 'tap', cost: { id: 'energy', amount: 1 }, table: [{ templateId: 'a', weight: 3 }, { templateId: 'b', weight: 1 }] }, xf(5, 5));
      res(w, 'g1', 'energy', 20);
      seed(w, 'rng', 55);
      signal(w, 'tap');
      for (let i = 0; i < 5; i++) w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});

describe('weighted-spawn — 撞环回归（同 game101 生成器代表性能力集同装）', () => {
  it('与 spawner(prefab)/clickable/resource 等 game101 全套能力同装不成环·可 tick（真实点击链路，event-when 在场会全局清扫手注 Signal，故走 clickable 真命中）', () => {
    const w = new World();
    for (const cap of [
      // atoms
      transformCapability, tagCapability, shapeCapability, colorCapability, spriteCapability,
      resourceCapability, destroyCapability, flagCapability, timerCapability,
      // tier1
      lifetimeCapability,
      // tier2
      clickableCapability, craftRecipeCapability, effectApplyCapability, eventWhenCapability,
      weightedSpawnCapability,
      // tier3（spawner）
      prefabCapability, casterCapability,
    ]) {
      for (const s of cap.systems) w.addSystem(s);
    }
    w.createEntity('rng');
    w.addComponent('rng', { type: 'RandomSeed', seed: 1, sequence: 0 } as RandomSeed);
    w.createEntity('library');
    w.addComponent('library', { type: 'PrefabLibrary', templates: {}, seq: 0 } as PrefabLibrary);

    // 生成器实体：Clickable 命中产 tap 信号 → weighted-spawn 消费（同 game101 blueprint.ts 的生成器接线，
    // 只是把 craft-recipe+event-when+caster 三件套换成本能力一件）。
    gen(w, 'g1', { onSignal: 'tap', cost: { id: 'energy', amount: 1 }, table: [{ templateId: 'x', weight: 1 }] }, xf(10, 20));
    w.addComponent('g1', { type: 'Shape', kind: 'box', width: 20, height: 20 } as Shape);
    w.addComponent('g1', { type: 'Clickable', action: 'tap' } as Clickable);
    res(w, 'g1', 'energy', 5);
    w.createEntity('input');
    w.addComponent('input', { type: 'InputQueue', actions: [{ source: 'pointer', x: 10, y: 20, phase: 'down' }] } as InputQueue);

    // 本套件不含 input-capture（负责每帧清 InputQueue），手摆的一条点击 action 会跨 tick 持续命中——
    // 用它反而顺带验证"多 tick 连续触发+连续扣费"不崩、不越界（钳 min=0，非负）。
    expect(() => {
      for (let i = 0; i < 5; i++) w.tick();
    }).not.toThrow();
    expect(cur(w, 'g1')).toBe(0); // 5 点体力、每 tick 扣 1 → 5 tick 后耗尽，钳在 min=0（不倒扣负值）
  });
});
