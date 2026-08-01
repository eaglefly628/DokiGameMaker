import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Steering, Transform, Velocity, Relation, Status, Perception, Tag } from '@engine/protocol/components.js';
import { steeringCapability } from './steering.js';
import { motionApplyCapability } from '@skills/tier1/index.js';
import { aggroCapability } from '@skills/tier3/index.js';

const PLAYER = 1 << 1;
const FROZEN = 1 << 0;
const xf = (x: number, y: number): Transform => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const vel = (w: World, e: string): Velocity => w.getComponent<Velocity>(e, 'Velocity')!;
const pos = (w: World, e: string): Transform => w.getComponent<Transform>(e, 'Transform')!;

// steering(定速) + motion-apply(积分)。手注 Relation(target) 隔离测 steering。
function world(): World {
  const w = new World();
  for (const s of steeringCapability.systems) w.addSystem(s);
  for (const s of motionApplyCapability.systems) w.addSystem(s);
  return w;
}
function target(w: World, id: string, x: number, y: number): void {
  w.createEntity(id);
  w.addComponent(id, xf(x, y));
}
function agent(w: World, id: string, x: number, y: number, s: Omit<Steering, 'type'>, targetId?: string): void {
  w.createEntity(id);
  w.addComponent(id, xf(x, y));
  w.addComponent(id, { type: 'Steering', ...s } as Steering);
  if (targetId) w.addComponent(id, { type: 'Relation', kind: 'target', targetId } as Relation);
}

describe('steering — 元数据 / 定序', () => {
  it('id 正确 + runsBefore motion-apply', () => {
    expect(steeringCapability.id).toBe('t2-steering');
    expect(steeringCapability.systems[0].runsBefore).toContain('motion-apply');
  });
});

describe('steering — seek / flee / idle', () => {
  it('seek：朝 Relation(target) 移动，到 stopRange 停', () => {
    const w = world();
    target(w, 'p', 100, 0);
    agent(w, 'm', 0, 0, { mode: 'seek', speed: 2, stopRange: 10 }, 'p');
    w.tick();
    expect(vel(w, 'm').vx).toBe(2);
    for (let i = 0; i < 60; i++) w.tick();
    expect(pos(w, 'm').x).toBe(90); // 停在 stopRange
    expect(vel(w, 'm').vx).toBe(0);
  });

  it('flee：远离目标', () => {
    const w = world();
    target(w, 'p', 100, 0);
    agent(w, 'm', 0, 0, { mode: 'flee', speed: 3, stopRange: 0 }, 'p');
    w.tick();
    expect(vel(w, 'm').vx).toBe(-3);
  });

  it('无 Relation(target) → idle 停', () => {
    const w = world();
    agent(w, 'm', 0, 0, { mode: 'seek', speed: 2, stopRange: 10 }); // 无 target
    w.tick();
    expect(vel(w, 'm').vx).toBe(0);
    expect(pos(w, 'm').x).toBe(0);
  });

  it('haltStatusMask：被冻结 → 停（CC 定身）', () => {
    const w = world();
    target(w, 'p', 100, 0);
    agent(w, 'm', 0, 0, { mode: 'seek', speed: 2, stopRange: 10, haltStatusMask: FROZEN }, 'p');
    w.addComponent('m', { type: 'Status', flags: FROZEN } as Status);
    w.tick();
    expect(vel(w, 'm').vx).toBe(0);
    expect(pos(w, 'm').x).toBe(0);
  });
});

