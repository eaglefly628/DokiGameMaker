import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { hierarchyCapability } from './index.js';
import type { Hierarchy } from '@engine/protocol/components.js';

describe('hierarchy atom', () => {
  it('is a pure-data atom with no systems (resolve is Tier 1)', () => {
    expect(hierarchyCapability.systems).toHaveLength(0);
  });

  it('provides Hierarchy with parentId + local transform fields', () => {
    const f = hierarchyCapability.components.provides.Hierarchy.fields;
    expect(f.parentId.type).toBe('EntityId');
    expect(f.localX.type).toBe('number');
    expect(f.localScaleY.type).toBe('number');
  });

  it('stores and reads back', () => {
    const w = new World();
    w.createEntity('turret');
    const h: Hierarchy = { type: 'Hierarchy', parentId: 'tank', localX: 0, localY: -10, localRotation: 0, localScaleX: 1, localScaleY: 1 };
    w.addComponent('turret', h);
    const got = w.getComponent<Hierarchy>('turret', 'Hierarchy')!;
    expect(got.parentId).toBe('tank');
    expect(got.localY).toBe(-10);
  });

  it('local scale defaults to 1', () => {
    expect(hierarchyCapability.config.localScaleX.default).toBe(1);
    expect(hierarchyCapability.config.localScaleY.default).toBe(1);
  });
});
