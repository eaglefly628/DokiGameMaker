import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@engine/core/world.js';
import { spatialQueryCapability, queryRange, queryNearest } from './index.js';
import type { Transform } from '@engine/protocol/components.js';

function place(w: World, id: string, x: number, y: number) {
  w.createEntity(id);
  const t: Transform = { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 };
  w.addComponent(id, t);
}

describe('spatial-query atom', () => {
  let world: World;
  beforeEach(() => {
    world = new World();
    place(world, 'origin', 0, 0);
    place(world, 'near', 30, 0);
    place(world, 'mid', 80, 0);
    place(world, 'far', 500, 0);
  });

  it('is a world-service atom with no per-tick system', () => {
    expect(spatialQueryCapability.systems).toHaveLength(0);
  });

  it('queryRange returns entities within the radius', () => {
    const inside = queryRange(world, 0, 0, 100).sort();
    expect(inside).toEqual(['mid', 'near', 'origin']);
  });

  it('queryRange excludes entities outside the radius', () => {
    expect(queryRange(world, 0, 0, 100)).not.toContain('far');
  });

  it('queryNearest returns closest entities in order, honoring exclude', () => {
    const nearest = queryNearest(world, 0, 0, 2, 'origin');
    expect(nearest).toEqual(['near', 'mid']);
  });

  it('SpatialIndex config defaults to a 64px grid', () => {
    expect(spatialQueryCapability.config.cellSize.default).toBe(64);
    expect(spatialQueryCapability.config.kind.default).toBe('grid');
  });

  it('BUG-005：等距 tie-break 按 id 升序（确定性，不依赖构建序）', () => {
    const w = new World();
    // 两个到 (0,0) 等距的实体，故意按 id 倒序创建。
    w.createEntity('zzz');
    w.addComponent('zzz', { type: 'Transform', x: 3, y: 4, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.createEntity('aaa');
    w.addComponent('aaa', { type: 'Transform', x: 4, y: 3, rotation: 0, scaleX: 1, scaleY: 1 } as Transform); // 同 d2=25
    expect(queryNearest(w, 0, 0, 2)).toEqual(['aaa', 'zzz']); // id 升序，与创建序无关
  });
});
