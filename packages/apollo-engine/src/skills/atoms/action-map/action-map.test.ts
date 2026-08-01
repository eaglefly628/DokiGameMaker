import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { actionMapCapability } from './index.js';
import type { Action } from '@engine/protocol/components.js';

describe('action-map atom', () => {
  it('defines Action contract with no pure system (binding is assembly)', () => {
    expect(actionMapCapability.systems).toHaveLength(0);
  });

  it('provides Action categorized as intent', () => {
    expect(actionMapCapability.components.provides.Action.category).toBe('intent');
  });

  it('stores a semantic action with analog value', () => {
    const w = new World();
    w.createEntity('player');
    const a: Action = { type: 'Action', name: 'aim', value: 0.5 };
    w.addComponent('player', a);
    const got = w.getComponent<Action>('player', 'Action')!;
    expect(got.name).toBe('aim');
    expect(got.value).toBe(0.5);
  });
});
