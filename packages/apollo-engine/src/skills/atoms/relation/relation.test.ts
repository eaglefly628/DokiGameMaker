import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { relationCapability } from './index.js';
import type { Relation } from '@engine/protocol/components.js';

describe('relation atom', () => {
  it('is a pure-data atom with no systems', () => {
    expect(relationCapability.systems).toHaveLength(0);
  });

  it('provides Relation with kind + targetId', () => {
    const f = relationCapability.components.provides.Relation.fields;
    expect(f.kind.type).toBe('string');
    expect(f.targetId.type).toBe('EntityId');
  });

  it('stores and reads back a relation', () => {
    const w = new World();
    w.createEntity('bullet');
    const r: Relation = { type: 'Relation', kind: 'owner', targetId: 'player' };
    w.addComponent('bullet', r);
    const got = w.getComponent<Relation>('bullet', 'Relation')!;
    expect(got.kind).toBe('owner');
    expect(got.targetId).toBe('player');
  });
});
