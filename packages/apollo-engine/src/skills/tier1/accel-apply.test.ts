import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Velocity, Acceleration, Transform } from '@engine/protocol/components.js';
import { accelApplyCapability } from './accel-apply.js';
import { motionApplyCapability } from './motion-apply.js';

function worldWithAccel(): World {
  const w = new World();
  for (const sys of accelApplyCapability.systems) w.addSystem(sys);
  return w;
}

describe('T1 accel-apply — capability metadata（契约钉死）', () => {
  it('id / version 正确', () => {
    expect(accelApplyCapability.id).toBe('t1-accel-apply');
    expect(accelApplyCapability.version).toBe('1.0.0');
  });

  it('一个系统：读 Velocity+Acceleration，写 Velocity，不 provide/consume', () => {
    expect(accelApplyCapability.systems).toHaveLength(1);
    expect(accelApplyCapability.components.provides).toEqual({});
    expect(accelApplyCapability.components.reads).toEqual(['Velocity', 'Acceleration']);
    expect(accelApplyCapability.components.writes).toEqual(['Velocity']);
    expect(accelApplyCapability.components.consumes).toEqual([]);
  });
});

describe('T1 accel-apply — behavior', () => {
  it('每 tick 把 acceleration 累加进 velocity', () => {
    const w = worldWithAccel();
    w.createEntity('e');
    const v: Velocity = { type: 'Velocity', vx: 0, vy: 0, angular: 0 };
    const a: Acceleration = { type: 'Acceleration', ax: 0, ay: 9.8 };
    w.addComponent('e', v);
    w.addComponent('e', a);

    w.tick();
    expect(w.getComponent<Velocity>('e', 'Velocity')!.vy).toBeCloseTo(9.8);
    w.tick();
    expect(w.getComponent<Velocity>('e', 'Velocity')!.vy).toBeCloseTo(19.6); // 线性累加
  });

  it('没有 Acceleration 的实体速度不变（query 不命中）', () => {
    const w = worldWithAccel();
    w.createEntity('drifter');
    const v: Velocity = { type: 'Velocity', vx: 5, vy: 0, angular: 0 };
    w.addComponent('drifter', v);
    w.tick();
    expect(w.getComponent<Velocity>('drifter', 'Velocity')!.vx).toBe(5);
  });
});

describe('T1 涌现：accel-apply ⊕ motion-apply 自动咬合成运动学链', () => {
  it('两个独立原子经拓扑排序组成 加速度→速度→位置（自由落体）', () => {
    const w = new World();
    // 故意乱序注册：证明执行顺序由依赖图（拓扑排序）得出，而非注册次序。
    for (const sys of motionApplyCapability.systems) w.addSystem(sys);
    for (const sys of accelApplyCapability.systems) w.addSystem(sys);

    // 拓扑保证：accel-apply（写 Velocity）排在 motion-apply（读 Velocity）之前。
    const order = w.getSortedSystems().map((s) => s.id);
    expect(order.indexOf('accel-apply')).toBeLessThan(order.indexOf('motion-apply'));

    w.createEntity('ball');
    const t: Transform = { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    const v: Velocity = { type: 'Velocity', vx: 0, vy: 0, angular: 0 };
    const a: Acceleration = { type: 'Acceleration', ax: 0, ay: 10 };
    w.addComponent('ball', t);
    w.addComponent('ball', v);
    w.addComponent('ball', a);

    // tick1: accel 先 → vy=10；motion 后 → y += 10 = 10
    w.tick();
    expect(w.getComponent<Velocity>('ball', 'Velocity')!.vy).toBe(10);
    expect(w.getComponent<Transform>('ball', 'Transform')!.y).toBe(10);

    // tick2: vy=20, y=10+20=30
    w.tick();
    expect(w.getComponent<Transform>('ball', 'Transform')!.y).toBe(30);

    // tick3: vy=30, y=30+30=60 —— 每 tick 位移递增(10,20,30)，重力涌现出来了
    w.tick();
    expect(w.getComponent<Transform>('ball', 'Transform')!.y).toBe(60);
  });
});
