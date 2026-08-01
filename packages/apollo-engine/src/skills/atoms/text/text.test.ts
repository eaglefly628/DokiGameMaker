import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { textCapability } from './index.js';
import type { Text } from '@engine/protocol/components.js';

describe('text atom', () => {
  it('is a pure-data render atom with no systems', () => {
    expect(textCapability.systems).toHaveLength(0);
  });

  it('provides Text categorized as render', () => {
    expect(textCapability.components.provides.Text.category).toBe('render');
  });

  it('stores and reads back', () => {
    const w = new World();
    w.createEntity('e');
    const t: Text = { type: 'Text', content: '-25', fontSize: 20, fontFamily: 'sans-serif', anchor: 'center', lineSpacing: 0 };
    w.addComponent('e', t);
    const got = w.getComponent<Text>('e', 'Text')!;
    expect(got.content).toBe('-25');
    expect(got.fontSize).toBe(20);
  });

  it('anchor config defaults to center with left/center/right options', () => {
    expect(textCapability.config.anchor.default).toBe('center');
    expect(textCapability.config.anchor.ui.options).toEqual(['left', 'center', 'right']);
  });
});
