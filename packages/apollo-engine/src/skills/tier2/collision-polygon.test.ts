import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Transform, Velocity, Acceleration, Shape } from '@engine/protocol/components.js';
import { collisionResolveCapability } from './index.js';
import { overlapDetectCapability } from '@atom-skills/index.js';
import { accelApplyCapability, motionApplyCapability } from '../tier1/index.js';

function physicsWorld(): World {
  const w = new World();
  for (const cap of [collisionResolveCapability, overlapDetectCapability, motionApplyCapability, accelApplyCapability]) {
    for (const s of cap.systems) w.addSystem(s);
  }
  return w;
}
function dropBox(w: World, id: string, x: number, y: number): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(id, { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
  w.addComponent(id, { type: 'Acceleration', ax: 0, ay: 2 } as Acceleration);
  w.addComponent(id, { type: 'Shape', kind: 'box', width: 20, height: 20 } as Shape);
}
const TY = (w: World, id: string): number => w.getComponent<Transform>(id, 'Transform')!.y;
const TX = (w: World, id: string): number => w.getComponent<Transform>(id, 'Transform')!.x;

describe('convex/SAT 集成（阶段一：平移碰撞）', () => {
  it('方块落在"多边形平台"(平顶)上 → 像落在盒上一样停住', () => {
    const w = physicsWorld();
    dropBox(w, 'player', 100, 150);
    // 平台用 polygon 定义：world 角 (0,190)(200,190)(200,210)(0,210)，顶边 y=190。无 Velocity = 静态。
    w.createEntity('platform');
    w.addComponent('platform', { type: 'Transform', x: 100, y: 200, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('platform', { type: 'Shape', kind: 'polygon', vertices: [-100, -10, 100, -10, 100, 10, -100, 10] } as Shape);
    for (let i = 0; i < 20; i++) w.tick();
    expect(TY(w, 'player')).toBeCloseTo(180); // 顶边 190 - 半高 10
    expect(w.getComponent<Velocity>('player', 'Velocity')!.vy).toBeCloseTo(0);
  });

  it('方块落在斜坡(三角多边形)上 → 不穿透、并沿坡滑动', () => {
    const w = physicsWorld();
    dropBox(w, 'player', 200, 270); // 起点贴近坡面（坡面在 x=200 处 y≈300），低速落避免隧穿
    // 斜坡三角：world (100,350)(300,350)(100,250)，斜面从高(100,250)降到低(300,350)。无 Velocity = 静态。
    w.createEntity('ramp');
    w.addComponent('ramp', { type: 'Transform', x: 200, y: 300, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('ramp', { type: 'Shape', kind: 'polygon', vertices: [-100, 50, 100, 50, -100, -50] } as Shape);
    const x0 = TX(w, 'player');
    for (let i = 0; i < 12; i++) w.tick(); // 无摩擦坡，跑太久会滑出右下边缘掉落；取仍在坡上的窗口
    const x = TX(w, 'player');
    const y = TY(w, 'player');
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    expect(x).toBeGreaterThan(x0 + 3); // 沿坡下滑（坡向右下 → x 增大）—— 证明斜面法线起作用
    expect(x).toBeLessThan(295); // 仍在 ramp 内（未滑出 x=300 边缘）
    expect(y).toBeGreaterThan(282); // 确实落下并沿坡下移（起点 270）
    // 未穿透：盒中心不应明显落到坡面线之下。坡面 y = 250 + (x-100)*0.5。
    expect(y).toBeLessThan(250 + (x - 100) * 0.5 + 12);
  });
});
