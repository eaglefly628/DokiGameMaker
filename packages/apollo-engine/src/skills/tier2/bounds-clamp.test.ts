import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { SystemPhase } from '@engine/core/types.js';
import type { Transform, Shape, Bounds } from '@engine/protocol/components.js';
import { boundsClampCapability } from './bounds-clamp.js';

function worldWithClamp(): World {
  const w = new World();
  for (const s of boundsClampCapability.systems) w.addSystem(s);
  return w;
}
function addBox(w: World, id: string, x: number, y: number): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(id, { type: 'Shape', kind: 'box', width: 20, height: 20 } as Shape); // 半宽/半高 = 10
  w.addComponent(id, { type: 'Bounds', minX: 0, minY: 0, maxX: 100, maxY: 100 } as Bounds);
}
const T = (w: World, id: string): Transform => w.getComponent<Transform>(id, 'Transform')!;

describe('T2 bounds-clamp — metadata', () => {
  it('id / Commit 阶段 / 读 Transform+Bounds+Shape、写 Transform', () => {
    expect(boundsClampCapability.id).toBe('t2-bounds-clamp');
    expect(boundsClampCapability.systems[0].phase).toBe(SystemPhase.Commit);
    expect(boundsClampCapability.components.reads).toEqual(['Transform', 'Bounds', 'Shape']);
    expect(boundsClampCapability.components.writes).toEqual(['Transform']);
  });
});

describe('T2 bounds-clamp — behavior（按 AABB 半径钳，不只钳中心）', () => {
  it('越过右/下界 → 拉回，留出半径', () => {
    const w = worldWithClamp();
    addBox(w, 'e', 200, 200); // 远在界外
    w.tick();
    expect(T(w, 'e').x).toBe(90); // maxX 100 - 半宽 10
    expect(T(w, 'e').y).toBe(90); // maxY 100 - 半高 10
  });

  it('越过左/上界 → 拉回，留出半径', () => {
    const w = worldWithClamp();
    addBox(w, 'e', -50, -50);
    w.tick();
    expect(T(w, 'e').x).toBe(10); // minX 0 + 半宽 10
    expect(T(w, 'e').y).toBe(10);
  });

  it('界内不动', () => {
    const w = worldWithClamp();
    addBox(w, 'e', 50, 50);
    w.tick();
    expect(T(w, 'e').x).toBe(50);
    expect(T(w, 'e').y).toBe(50);
  });
});
