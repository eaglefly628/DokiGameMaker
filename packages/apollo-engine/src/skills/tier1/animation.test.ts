import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Frame, TimerDone } from '@engine/protocol/components.js';
import { animationCapability } from './animation.js';

function mk(): World {
  const w = new World();
  for (const s of animationCapability.systems) w.addSystem(s);
  return w;
}
const F = (w: World): Frame => w.getComponent<Frame>('e', 'Frame')!;
function frame(w: World, index: number, total: number): void {
  w.createEntity('e');
  w.addComponent('e', { type: 'Frame', index, total } as Frame);
}
const done = (w: World): void => w.addComponent('e', { type: 'TimerDone', timerId: 't' } as TimerDone);

describe('T1 animation', () => {
  it('契约：读 Frame+TimerDone / 写 Frame（BUG-003：不再 consume，TimerDone 由 timer-advance 自清）', () => {
    expect(animationCapability.components.reads).toEqual(['Frame', 'TimerDone']);
    expect(animationCapability.components.consumes).toEqual([]);
    expect(animationCapability.components.writes).toEqual(['Frame']);
  });
  it('TimerDone → index+1（不再由 animation 消费 TimerDone；生产者 timer-advance 负责清）', () => {
    const w = mk();
    frame(w, 0, 3);
    done(w);
    w.tick();
    expect(F(w).index).toBe(1);
    expect(w.hasComponent('e', 'TimerDone')).toBe(true); // BUG-003：animation 不再 consume，留给 timer-advance 自清
  });
  it('loop 环绕 total', () => {
    const w = mk();
    frame(w, 2, 3);
    done(w);
    w.tick();
    expect(F(w).index).toBe(0);
  });
  it('无 TimerDone 不变', () => {
    const w = mk();
    frame(w, 1, 3);
    w.tick();
    expect(F(w).index).toBe(1);
  });
});
