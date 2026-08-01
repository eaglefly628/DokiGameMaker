import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { flagCapability } from './index.js';
import type { Flag } from '@engine/protocol/components.js';

describe('F2 flag — component shape', () => {
  it('creates a Flag component with explicit values', () => {
    const flag: Flag = { type: 'Flag', id: 'grounded', active: true };
    expect(flag.type).toBe('Flag');
    expect(flag.id).toBe('grounded');
    expect(flag.active).toBe(true);
  });

  it('active defaults to false when explicitly set', () => {
    const flag: Flag = { type: 'Flag', id: 'skill-ready', active: false };
    expect(flag.active).toBe(false);
  });

  it('active toggles between true and false', () => {
    const flag: Flag = { type: 'Flag', id: 'door-open', active: false };
    flag.active = true;
    expect(flag.active).toBe(true);
    flag.active = false;
    expect(flag.active).toBe(false);
  });

  it('id can be any non-empty string', () => {
    const a: Flag = { type: 'Flag', id: 'invincible', active: false };
    const b: Flag = { type: 'Flag', id: 'boss-defeated', active: true };
    expect(a.id).toBe('invincible');
    expect(b.id).toBe('boss-defeated');
  });
});

describe('F2 flag — World integration', () => {
  it('addComponent / getComponent round-trip', () => {
    const world = new World();
    world.createEntity('player');
    const flag: Flag = { type: 'Flag', id: 'grounded', active: false };
    world.addComponent('player', flag);

    const retrieved = world.getComponent<Flag>('player', 'Flag');
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe('grounded');
    expect(retrieved!.active).toBe(false);
  });

  it('active=true round-trip', () => {
    const world = new World();
    world.createEntity('enemy');
    const alerted: Flag = { type: 'Flag', id: 'alerted', active: true };
    world.addComponent('enemy', alerted);

    const retrieved = world.getComponent<Flag>('enemy', 'Flag');
    expect(retrieved!.active).toBe(true);
  });

  it('mutating active field is reflected via getComponent', () => {
    const world = new World();
    world.createEntity('e1');
    const flag: Flag = { type: 'Flag', id: 'door-open', active: false };
    world.addComponent('e1', flag);

    flag.active = true;
    expect(world.getComponent<Flag>('e1', 'Flag')!.active).toBe(true);
  });

  it('hasComponent returns true after addComponent', () => {
    const world = new World();
    world.createEntity('e2');
    const ready: Flag = { type: 'Flag', id: 'ready', active: false };
    world.addComponent('e2', ready);
    expect(world.hasComponent('e2', 'Flag')).toBe(true);
  });

  it('removeComponent removes the flag', () => {
    const world = new World();
    world.createEntity('e3');
    const active: Flag = { type: 'Flag', id: 'active', active: true };
    world.addComponent('e3', active);
    world.removeComponent('e3', 'Flag');
    expect(world.hasComponent('e3', 'Flag')).toBe(false);
  });

  it('query returns entity with Flag component', () => {
    const world = new World();
    world.createEntity('hero');
    world.createEntity('npc');
    const grounded: Flag = { type: 'Flag', id: 'grounded', active: true };
    world.addComponent('hero', grounded);

    const results = world.query('Flag');
    expect(results).toHaveLength(1);
    expect(results[0][0]).toBe('hero');
  });

  it('each entity holds an independent Flag (one type per entity)', () => {
    const world = new World();
    world.createEntity('a');
    world.createEntity('b');
    const flagA: Flag = { type: 'Flag', id: 'grounded', active: true };
    const flagB: Flag = { type: 'Flag', id: 'grounded', active: false };
    world.addComponent('a', flagA);
    world.addComponent('b', flagB);

    expect(world.getComponent<Flag>('a', 'Flag')!.active).toBe(true);
    expect(world.getComponent<Flag>('b', 'Flag')!.active).toBe(false);
  });
});

describe('F2 flag — capability metadata', () => {
  it('id matches periodic table entry', () => {
    expect(flagCapability.id).toBe('f2-flag');
  });

  it('systems array is empty (flag is pure data, no built-in system)', () => {
    expect(flagCapability.systems).toHaveLength(0);
  });

  it('provides exactly the Flag component', () => {
    expect(Object.keys(flagCapability.components.provides)).toEqual(['Flag']);
  });

  it('Flag component has category "config"', () => {
    expect(flagCapability.components.provides.Flag.category).toBe('config');
  });

  it('Flag fields match periodic table: id (string) + active (boolean)', () => {
    const fields = flagCapability.components.provides.Flag.fields;
    expect(fields.id.type).toBe('string');
    expect(fields.active.type).toBe('boolean');
    expect(Object.keys(fields)).toEqual(['id', 'active']);
  });

  it('reads / writes / consumes are all empty', () => {
    expect(flagCapability.components.reads).toHaveLength(0);
    expect(flagCapability.components.writes).toHaveLength(0);
    expect(flagCapability.components.consumes).toHaveLength(0);
  });

  it('config exposes id (input) and active (toggle, default false)', () => {
    expect(flagCapability.config.id.ui.control).toBe('input');
    expect(flagCapability.config.active.ui.control).toBe('toggle');
    expect(flagCapability.config.active.default).toBe(false);
  });
});
