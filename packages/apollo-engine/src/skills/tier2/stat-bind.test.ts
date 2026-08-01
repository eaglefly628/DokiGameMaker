import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { statBindCapability, projectStatBind } from './stat-bind.js';
import { modifierStackCapability } from './modifier-stack.js';
import { statsCapability } from './stats.js';
import { steeringCapability } from './steering.js';
import { hitboxCapability } from './hitbox.js';
import { effectApplyCapability } from './effect-apply.js';
import { casterCapability } from '@skills/tier3/index.js';
import { timerCapability, resourceCapability, controllableCapability } from '@atom-skills/index.js';
import type {
  StatBind,
  ModifierTotals,
  ModifierSource,
  Stats,
  Controllable,
  Hitbox,
  Resource,
  Timer,
} from '@engine/protocol/components.js';

// stat-bind（REQ-SURVIVOR被动轴）：属性桥/投影器纯函数核 + Commit 相位系统。对齐 skills 1:1 测试文化。
// 覆盖：set/mul/add/div 各投影、幂等防复利、缺源/缺目标跳过不崩、端到端读到 modifier-stack 产出的
// ModifierTotals、确定性、以及与 modifier-stack/stats/steering/hitbox/caster/timer/resource 同装的撞环回归。

function world(): World {
  const w = new World();
  for (const s of statBindCapability.systems) w.addSystem(s);
  return w;
}

// 注：调用方须已 createEntity(eid)（本 helper 只挂 StatBind 组件，不重复建实体）。
function bind(w: World, eid: string, bindings: StatBind['bindings']): void {
  w.addComponent(eid, { type: 'StatBind', bindings } as StatBind);
}

function totalsSink(w: World, eid: string, totals: Record<string, number | boolean>): void {
  w.createEntity(eid);
  w.addComponent(eid, { type: 'ModifierTotals', totals } as ModifierTotals);
}

describe('stat-bind.projectStatBind —— 幂等投影纯函数核', () => {
  it('set：目标 = 源值（忽略 base）', () => {
    expect(projectStatBind('set', 999, 7)).toBe(7);
  });
  it('mul：目标 = base × 源值', () => {
    expect(projectStatBind('mul', 3, 2)).toBe(6);
    expect(projectStatBind('mul', undefined, 5)).toBe(5); // base 缺省 1
  });
  it('add：目标 = base + 源值', () => {
    expect(projectStatBind('add', 60, 4)).toBe(64);
    expect(projectStatBind('add', undefined, 4)).toBe(4); // base 缺省 0
  });
  it('div：目标 = base ÷ 源值（攻速→冷却逆映射）；防除零回退 base', () => {
    expect(projectStatBind('div', 60, 2)).toBe(30);
    expect(projectStatBind('div', 60, 0)).toBe(60); // 除零回退 base
    expect(projectStatBind('div', undefined, 0)).toBe(0); // base 缺省 0
  });
});

