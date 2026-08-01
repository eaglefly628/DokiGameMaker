import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Transform, Velocity, Acceleration, Shape } from '@engine/protocol/components.js';
import { collisionResolveCapability, groundSenseCapability } from './index.js';
import { overlapDetectCapability } from '@atom-skills/index.js';
import { accelApplyCapability, motionApplyCapability } from '../tier1/index.js';

// 复现并钉死 bug：方块 B 叠在方块 A 上、A 又踩在静态地面上时，
// B 的重量/砸落不应把 A 挤进/穿过地面。修复靠"A Grounded 时当静态支撑"。
function stackedWorld(): World {
  const w = new World();
  for (const cap of [collisionResolveCapability, groundSenseCapability, overlapDetectCapability, motionApplyCapability, accelApplyCapability]) {
    for (const s of cap.systems) w.addSystem(s);
  }
  // 静态地面：box 200×20，中心 y=200 → 顶边 190。无 Velocity = 静态。
  w.createEntity('ground');
  w.addComponent('ground', { type: 'Transform', x: 100, y: 200, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent('ground', { type: 'Shape', kind: 'box', width: 200, height: 20 } as Shape);
  // 下方块 A：20×20，静止位 y=180（底边 190 = 地面顶）。动态 + 重力。
  addDynBox(w, 'A', 180);
  // 上方块 B：20×20，叠在 A 上（底边 170 = A 顶 170）。动态 + 重力。
  addDynBox(w, 'B', 160);
  return w;
}
function addDynBox(w: World, id: string, y: number): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x: 100, y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(id, { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
  w.addComponent(id, { type: 'Acceleration', ax: 0, ay: 2 } as Acceleration);
  w.addComponent(id, { type: 'Shape', kind: 'box', width: 20, height: 20 } as Shape);
}
const Y = (w: World, id: string): number => w.getComponent<Transform>(id, 'Transform')!.y;
const setVy = (w: World, id: string, vy: number): void => {
  w.getComponent<Velocity>(id, 'Velocity')!.vy = vy;
};

describe('collision-resolve — 叠放方块不被挤穿地面（bug 回归）', () => {
  it('静置堆叠多帧：下方块 A 始终停在地面上，不下沉', () => {
    const w = stackedWorld();
    for (let i = 0; i < 60; i++) w.tick();
    expect(Y(w, 'A')).toBeLessThanOrEqual(181); // 仍在静止位 180 附近，没被压下去
    expect(Y(w, 'A')).toBeGreaterThanOrEqual(179);
    expect(Y(w, 'B')).toBeLessThan(Y(w, 'A')); // B 仍在 A 之上
  });

  it('B 高速砸落到 A 上：A 不被挤进/穿过地面（顶边 190）', () => {
    const w = stackedWorld();
    for (let i = 0; i < 30; i++) w.tick(); // 先稳定
    const aRest = Y(w, 'A');
    expect(Math.abs(aRest - 180)).toBeLessThan(1);
    // 模拟硬砸：给 B 一个大的向下速度，连续若干帧
    for (let i = 0; i < 8; i++) {
      setVy(w, 'B', 30);
      w.tick();
      expect(Y(w, 'A')).toBeLessThan(185); // 关键：A 没被压进地面（远未到顶边 190 以下）
    }
    expect(Math.abs(Y(w, 'A') - 180)).toBeLessThan(1); // 砸完仍稳在 180
  });
});
