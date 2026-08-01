import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { SystemPhase } from '@engine/core/types.js';
import type { Velocity, Action, Grounded } from '@engine/protocol/components.js';
import { jumpCapability, JUMP_SPEED } from './jump.js';

function worldWithJump(): World {
  const w = new World();
  for (const s of jumpCapability.systems) w.addSystem(s);
  return w;
}
function addPlayer(w: World, opts: { grounded: boolean; action?: string }): void {
  w.createEntity('p');
  w.addComponent('p', { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
  if (opts.grounded) w.addComponent('p', { type: 'Grounded' } as Grounded);
  if (opts.action) w.addComponent('p', { type: 'Action', name: opts.action, value: 1 } as Action);
}
const vy = (w: World): number => w.getComponent<Velocity>('p', 'Velocity')!.vy;

describe('T2 jump — capability metadata', () => {
  it('id / 跑在 Commit 阶段 / 读 Action+Grounded+Velocity / 写 Velocity', () => {
    expect(jumpCapability.id).toBe('t2-jump');
    expect(jumpCapability.systems[0].phase).toBe(SystemPhase.Commit);
    expect(jumpCapability.components.reads).toEqual(['Action', 'Grounded', 'Velocity']);
    expect(jumpCapability.components.writes).toEqual(['Velocity']);
  });
});

describe('T2 jump — behavior（Grounded 是起跳闸门）', () => {
  it('着地 + jump 动作 → 向上冲量', () => {
    const w = worldWithJump();
    addPlayer(w, { grounded: true, action: 'jump' });
    w.tick();
    expect(vy(w)).toBe(-JUMP_SPEED);
  });

  it('不在地面（无 Grounded）→ 不起跳（无二段跳）', () => {
    const w = worldWithJump();
    addPlayer(w, { grounded: false, action: 'jump' });
    w.tick();
    expect(vy(w)).toBe(0);
  });

  it('在地面但动作不是 jump → 不起跳', () => {
    const w = worldWithJump();
    addPlayer(w, { grounded: true, action: 'move' });
    w.tick();
    expect(vy(w)).toBe(0);
  });
});