describe('stat-bind 系统 —— ModifierTotals 源投影', () => {
  it('mul：Controllable.speed = base × totals.moveSpeed', () => {
    const w = world();
    totalsSink(w, 'sink', { moveSpeed: 2 });
    w.createEntity('hero');
    w.addComponent('hero', { type: 'Controllable', playerId: 'p1', speed: 999 } as Controllable);
    bind(w, 'hero', [{ source: 'ModifierTotals', key: 'moveSpeed', component: 'Controllable', field: 'speed', op: 'mul', base: 3 }]);
    w.tick();
    expect(w.getComponent<Controllable>('hero', 'Controllable')!.speed).toBe(6); // 3×2
  });

  it('add：Hitbox.amount = base + totals.bonusDmg', () => {
    const w = world();
    totalsSink(w, 'sink', { bonusDmg: 4 });
    w.createEntity('blade');
    w.addComponent('blade', { type: 'Hitbox', resource: 'hp', amount: 10 } as Hitbox);
    bind(w, 'blade', [{ source: 'ModifierTotals', key: 'bonusDmg', component: 'Hitbox', field: 'amount', op: 'add', base: 10 }]);
    w.tick();
    expect(w.getComponent<Hitbox>('blade', 'Hitbox')!.amount).toBe(14);
  });

  it('div：Timer.duration = base ÷ totals.attackSpeed（攻速越高冷却越短）', () => {
    const w = world();
    totalsSink(w, 'sink', { attackSpeed: 2 });
    w.createEntity('gun');
    w.addComponent('gun', { type: 'Timer', id: 'cd', elapsed: 0, duration: 999, loop: true } as Timer);
    bind(w, 'gun', [{ source: 'ModifierTotals', key: 'attackSpeed', component: 'Timer', field: 'duration', op: 'div', base: 60 }]);
    w.tick();
    expect(w.getComponent<Timer>('gun', 'Timer')!.duration).toBe(30); // 60/2
  });

  it('set：Resource.max = totals.maxHp（无 base）', () => {
    const w = world();
    totalsSink(w, 'sink', { maxHp: 150 });
    w.createEntity('unit');
    w.addComponent('unit', { type: 'Resource', id: 'hp', current: 50, min: 0, max: 100 } as Resource);
    bind(w, 'unit', [{ source: 'ModifierTotals', key: 'maxHp', component: 'Resource', field: 'max', op: 'set' }]);
    w.tick();
    expect(w.getComponent<Resource>('unit', 'Resource')!.max).toBe(150);
  });
});

describe('stat-bind 系统 —— Stats(本实体 effective) 源投影', () => {
  it('读本实体 Stats.effective[key]，不读全局', () => {
    const w = world();
    w.createEntity('hero');
    w.addComponent('hero', { type: 'Stats', base: { moveSpeed: 2 }, mods: [], effective: { moveSpeed: 5 } } as Stats);
    w.addComponent('hero', { type: 'Controllable', playerId: 'p1', speed: 0 } as Controllable);
    bind(w, 'hero', [{ source: 'Stats', key: 'moveSpeed', component: 'Controllable', field: 'speed', op: 'set' }]);
    w.tick();
    expect(w.getComponent<Controllable>('hero', 'Controllable')!.speed).toBe(5);
  });
});

describe('stat-bind —— 幂等投影（防复利，第一坑）', () => {
  it('mul binding 连跑 100 tick，目标字段稳定 = base×v，不随 tick 数漂移', () => {
    const w = world();
    totalsSink(w, 'sink', { moveSpeed: 2 });
    w.createEntity('hero');
    w.addComponent('hero', { type: 'Controllable', playerId: 'p1', speed: 1 } as Controllable);
    bind(w, 'hero', [{ source: 'ModifierTotals', key: 'moveSpeed', component: 'Controllable', field: 'speed', op: 'mul', base: 3 }]);
    for (let i = 0; i < 100; i++) {
      w.tick();
      expect(w.getComponent<Controllable>('hero', 'Controllable')!.speed).toBe(6); // 3×2，每 tick 都精确落回同一个值
    }
  });
});

