import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@engine/core/world.js';
import { stateCapability } from './index.js';
import type { State, StateChanged } from '@engine/protocol/components.js';

const system = stateCapability.systems[0];

function makeState(fsmId: string, current: string, previous: string): State {
  return { type: 'State', fsmId, current, previous };
}

describe('state-sync system', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
    world.addSystem(system);
  });

  it('emits no StateChanged when current equals previous', () => {
    world.createEntity('e');
    world.addComponent('e', makeState('behavior', 'idle', 'idle'));
    world.tick();
    expect(world.hasComponent('e', 'StateChanged')).toBe(false);
  });

  it('emits StateChanged and updates previous on transition', () => {
    world.createEntity('e');
    world.addComponent('e', makeState('behavior', 'attack', 'idle'));
    world.tick();

    const changed = world.getComponent<StateChanged>('e', 'StateChanged')!;
    expect(changed.fsmId).toBe('behavior');
    expect(changed.from).toBe('idle');
    expect(changed.to).toBe('attack');
    expect(world.getComponent<State>('e', 'State')!.previous).toBe('attack');
  });

  it('does not re-emit once previous catches up', () => {
    world.createEntity('e');
    world.addComponent('e', makeState('behavior', 'run', 'idle'));
    world.tick();
    world.removeComponent('e', 'StateChanged');
    world.tick();
    expect(world.hasComponent('e', 'StateChanged')).toBe(false);
  });

  it('detects a subsequent transition', () => {
    world.createEntity('e');
    world.addComponent('e', makeState('behavior', 'run', 'idle'));
    world.tick();
    world.removeComponent('e', 'StateChanged');

    world.getComponent<State>('e', 'State')!.current = 'jump';
    world.tick();
    const changed = world.getComponent<StateChanged>('e', 'StateChanged')!;
    expect(changed.from).toBe('run');
    expect(changed.to).toBe('jump');
  });
});