describe('aggro + steering = ai-chase（纯数据组合，对齐周期表）', () => {
  it('挂 Perception+Steering 的怪自动锁玩家并追逐（行为=数据装配，零 AI 代码）', () => {
    const w = new World();
    for (const s of aggroCapability.systems) w.addSystem(s);
    for (const s of steeringCapability.systems) w.addSystem(s);
    for (const s of motionApplyCapability.systems) w.addSystem(s);

    // 玩家（静止）。
    w.createEntity('hero');
    w.addComponent('hero', xf(60, 0));
    w.addComponent('hero', { type: 'Tag', flags: PLAYER } as Tag);

    // 怪：感知 + 转向（纯数据），无任何 AI 系统代码。
    w.createEntity('mob');
    w.addComponent('mob', xf(0, 0));
    w.addComponent('mob', { type: 'Perception', targetTag: PLAYER, sightRadius: 0 } as Perception);
    w.addComponent('mob', { type: 'Steering', mode: 'seek', speed: 1, stopRange: 10 } as Steering);

    for (let i = 0; i < 60; i++) w.tick();
    // aggro 锁定 hero → steering 追到 stopRange(10) 停 → x=50。
    expect(w.getComponent<Relation>('mob', 'Relation')).toMatchObject({ kind: 'target', targetId: 'hero' });
    expect(pos(w, 'mob').x).toBe(50);
  });

  it('确定性：多怪追逐同初值重跑一致', () => {
    const build = (): World => {
      const w = new World();
      for (const s of aggroCapability.systems) w.addSystem(s);
      for (const s of steeringCapability.systems) w.addSystem(s);
      for (const s of motionApplyCapability.systems) w.addSystem(s);
      w.createEntity('hero');
      w.addComponent('hero', xf(50, 50));
      w.addComponent('hero', { type: 'Tag', flags: PLAYER } as Tag);
      for (const [id, x, y, sp] of [['m1', 0, 0, 1], ['m2', 100, 100, 2]] as const) {
        w.createEntity(id);
        w.addComponent(id, xf(x, y));
        w.addComponent(id, { type: 'Perception', targetTag: PLAYER, sightRadius: 0 } as Perception);
        w.addComponent(id, { type: 'Steering', mode: 'seek', speed: sp, stopRange: 5 } as Steering);
      }
      return w;
    };
    const run = (): string => {
      const w = build();
      for (let i = 0; i < 20; i++) w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});

describe('steering — 群体分离 (separation·REQ-SURVIVOR群体①)', () => {
  const ENEMY = 1 << 3;

  it('分离：两个同群 agent 追同一目标 → 垂直斥开（不塌成一点）', () => {
    const w = world();
    target(w, 'p', 100, 0);
    agent(w, 'A', 0, 0, { mode: 'seek', speed: 3, stopRange: 5, separation: { radius: 10, weight: 2 } }, 'p');
    agent(w, 'B', 0, 2, { mode: 'seek', speed: 3, stopRange: 5, separation: { radius: 10, weight: 2 } }, 'p');
    w.tick();
    expect(vel(w, 'A').vy).toBeLessThan(0);
    expect(vel(w, 'B').vy).toBeGreaterThan(0);
    expect(vel(w, 'A').vx).toBeGreaterThan(0);
  });

  it('零回归：无 separation → 纯 seek（vx=speed·vy=0·不被邻居推）', () => {
    const w = world();
    target(w, 'p', 100, 0);
    agent(w, 'A', 0, 0, { mode: 'seek', speed: 3, stopRange: 5 }, 'p');
    agent(w, 'B', 0, 2, { mode: 'seek', speed: 3, stopRange: 5 }, 'p');
    w.tick();
    expect(vel(w, 'A').vx).toBe(3);
    expect(vel(w, 'A').vy).toBe(0);
  });

  it('clamp：分离叠加后速度模长不超过 speed', () => {
    const w = world();
    target(w, 'p', 100, 0);
    agent(w, 'A', 0, 0, { mode: 'seek', speed: 3, stopRange: 5, separation: { radius: 10, weight: 99 } }, 'p');
    agent(w, 'B', 0, 1, { mode: 'seek', speed: 3, stopRange: 5, separation: { radius: 10, weight: 99 } }, 'p');
    w.tick();
    const v = vel(w, 'A');
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(3, 6);
  });

  it('tagMask：只被带该 Tag 的邻居斥、不被无 tag 邻居斥', () => {
    const wNo = world();
    target(wNo, 'p', 100, 0);
    agent(wNo, 'A', 0, 0, { mode: 'seek', speed: 3, stopRange: 5, separation: { radius: 10, weight: 2, tagMask: ENEMY } }, 'p');
    wNo.createEntity('deco');
    wNo.addComponent('deco', xf(0, 2));
    wNo.tick();
    expect(vel(wNo, 'A').vy).toBe(0);

    const wYes = world();
    target(wYes, 'p', 100, 0);
    agent(wYes, 'A', 0, 0, { mode: 'seek', speed: 3, stopRange: 5, separation: { radius: 10, weight: 2, tagMask: ENEMY } }, 'p');
    wYes.createEntity('foe');
    wYes.addComponent('foe', xf(0, 2));
    wYes.addComponent('foe', { type: 'Tag', flags: ENEMY } as Tag);
    wYes.tick();
    expect(vel(wYes, 'A').vy).toBeLessThan(0);
  });

  it('stopRange 环绕：到攻击距离(base v=0)仍分离、不叠一点', () => {
    const w = world();
    target(w, 'p', 100, 0);
    agent(w, 'A', 98, 0, { mode: 'seek', speed: 3, stopRange: 5, separation: { radius: 10, weight: 2 } }, 'p');
    agent(w, 'B', 98, 2, { mode: 'seek', speed: 3, stopRange: 5, separation: { radius: 10, weight: 2 } }, 'p');
    w.tick();
    expect(vel(w, 'A').vy).toBeLessThan(0);
    expect(vel(w, 'B').vy).toBeGreaterThan(0);
  });

  it('确定性：同布局两次 → 同速度', () => {
    const build = (): World => {
      const w = world();
      target(w, 'p', 100, 0);
      for (const [id, y] of [['A', 0], ['B', 2], ['C', 4], ['D', 6]] as const) {
        agent(w, id, 0, y, { mode: 'seek', speed: 3, stopRange: 5, separation: { radius: 20, weight: 1.5 } }, 'p');
      }
      return w;
    };
    const run = (): string => {
      const w = build();
      for (let i = 0; i < 10; i++) w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});
