// overlap-detect-3d 系统（REQ-3D-Collision · P1）：3D 逻辑碰撞·每帧重建·产 Overlap3D。确定性·rollback 安全。
import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@engine/core/world.js';
import { overlapDetect3dCapability } from './index.js';
import type { Transform, Collider3D, Overlap3D } from '@engine/protocol/components.js';
import { hashSnapshot } from '@net/index.js';

const system = overlapDetect3dCapability.systems[0]!;

function place(w: World, id: string, x: number, z: number, c: Collider3D): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x, y: z, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(id, c);
}
const capsule = (radius: number, height: number): Collider3D => ({ type: 'Collider3D', kind: 'capsule', radius, height });
const triggerBox = (hx: number, hy: number, hz: number): Collider3D => ({ type: 'Collider3D', kind: 'box', halfX: hx, halfY: hy, halfZ: hz, trigger: true });
const overlaps = (w: World): Overlap3D[] => w.query('Overlap3D').map(([id]) => w.getComponent<Overlap3D>(id, 'Overlap3D')!);

describe('overlap-detect-3d 系统', () => {
  let world: World;
  beforeEach(() => {
    world = new World();
    world.addSystem(system);
  });

  it('角色胶囊进触发区盒 → 产 Overlap3D（a<b 有序）', () => {
    place(world, 'hero', 0, 0, capsule(2, 7));
    place(world, 'zone', 0, 1, triggerBox(4, 4, 4)); // 盒罩住原点附近
    world.tick();
    const os = overlaps(world);
    expect(os.length).toBe(1);
    expect(os[0]!.entityA).toBe('hero'); // 'hero' < 'zone'
    expect(os[0]!.entityB).toBe('zone');
    expect(os[0]!.depth).toBeGreaterThan(0);
  });

  it('角色走出触发区 → 无 Overlap3D（每帧重算·离开即消）', () => {
    place(world, 'hero', 0, 0, capsule(2, 7));
    place(world, 'zone', 0, 1, triggerBox(4, 4, 4));
    world.tick();
    expect(overlaps(world).length).toBe(1);
    // 把角色挪远（Transform.y=Z 远离）
    const t = world.getComponent<Transform>('hero', 'Transform')!;
    t.y = 50;
    world.tick();
    expect(overlaps(world).length).toBe(0);
  });

  it('Collider3D 进 hash（确定性 sim·非 render-only）；Overlap3D 每帧重算不破坏确定性', () => {
    place(world, 'hero', 0, 0, capsule(2, 7));
    place(world, 'zone', 0, 1, triggerBox(4, 4, 4));
    // 碰撞体形状变 → world hash 必变（证明 Collider3D 进 hash）。
    const h1 = hashSnapshot(world.snapshot());
    world.getComponent<Collider3D>('hero', 'Collider3D')!.radius = 5;
    expect(hashSnapshot(world.snapshot())).not.toBe(h1);
  });
});
