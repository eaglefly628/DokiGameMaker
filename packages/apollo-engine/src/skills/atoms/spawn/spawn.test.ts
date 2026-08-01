import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { spawnCapability } from './index.js';
import type { SpawnRequest } from '@engine/protocol/components.js';

describe('spawn atom', () => {
  it('defines SpawnRequest contract with no pure system (spawner is assembly)', () => {
    expect(spawnCapability.systems).toHaveLength(0);
  });

  it('provides SpawnRequest categorized as intent', () => {
    expect(spawnCapability.components.provides.SpawnRequest.category).toBe('intent');
  });

  it('stores a spawn request', () => {
    const w = new World();
    w.createEntity('emitter');
    const s: SpawnRequest = { type: 'SpawnRequest', templateId: 'bullet', x: 10, y: 20 };
    w.addComponent('emitter', s);
    const got = w.getComponent<SpawnRequest>('emitter', 'SpawnRequest')!;
    expect(got.templateId).toBe('bullet');
    expect(got.x).toBe(10);
    expect(got.y).toBe(20);
  });
});
