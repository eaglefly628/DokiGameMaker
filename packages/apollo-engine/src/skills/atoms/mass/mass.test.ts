import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { massCapability } from './index.js';
import type { Mass } from '@engine/protocol/components.js';

describe('mass atom', () => {
  it('is a pure-data atom with no systems', () => {
    expect(massCapability.systems).toHaveLength(0);
  });

  it('provides Mass.value as a number', () => {
    expect(massCapability.components.provides.Mass.fields.value.type).toBe('number');
  });

  it('stores value 0 (immovable) and reads it back', () => {
    const w = new World();
    w.createEntity('e');
    const m: Mass = { type: 'Mass', value: 0 };
    w.addComponent('e', m);
    expect(w.getComponent<Mass>('e', 'Mass')!.value).toBe(0);
  });

  it('default value is 1', () => {
    expect(massCapability.config.value.default).toBe(1);
  });
});
