import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { frameCapability } from './index.js';
import type { Frame } from '@engine/protocol/components.js';

describe('frame atom', () => {
  it('is a pure-data render atom with no systems', () => {
    expect(frameCapability.systems).toHaveLength(0);
  });

  it('provides Frame categorized as render', () => {
    expect(frameCapability.components.provides.Frame.category).toBe('render');
  });

  it('stores and reads back', () => {
    const w = new World();
    w.createEntity('e');
    const f: Frame = { type: 'Frame', index: 3, total: 8 };
    w.addComponent('e', f);
    const got = w.getComponent<Frame>('e', 'Frame')!;
    expect(got.index).toBe(3);
    expect(got.total).toBe(8);
  });

  it('defaults to a single static frame', () => {
    expect(frameCapability.config.index.default).toBe(0);
    expect(frameCapability.config.total.default).toBe(1);
  });
});