describe('stat-bind —— 缺源/缺目标 → 跳过不崩', () => {
  it('世界无 ModifierTotals 单例 → 该 binding 跳过，目标字段保留原值，不抛错', () => {
    const w = world();
    w.createEntity('hero');
    w.addComponent('hero', { type: 'Controllable', playerId: 'p1', speed: 42 } as Controllable);
    bind(w, 'hero', [{ source: 'ModifierTotals', key: 'moveSpeed', component: 'Controllable', field: 'speed', op: 'mul', base: 3 }]);
    expect(() => w.tick()).not.toThrow();
    expect(w.getComponent<Controllable>('hero', 'Controllable')!.speed).toBe(42); // 未被改动
  });

  it('totals 里没有该 key → 该 binding 跳过', () => {
    const w = world();
    totalsSink(w, 'sink', { otherKey: 9 });
    w.createEntity('hero');
    w.addComponent('hero', { type: 'Controllable', playerId: 'p1', speed: 7 } as Controllable);
    bind(w, 'hero', [{ source: 'ModifierTotals', key: 'moveSpeed', component: 'Controllable', field: 'speed', op: 'set' }]);
    w.tick();
    expect(w.getComponent<Controllable>('hero', 'Controllable')!.speed).toBe(7);
  });

  it('本实体无 Stats 组件（source:Stats）→ 跳过', () => {
    const w = world();
    w.createEntity('hero');
    w.addComponent('hero', { type: 'Controllable', playerId: 'p1', speed: 7 } as Controllable);
    bind(w, 'hero', [{ source: 'Stats', key: 'moveSpeed', component: 'Controllable', field: 'speed', op: 'set' }]);
    expect(() => w.tick()).not.toThrow();
    expect(w.getComponent<Controllable>('hero', 'Controllable')!.speed).toBe(7);
  });

  it('目标组件不存在 → 跳过，绝不代创建', () => {
    const w = world();
    totalsSink(w, 'sink', { maxHp: 200 });
    w.createEntity('unit'); // 无 Resource 组件
    bind(w, 'unit', [{ source: 'ModifierTotals', key: 'maxHp', component: 'Resource', field: 'max', op: 'set' }]);
    expect(() => w.tick()).not.toThrow();
    expect(w.getComponent('unit', 'Resource')).toBeUndefined(); // 未被代创建
  });
});

