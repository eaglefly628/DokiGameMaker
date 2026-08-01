import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { spriteCapability } from './index.js';
import type { Sprite } from '@engine/protocol/components.js';

describe('sprite atom', () => {
  it('is a pure-data render atom with no systems', () => {
    expect(spriteCapability.systems).toHaveLength(0);
  });

  it('provides Sprite categorized as render', () => {
    expect(spriteCapability.components.provides.Sprite.category).toBe('render');
  });

  it('stores and reads back', () => {
    const w = new World();
    w.createEntity('e');
    const s: Sprite = { type: 'Sprite', textureKey: 'player', anchorX: 0.5, anchorY: 0.5, zOrder: 10 };
    w.addComponent('e', s);
    const got = w.getComponent<Sprite>('e', 'Sprite')!;
    expect(got.textureKey).toBe('player');
    expect(got.zOrder).toBe(10);
  });

  it('anchor defaults to center (0.5)', () => {
    expect(spriteCapability.config.anchorX.default).toBe(0.5);
    expect(spriteCapability.config.anchorY.default).toBe(0.5);
  });
});
