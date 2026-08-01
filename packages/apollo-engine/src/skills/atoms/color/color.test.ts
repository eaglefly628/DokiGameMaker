import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { colorCapability } from './index.js';
import type { Color } from '@engine/protocol/components.js';

describe('color atom', () => {
  it('is a pure-data render atom with no systems', () => {
    expect(colorCapability.systems).toHaveLength(0);
  });

  it('provides Color categorized as render', () => {
    expect(colorCapability.components.provides.Color.category).toBe('render');
  });

  it('stores and reads back', () => {
    const w = new World();
    w.createEntity('e');
    const c: Color = { type: 'Color', tint: 0xff0000, alpha: 0.5 };
    w.addComponent('e', c);
    const got = w.getComponent<Color>('e', 'Color')!;
    expect(got.tint).toBe(0xff0000);
    expect(got.alpha).toBe(0.5);
  });

  it('defaults to opaque white', () => {
    expect(colorCapability.config.tint.default).toBe(0xffffff);
    expect(colorCapability.config.alpha.default).toBe(1);
  });
});
