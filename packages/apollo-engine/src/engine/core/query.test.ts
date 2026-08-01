import { describe, it, expect } from 'vitest';
import { World } from './world.js';
import { findByComponentId, getComponentById } from './query.js';
import type { Resource } from '@engine/protocol/components.js';

function res(w: World, eid: string, id: string, current: number): void {
  w.createEntity(eid);
  w.addComponent(eid, { type: 'Resource', id, current, min: 0, max: 100 } as Resource);
}

describe('query — findByComponentId / getComponentById（R13/R14）', () => {
  it('按 Resource.id 找到持有它的实体', () => {
    const w = new World();
    res(w, 'e1', 'hp', 50);
    res(w, 'e2', 'affection_S', 30);
    expect(findByComponentId(w, 'Resource', 'id', 'affection_S')).toBe('e2');
    expect(findByComponentId(w, 'Resource', 'id', 'hp')).toBe('e1');
  });

  it('无匹配 → undefined', () => {
    const w = new World();
    res(w, 'e1', 'hp', 50);
    expect(findByComponentId(w, 'Resource', 'id', 'nope')).toBeUndefined();
    expect(getComponentById<Resource>(w, 'Resource', 'id', 'nope')).toBeUndefined();
  });

  it('getComponentById 直接取到组件', () => {
    const w = new World();
    res(w, 'gs', 'charm', 42);
    expect(getComponentById<Resource>(w, 'Resource', 'id', 'charm')?.current).toBe(42);
  });
});