describe('stat-bind —— 端到端：读到 modifier-stack 产出的 ModifierTotals', () => {
  function e2eWorld(): World {
    const w = new World();
    for (const s of modifierStackCapability.systems) w.addSystem(s);
    for (const s of statBindCapability.systems) w.addSystem(s);
    return w;
  }

  it('ModifierSource 聚合 → ModifierTotals → stat-bind 投影 → Controllable.speed', () => {
    const w = e2eWorld();
    w.createEntity('buff1');
    w.addComponent('buff1', { type: 'ModifierSource', id: 'haste', target: 'moveSpeed', op: 'add', value: 1 } as ModifierSource);
    w.createEntity('buff2');
    w.addComponent('buff2', { type: 'ModifierSource', id: 'boots', target: 'moveSpeed', op: 'mul', value: 2 } as ModifierSource);
    totalsSink(w, 'sink', {});
    w.createEntity('hero');
    w.addComponent('hero', { type: 'Controllable', playerId: 'p1', speed: 0 } as Controllable);
    bind(w, 'hero', [{ source: 'ModifierTotals', key: 'moveSpeed', component: 'Controllable', field: 'speed', op: 'mul', base: 3 }]);

    w.tick();
    // totals.moveSpeed = (0+1)×2 = 2（modifier-stack 应用序 add→mul）；Controllable.speed = 3×2 = 6。
    expect(w.getComponent<ModifierTotals>('sink', 'ModifierTotals')!.totals.moveSpeed).toBe(2);
    expect(w.getComponent<Controllable>('hero', 'Controllable')!.speed).toBe(6);
  });

  it('确定性：同布局跑两遍 → snapshot 相等', () => {
    const run = (): string => {
      const w = e2eWorld();
      w.createEntity('buff1');
      w.addComponent('buff1', { type: 'ModifierSource', id: 'a', target: 'range', op: 'add', value: 5 } as ModifierSource);
      totalsSink(w, 'sink', {});
      w.createEntity('unit');
      w.addComponent('unit', { type: 'Resource', id: 'hp', current: 80, min: 0, max: 100 } as Resource);
      bind(w, 'unit', [{ source: 'ModifierTotals', key: 'range', component: 'Resource', field: 'max', op: 'mul', base: 10 }]);
      for (let i = 0; i < 10; i++) w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});

describe('stat-bind —— 撞环回归（第二坑）', () => {
  // 真撞环过（不是假设）：最初把 stat-bind 留在 Update 相位、靠 runsAfter 打破"modifier-stack 读
  // Resource/Timer 而 stat-bind 又写 Resource/Timer"的传递环，结果撞上 hitbox 自带
  // runsBefore:['resource-apply']（伤害同帧落地）+ steering 自带 runsBefore:['hitbox']（CC 读上一拍
  // Status）两条既有显式边，怎么排都会跟其中一条首尾相接成环（topological-sort.ts 报
  // "Circular dependency detected among systems"）。真正的解是跳出 Update 相位——见 stat-bind.ts
  // 文件头"定序·第二坑"整段注释：stat-bind 改用 SystemPhase.Commit（同 jump/effect-apply/craft-recipe
  // 的"基于本 tick 解算结果的最终写入"），phase 分桶零跨相位边，自动排在全部 Update 相位系统之后，
  // 零 runsAfter、零环，且对未来任何新增 Update 系统天然免疫。
  it('与 modifier-stack/stats/steering/hitbox/caster/timer/resource/controllable 同装 · 可 tick', () => {
    const w = new World();
    for (const cap of [
      modifierStackCapability,
      statsCapability,
      steeringCapability,
      hitboxCapability,
      casterCapability,
      timerCapability,
      resourceCapability,
      controllableCapability,
      statBindCapability,
    ]) {
      for (const s of cap.systems) w.addSystem(s);
    }
    expect(() => {
      for (let i = 0; i < 5; i++) w.tick();
    }).not.toThrow();
  });

  it('与 effect-apply（game-103 蓝图实装·Commit 相位 RMW Resource/Timer）同装 + maxHp→Resource/attackSpeed→Timer binding · 不成环', () => {
    // 这一例锁死 Lead 收紧 reads 的修复：stat-bind 只 write 不 read 目标组件（纯投影器）。
    // 旧写法把 Resource/Timer 放进 reads → 与同为 Commit 相位 RMW Resource/Timer 的 effect-apply 多出反向读边
    // → Circular（game-103 装 effect-apply·PE 一旦加 maxHp→Resource binding 即蓝图 load 不了）。收紧后单向边、零环。
    // 不装 modifier-stack：它每 tick 从 ModifierSource 重算 ModifierTotals，会把手设的 totals 清空覆盖
    // （本例无 ModifierSource 实体）。本例只验 stat-bind(写 Resource/Timer) 与 effect-apply(Commit RMW
    // Resource/Timer) 同装不成环 + 投影落地，手设 totals 单例即可。
    const w = new World();
    for (const cap of [
      effectApplyCapability,
      resourceCapability,
      timerCapability,
      statBindCapability,
    ]) {
      for (const s of cap.systems) w.addSystem(s);
    }
    totalsSink(w, 'totals', { maxHp: 100, attackSpeed: 2 });
    w.createEntity('hero');
    w.addComponent('hero', { type: 'Resource', id: 'hp', current: 50, max: 50 } as Resource);
    w.addComponent('hero', { type: 'Timer', id: 'atk', elapsed: 0, duration: 60, loop: false } as Timer);
    bind(w, 'hero', [
      { source: 'ModifierTotals', key: 'maxHp', component: 'Resource', field: 'max', op: 'set' },
      { source: 'ModifierTotals', key: 'attackSpeed', component: 'Timer', field: 'duration', op: 'div', base: 60 },
    ]);
    expect(() => {
      for (let i = 0; i < 5; i++) w.tick();
    }).not.toThrow();
    // 投影确实落地（Commit 相位写、下一 tick 起可见）：max←100·duration←60/2=30。
    expect(w.getComponent<Resource>('hero', 'Resource')!.max).toBe(100);
    expect(w.getComponent<Timer>('hero', 'Timer')!.duration).toBe(30);
  });
});
