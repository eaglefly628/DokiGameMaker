import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { visibilityCapability } from './index.js';
import type { Visibility } from '@engine/protocol/components.js';

describe('visibility atom', () => {
  it('is a pure-data atom with no systems', () => {
    expect(visibilityCapability.systems).toHaveLength(0);
  });

  it('provides Visibility with visible + active booleans', () => {
    const f = visibilityCapability.components.provides.Visibility.fields;
    expect(f.visible.type).toBe('boolean');
    expect(f.active.type).toBe('boolean');
  });

  it('stores and reads back', () => {
    const w = new World();
    w.createEntity('e');
    const v: Visibility = { type: 'Visibility', visible: false, active: true };
    w.addComponent('e', v);
    const got = w.getComponent<Visibility>('e', 'Visibility')!;
    expect(got.visible).toBe(false);
    expect(got.active).toBe(true);
  });

  it('defaults are both true', () => {
    expect(visibilityCapability.config.visible.default).toBe(true);
    expect(visibilityCapability.config.active.default).toBe(true);
  });
});
