import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Transform } from '@engine/protocol/components.js';
import { transformCapability } from './index.js';

describe('A1 transform — capability metadata', () => {
  it('id and version are correct', () => {
    expect(transformCapability.id).toBe('a1-transform');
    expect(transformCapability.version).toBe('1.0.0');
  });

  it('has no systems (pure data atom)', () => {
    expect(transformCapability.systems).toHaveLength(0);
  });

  it('reads / writes / consumes are all empty', () => {
    expect(transformCapability.components.reads).toHaveLength(0);
    expect(transformCapability.components.writes).toHaveLength(0);
    expect(transformCapability.components.consumes).toHaveLength(0);
  });

  it('provides Transform with correct category', () => {
    const schema = transformCapability.components.provides['Transform'];
    expect(schema).toBeDefined();
    expect(schema.category).toBe('config');
  });

  it('Transform fields match periodic table A1 definition', () => {
    const fields = transformCapability.components.provides['Transform'].fields;
    expect(fields['x'].type).toBe('number');
    expect(fields['y'].type).toBe('number');
    expect(fields['rotation'].type).toBe('number');
    expect(fields['scaleX'].type).toBe('number');
    expect(fields['scaleY'].type).toBe('number');
    expect(Object.keys(fields)).toHaveLength(5);
  });

  it('config exposes all five initial-value params with correct defaults', () => {
    const cfg = transformCapability.config;
    expect(cfg['x'].default).toBe(0);
    expect(cfg['y'].default).toBe(0);
    expect(cfg['rotation'].default).toBe(0);
    expect(cfg['scaleX'].default).toBe(1);
    expect(cfg['scaleY'].default).toBe(1);
  });

  it('config controls are sliders', () => {
    const cfg = transformCapability.config;
    for (const key of ['x', 'y', 'rotation', 'scaleX', 'scaleY']) {
      expect(cfg[key].ui.control).toBe('slider');
    }
  });
});

describe('A1 transform — component via World', () => {
  it('addComponent / getComponent round-trip preserves all fields', () => {
    const world = new World();
    world.createEntity('e1');

    const transform: Transform = {
      type: 'Transform',
      x: 100,
      y: 200,
      rotation: Math.PI / 4,
      scaleX: 2,
      scaleY: 3,
    };

    world.addComponent('e1', transform);

    const got = world.getComponent<Transform>('e1', 'Transform');
    expect(got).toBeDefined();
    expect(got!.type).toBe('Transform');
    expect(got!.x).toBe(100);
    expect(got!.y).toBe(200);
    expect(got!.rotation).toBe(Math.PI / 4);
    expect(got!.scaleX).toBe(2);
    expect(got!.scaleY).toBe(3);
  });

  it('default-value component (zero position, unit scale) stores correctly', () => {
    const world = new World();
    world.createEntity('e2');

    const transform: Transform = {
      type: 'Transform',
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };

    world.addComponent('e2', transform);
    const got = world.getComponent<Transform>('e2', 'Transform');
    expect(got!.x).toBe(0);
    expect(got!.y).toBe(0);
    expect(got!.rotation).toBe(0);
    expect(got!.scaleX).toBe(1);
    expect(got!.scaleY).toBe(1);
  });

  it('negative coordinates are stored correctly', () => {
    const world = new World();
    world.createEntity('e3');

    const transform: Transform = {
      type: 'Transform',
      x: -500,
      y: -999,
      rotation: -Math.PI,
      scaleX: 0.5,
      scaleY: 0.25,
    };

    world.addComponent('e3', transform);
    const got = world.getComponent<Transform>('e3', 'Transform');
    expect(got!.x).toBe(-500);
    expect(got!.y).toBe(-999);
    expect(got!.rotation).toBe(-Math.PI);
    expect(got!.scaleX).toBe(0.5);
    expect(got!.scaleY).toBe(0.25);
  });

  it('overwriting a Transform replaces the previous one', () => {
    const world = new World();
    world.createEntity('e4');

    world.addComponent('e4', { type: 'Transform', x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    world.addComponent('e4', { type: 'Transform', x: 99, y: 88, rotation: 1, scaleX: 2, scaleY: 2 } as Transform);

    const got = world.getComponent<Transform>('e4', 'Transform');
    expect(got!.x).toBe(99);
    expect(got!.y).toBe(88);
  });

  it('hasComponent returns true after addComponent', () => {
    const world = new World();
    world.createEntity('e5');
    world.addComponent('e5', { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    expect(world.hasComponent('e5', 'Transform')).toBe(true);
  });

  it('removeComponent clears the Transform', () => {
    const world = new World();
    world.createEntity('e6');
    world.addComponent('e6', { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    world.removeComponent('e6', 'Transform');
    expect(world.hasComponent('e6', 'Transform')).toBe(false);
    expect(world.getComponent<Transform>('e6', 'Transform')).toBeUndefined();
  });

  it('query returns entity that has Transform', () => {
    const world = new World();
    world.createEntity('e7');
    world.createEntity('e8');

    world.addComponent('e7', { type: 'Transform', x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);

    const results = world.query('Transform');
    expect(results).toHaveLength(1);
    expect(results[0][0]).toBe('e7');
  });

  it('entity without Transform is excluded from query', () => {
    const world = new World();
    world.createEntity('e9');
    const results = world.query('Transform');
    expect(results).toHaveLength(0);
  });

  it('floating-point values are preserved exactly', () => {
    const world = new World();
    world.createEntity('e10');

    const x = 123.456789;
    const y = -0.000001;
    const rotation = Math.PI * 2;

    world.addComponent('e10', { type: 'Transform', x, y, rotation, scaleX: 1.5, scaleY: 0.75 } as Transform);
    const got = world.getComponent<Transform>('e10', 'Transform');
    expect(got!.x).toBe(x);
    expect(got!.y).toBe(y);
    expect(got!.rotation).toBe(rotation);
  });
});
