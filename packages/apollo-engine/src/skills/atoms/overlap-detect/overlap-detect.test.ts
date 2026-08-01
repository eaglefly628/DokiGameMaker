import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@engine/core/world.js';
import { overlapDetectCapability } from './index.js';
import type { Transform, Shape, Overlap } from '@engine/protocol/components.js';

const system = overlapDetectCapability.systems[0];

function place(w: World, id: string, x: number, y: number, shape: Shape) {
  w.createEntity(id);
  const t: Transform = { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 };
  w.addComponent(id, t);
  w.addComponent(id, shape);
}
function box(width: number, height: number): Shape {
  return { type: 'Shape', kind: 'box', width, height };
}
function circle(radius: number): Shape {
  return { type: 'Shape', kind: 'circle', radius };
}
function overlaps(w: World): Overlap[] {
  return w.query('Overlap').map(([id]) => w.getComponent<Overlap>(id, 'Overlap')!);
}

describe('overlap-detect system', () => {
  let world: World;
  beforeEach(() => {
    world = new World();
    world.addSystem(system);
  });

  it('detects overlapping boxes with axis-of-min-penetration normal + depth', () => {
    place(world, 'a', 0, 0, box(32, 32));
    place(world, 'b', 20, 0, box(32, 32));
    world.tick();
    const o = overlaps(world);
    expect(o).toHaveLength(1);
    expect(o[0].normalX).toBe(1);
    expect(o[0].normalY).toBe(0);
    expect(o[0].depth).toBe(12);
  });

  it('reports nothing when boxes are apart', () => {
    place(world, 'a', 0, 0, box(32, 32));
    place(world, 'b', 40, 0, box(32, 32));
    world.tick();
    expect(overlaps(world)).toHaveLength(0);
  });

  it('detects overlapping circles with a normalized normal', () => {
    place(world, 'a', 0, 0, circle(10));
    place(world, 'b', 15, 0, circle(10));
    world.tick();
    const o = overlaps(world);
    expect(o).toHaveLength(1);
    expect(o[0].depth).toBeCloseTo(5);
    expect(o[0].normalX).toBeCloseTo(1);
    expect(o[0].normalY).toBeCloseTo(0);
  });

  it('detects box vs circle', () => {
    place(world, 'a', 0, 0, box(20, 20));
    place(world, 'b', 15, 0, circle(8));
    world.tick();
    const o = overlaps(world);
    expect(o).toHaveLength(1);
    expect(o[0].depth).toBeCloseTo(3);
  });

  it('clears stale overlaps once entities separate', () => {
    place(world, 'a', 0, 0, box(32, 32));
    place(world, 'b', 20, 0, box(32, 32));
    world.tick();
    expect(overlaps(world)).toHaveLength(1);

    world.getComponent<Transform>('b', 'Transform')!.x = 200;
    world.tick();
    expect(overlaps(world)).toHaveLength(0);
  });

  // ── REQ-OVERLAP-LAYER：碰撞分层（category/mask 位掩码宽相位过滤） ──
  describe('collision layer filter (category/mask)', () => {
    const ENEMY = 1 << 0;
    const PLAYER = 1 << 1;

    it('filters out enemy-enemy overlap when mask only wants player layer', () => {
      place(world, 'e1', 0, 0, { ...box(32, 32), category: ENEMY, mask: PLAYER });
      place(world, 'e2', 20, 0, { ...box(32, 32), category: ENEMY, mask: PLAYER });
      world.tick();
      expect(overlaps(world)).toHaveLength(0);
    });

    it('keeps enemy-player overlap when both sides accept each other layer', () => {
      place(world, 'e1', 0, 0, { ...box(32, 32), category: ENEMY, mask: PLAYER });
      place(world, 'p1', 20, 0, { ...box(32, 32), category: PLAYER, mask: ENEMY });
      world.tick();
      expect(overlaps(world)).toHaveLength(1);
    });

    it('requires bidirectional agreement: one-way mask match still filters', () => {
      // e1 想碰 PLAYER 层，但 e2（本身是 ENEMY 层、mask 只想碰 ENEMY）不想被 e1 碰到。
      place(world, 'e1', 0, 0, { ...box(32, 32), category: ENEMY, mask: PLAYER | ENEMY });
      place(world, 'e2', 20, 0, { ...box(32, 32), category: ENEMY, mask: ENEMY });
      // e1.mask 含 ENEMY 且 e2.category=ENEMY → catB & maskA != 0；
      // 但 e1.category=ENEMY、e2.mask=ENEMY 也含 ENEMY → 双向都满足，应该碰上（用于反证下面单向案例）。
      world.tick();
      expect(overlaps(world)).toHaveLength(1);

      world.destroyEntity('e1');
      world.destroyEntity('e2');
      // 真正单向案例：e1 想碰 PLAYER 层（不想碰 ENEMY），e2 是 ENEMY 层 → catB(ENEMY) & maskA(PLAYER) = 0 → 过滤。
      place(world, 'f1', 0, 0, { ...box(32, 32), category: ENEMY, mask: PLAYER });
      place(world, 'f2', 20, 0, { ...box(32, 32), category: ENEMY, mask: PLAYER | ENEMY });
      world.tick();
      expect(overlaps(world)).toHaveLength(0);
    });

    it('zero-regression: no category/mask set on either side still overlaps as before', () => {
      place(world, 'a', 0, 0, box(32, 32));
      place(world, 'b', 20, 0, box(32, 32));
      world.tick();
      expect(overlaps(world)).toHaveLength(1);
    });

    it('is deterministic: same layout ticked twice yields identical snapshot', () => {
      place(world, 'e1', 0, 0, { ...box(32, 32), category: ENEMY, mask: PLAYER });
      place(world, 'p1', 20, 0, { ...box(32, 32), category: PLAYER, mask: ENEMY });
      place(world, 'e2', 100, 0, { ...box(32, 32), category: ENEMY, mask: PLAYER });
      world.tick();
      const first = overlaps(world);

      const world2 = new World();
      world2.addSystem(system);
      place(world2, 'e1', 0, 0, { ...box(32, 32), category: ENEMY, mask: PLAYER });
      place(world2, 'p1', 20, 0, { ...box(32, 32), category: PLAYER, mask: ENEMY });
      place(world2, 'e2', 100, 0, { ...box(32, 32), category: ENEMY, mask: PLAYER });
      world2.tick();
      const second = overlaps(world2);

      expect(second).toEqual(first);
    });
  });
});
