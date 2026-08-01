import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Launch, Transform, Velocity, Tag } from '@engine/protocol/components.js';
import { launchCapability } from './launch.js';

const ENEMY = 1 << 1;
const xf = (x: number, y: number): Transform => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 });

function launchWorld(): World {
  const w = new World();
  for (const s of launchCapability.systems) w.addSystem(s);
  return w;
}
const vel = (w: World, id: string): Velocity | undefined => w.getComponent<Velocity>(id, 'Velocity');
const hasLaunch = (w: World, id: string): boolean => w.getComponent<Launch>(id, 'Launch') !== undefined;

describe('launch — 直线弹定向初速', () => {
  it('runsBefore motion-apply（先定速再积分）', () => {
    expect(launchCapability.systems[0].runsBefore).toContain('motion-apply');
  });

  it("toward:'dir' 固定方向 → 归一化 × speed", () => {
    const w = launchWorld();
    w.createEntity('bolt');
    w.addComponent('bolt', xf(0, 0));
    w.addComponent('bolt', { type: 'Launch', speed: 10, toward: 'dir', dirX: 3, dirY: 4 } as Launch); // 3-4-5
    w.tick();
    const v = vel(w, 'bolt')!;
    expect(v.vx).toBeCloseTo(6); // 3/5*10
    expect(v.vy).toBeCloseTo(8); // 4/5*10
    expect(hasLaunch(w, 'bolt')).toBe(false); // 一次性，已自删
  });

  it("toward:'target' → 朝最近 ENEMY，速度模长=speed", () => {
    const w = launchWorld();
    w.createEntity('fireball');
    w.addComponent('fireball', xf(0, 0));
    w.addComponent('fireball', { type: 'Launch', speed: 5, toward: 'target', targetMask: ENEMY } as Launch);
    w.createEntity('mob');
    w.addComponent('mob', xf(10, 0)); // 正右方
    w.addComponent('mob', { type: 'Tag', flags: ENEMY } as Tag);
    w.tick();
    const v = vel(w, 'fireball')!;
    expect(v.vx).toBeCloseTo(5); // 朝 +x，模长 5
    expect(v.vy).toBeCloseTo(0);
    expect(hasLaunch(w, 'fireball')).toBe(false);
  });

  it('无目标 → fizzle（零速度 + 自删 Launch，靠 lifetime 回收）', () => {
    const w = launchWorld();
    w.createEntity('dud');
    w.addComponent('dud', xf(0, 0));
    w.addComponent('dud', { type: 'Launch', speed: 5, toward: 'target', targetMask: ENEMY } as Launch); // 场上无 ENEMY
    w.tick();
    const v = vel(w, 'dud')!;
    expect(v.vx).toBe(0);
    expect(v.vy).toBe(0);
    expect(hasLaunch(w, 'dud')).toBe(false);
  });
});

describe('launch — fallbackDir（薄加性·零回归）', () => {
  it('无目标 + 有 fallbackDir → 沿它发射（归一化×speed），不冻结', () => {
    const w = launchWorld();
    w.createEntity('bolt');
    w.addComponent('bolt', xf(0, 0));
    w.addComponent('bolt', {
      type: 'Launch', speed: 5, toward: 'target', targetMask: ENEMY, fallbackDir: { x: 0, y: 2 },
    } as Launch); // 场上无 ENEMY，但声明了兜底方向
    w.tick();
    const v = vel(w, 'bolt')!;
    expect(v.vx).toBeCloseTo(0);
    expect(v.vy).toBeCloseTo(5); // 归一化 (0,2)→(0,1) × speed 5
    expect(hasLaunch(w, 'bolt')).toBe(false);
  });

  it('无目标 + 无 fallbackDir → 维持现行为（清零速度冻结原地，零回归）', () => {
    const w = launchWorld();
    w.createEntity('dud');
    w.addComponent('dud', xf(0, 0));
    w.addComponent('dud', { type: 'Launch', speed: 5, toward: 'target', targetMask: ENEMY } as Launch);
    w.tick();
    const v = vel(w, 'dud')!;
    expect(v.vx).toBe(0);
    expect(v.vy).toBe(0);
  });

  it('有目标时 fallbackDir 不生效（正常索敌优先）', () => {
    const w = launchWorld();
    w.createEntity('fireball');
    w.addComponent('fireball', xf(0, 0));
    w.addComponent('fireball', {
      type: 'Launch', speed: 5, toward: 'target', targetMask: ENEMY, fallbackDir: { x: 0, y: 1 },
    } as Launch);
    w.createEntity('mob');
    w.addComponent('mob', xf(10, 0));
    w.addComponent('mob', { type: 'Tag', flags: ENEMY } as Tag);
    w.tick();
    const v = vel(w, 'fireball')!;
    expect(v.vx).toBeCloseTo(5); // 朝目标 +x，未被 fallbackDir 覆盖
    expect(v.vy).toBeCloseTo(0);
  });
});
