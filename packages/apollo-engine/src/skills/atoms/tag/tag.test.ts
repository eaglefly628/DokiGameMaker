import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { tagCapability } from './index.js';
import type { Tag } from '@engine/protocol/components.js';

const ENEMY = 1 << 0;
const GROUND = 1 << 1;
const SOLID = 1 << 2;

describe('tag atom', () => {
  it('is a pure-data atom with no systems', () => {
    expect(tagCapability.systems).toHaveLength(0);
  });

  it('provides Tag with flags as a number', () => {
    expect(tagCapability.components.provides.Tag.fields.flags.type).toBe('number');
  });

  it('stores and reads back a Tag component', () => {
    const world = new World();
    world.createEntity('e1');
    const tag: Tag = { type: 'Tag', flags: ENEMY | SOLID };
    world.addComponent('e1', tag);

    expect(world.getComponent<Tag>('e1', 'Tag')!.flags).toBe(ENEMY | SOLID);
  });

  it('supports bitmask membership via bitwise AND', () => {
    const tag: Tag = { type: 'Tag', flags: GROUND | SOLID };
    expect((tag.flags & GROUND) !== 0).toBe(true);
    expect((tag.flags & SOLID) !== 0).toBe(true);
    expect((tag.flags & ENEMY) !== 0).toBe(false);
  });

  it('default flags is 0 (no classification)', () => {
    expect(tagCapability.config.flags.default).toBe(0);
    const tag: Tag = { type: 'Tag', flags: 0 };
    expect(tag.flags & ENEMY).toBe(0);
  });
});
