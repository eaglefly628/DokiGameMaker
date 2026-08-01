// collision-resolve-3d（REQ-3D-Collision·响应）：把动态角色推出静态墙·不穿墙。确定性 sim·进 hash。
import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@engine/core/world.js';
import { overlapDetect3dCapability } from '../overlap-detect-3d/index.js';
import { collisionResolve3dCapability } from './index.js';
import type { Transform, Collider3D, Velocity } from '@engine/protocol/components.js';
import { hashSnapshot } from '@net/index.js';

const detect = overlapDetect3dCapability.systems[0]!;
const resolve = collisionResolve3dCapability.systems[0]!;

function build(): World {
  const w = new World();
  w.addSystem(detect); w.addSystem(resolve);
  return w;
}
function dynamicCapsule(w: World, id: string, x: number, z: number): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x, y: z, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(id, { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
  w.addComponent(id, { type: 'Collider3D', kind: 'capsule', radius: 2, height: 6 } as Collider3D);
}
function staticBox(w: World, id: string, x: number, z: number, hx: number, hz: number, trigger = false): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x, y: z, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(id, { type: 'Collider3D', kind: 'box', halfX: hx, halfY: 5, halfZ: hz, trigger } as Collider3D);
}
const X = (w: World, id: string): number => w.getComponent<Transform>(id, 'Transform')!.x;

describe('collision-resolve-3d', () => {
  let world: World;
  beforeEach(() => { world = build(); });

  it('动态角色被静态墙推出 → 不再穿透；墙不动', () => {
    dynamicCapsule(world, 'a-duck', 1.5, 0); // 胶囊 r2·右沿 X3.5
    staticBox(world, 'b-wall', 4, 0, 2, 2);   // 墙左沿 X2 → 穿透 1.5
    world.tick();
    expect(X(world, 'a-duck')).toBeLessThanOrEqual(0.05); // 被推到右沿≤墙左沿（中心≤0）
    expect(X(world, 'b-wall')).toBe(4); // 静态墙不动
  });

  it('撞墙速度被吃掉（贴墙不再继续侵入）', () => {
    dynamicCapsule(world, 'a-duck', 1.5, 0);
    world.getComponent<Velocity>('a-duck', 'Velocity')!.vx = 1; // 朝墙(+X)推
    staticBox(world, 'b-wall', 4, 0, 2, 2);
    world.tick();
    expect(world.getComponent<Velocity>('a-duck', 'Velocity')!.vx).toBeLessThanOrEqual(0.001); // 入墙法向速度被清
  });

  it('触发区不解算：角色可走入 trigger（只检测不推开）', () => {
    dynamicCapsule(world, 'a-duck', 0, 0);
    staticBox(world, 'b-zone', 0, 0, 6, 6, true); // trigger 罩住角色
    world.tick();
    expect(X(world, 'a-duck')).toBeCloseTo(0); // 没被推出触发区
  });

  it('确定性：两世界同步进·终态逐位一致（进 hash）', () => {
    const setup = (w: World): void => { dynamicCapsule(w, 'a-duck', 1.2, 0.4); staticBox(w, 'b-wall', 4, 0, 2, 2); };
    const w1 = build(); setup(w1);
    const w2 = build(); setup(w2);
    for (let i = 0; i < 6; i++) { w1.tick(); w2.tick(); }
    expect(hashSnapshot(w1.snapshot())).toBe(hashSnapshot(w2.snapshot()));
  });
});
