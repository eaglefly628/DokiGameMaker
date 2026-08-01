import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { velocityCapability } from './index.js';
import type { Velocity } from '@engine/protocol/components.js';

describe('velocity atom', () => {
  it('is a pure-data atom with no systems', () => {
    expect(velocityCapability.systems).toHaveLength(0);
  });

  it('provides Velocity with vx/vy/angular as numbers', () => {
    const fields = velocityCapability.components.provides.Velocity.fields;
    expect(fields.vx.type).toBe('number');
    expect(fields.vy.type).toBe('number');
    expect(fields.angular.type).toBe('number');
  });

  it('stores and reads back a Velocity component', () => {
    const world = new World();
    world.createEntity('e1');
    const v: Velocity = { type: 'Velocity', vx: 3, vy: -2, angular: 0.5 };
    world.addComponent('e1', v);

    const got = world.getComponent<Velocity>('e1', 'Velocity')!;
    expect(got.vx).toBe(3);
    expect(got.vy).toBe(-2);
    expect(got.angular).toBe(0.5);
  });

  it('config defaults are all zero', () => {
    expect(velocityCapability.config.vx.default).toBe(0);
    expect(velocityCapability.config.vy.default).toBe(0);
    expect(velocityCapability.config.angular.default).toBe(0);
  });
});
