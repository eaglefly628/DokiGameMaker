import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@engine/core/world.js';
import { destroyCapability } from './index.js';
import type { DestroyRequest } from '@engine/protocol/components.js';

const system = destroyCapability.systems[0];

describe('destroy-apply system', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
    world.addSystem(system);
  });

  it('removes an entity that holds a self-targeting DestroyRequest', () => {
    world.createEntity('bullet');
    const r: DestroyRequest = { type: 'DestroyRequest', entityId: 'bullet' };
    world.addComponent('bullet', r);

    world.tick();
    expect(world.getAllEntities()).not.toContain('bullet');
  });

  it('removes a target referenced by a separate command entity, then consumes the request', () => {
    world.createEntity('target');
    world.createEntity('cmd');
    const r: DestroyRequest = { type: 'DestroyRequest', entityId: 'target' };
    world.addComponent('cmd', r);

    world.tick();
    expect(world.getAllEntities()).not.toContain('target');
    expect(world.hasComponent('cmd', 'DestroyRequest')).toBe(false);
  });

  it('handles multiple destroy requests in one tick', () => {
    world.createEntity('a');
    world.createEntity('b');
    world.addComponent('a', { type: 'DestroyRequest', entityId: 'a' } as DestroyRequest);
    world.addComponent('b', { type: 'DestroyRequest', entityId: 'b' } as DestroyRequest);

    world.tick();
    expect(world.getAllEntities()).toHaveLength(0);
  });
});
