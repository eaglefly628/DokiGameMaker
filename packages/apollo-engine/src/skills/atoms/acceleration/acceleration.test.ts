import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { accelerationCapability } from './index.js';
import type { Acceleration } from '@engine/protocol/components.js';

describe('acceleration atom', () => {
  it('is a pure-data atom with no systems', () => {
    expect(accelerationCapability.systems).toHaveLength(0);
  });

  it('provides Acceleration with ax/ay as numbers', () => {
    const f = accelerationCapability.components.provides.Acceleration.fields;
    expect(f.ax.type).toBe('number');
    expect(f.ay.type).toBe('number');
  });

  it('stores and reads back an Acceleration component', () => {
    const w = new World();
    w.createEntity('e');
    const a: Acceleration = { type: 'Acceleration', ax: 0, ay: 9.8 };
    w.addComponent('e', a);
    expect(w.getComponent<Acceleration>('e', 'Acceleration')!.ay).toBe(9.8);
  });

  it('config defaults are zero', () => {
    expect(accelerationCapability.config.ax.default).toBe(0);
    expect(accelerationCapability.config.ay.default).toBe(0);
  });
});
