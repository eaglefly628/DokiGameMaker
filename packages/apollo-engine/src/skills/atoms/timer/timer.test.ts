import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@engine/core/world.js';
import { timerCapability } from './index.js';
import type { Timer, TimerDone } from '@engine/protocol/components.js';

const system = timerCapability.systems[0];

function makeTimer(id: string, duration: number, loop: boolean, elapsed = 0): Timer {
  return { type: 'Timer', id, elapsed, duration, loop };
}

describe('timer-advance system', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
    world.addSystem(system);
  });

  it('increments elapsed by 1 each tick', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeTimer('t', 5, false));

    world.tick();
    expect(world.getComponent<Timer>('e1', 'Timer')!.elapsed).toBe(1);
    world.tick();
    expect(world.getComponent<Timer>('e1', 'Timer')!.elapsed).toBe(2);
  });

  it('does not emit TimerDone before duration', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeTimer('t', 3, false));

    world.tick();
    world.tick();
    expect(world.hasComponent('e1', 'TimerDone')).toBe(false);
  });

  it('emits TimerDone when elapsed reaches duration', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeTimer('life', 3, false));

    world.tick();
    world.tick();
    world.tick();

    expect(world.hasComponent('e1', 'TimerDone')).toBe(true);
    expect(world.getComponent<TimerDone>('e1', 'TimerDone')!.timerId).toBe('life');
    expect(world.getComponent<Timer>('e1', 'Timer')!.elapsed).toBe(3);
  });

  it('non-loop timer fires once and does not re-fire', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeTimer('t', 2, false));

    world.tick();
    world.tick();
    expect(world.hasComponent('e1', 'TimerDone')).toBe(true);

    // simulate a downstream consumer removing the event
    world.removeComponent('e1', 'TimerDone');
    world.tick();
    expect(world.hasComponent('e1', 'TimerDone')).toBe(false);
    expect(world.getComponent<Timer>('e1', 'Timer')!.elapsed).toBe(2);
  });

  it('loop timer resets to 0 and fires repeatedly', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeTimer('beat', 2, true));

    world.tick();
    world.tick();
    expect(world.hasComponent('e1', 'TimerDone')).toBe(true);
    expect(world.getComponent<Timer>('e1', 'Timer')!.elapsed).toBe(0);

    world.removeComponent('e1', 'TimerDone');
    world.tick();
    expect(world.hasComponent('e1', 'TimerDone')).toBe(false);
    world.tick();
    expect(world.hasComponent('e1', 'TimerDone')).toBe(true);
    expect(world.getComponent<Timer>('e1', 'Timer')!.elapsed).toBe(0);
  });

  it('processes timers on different entities independently', () => {
    world.createEntity('a');
    world.addComponent('a', makeTimer('ta', 1, false));
    world.createEntity('b');
    world.addComponent('b', makeTimer('tb', 3, false));

    world.tick();
    expect(world.hasComponent('a', 'TimerDone')).toBe(true);
    expect(world.hasComponent('b', 'TimerDone')).toBe(false);
  });

  it('exposes a single timer-advance system', () => {
    expect(timerCapability.systems).toHaveLength(1);
    expect(timerCapability.systems[0].id).toBe('timer-advance');
  });
});
