import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Velocity, Acceleration, Controllable, Action } from '@engine/protocol/components.js';
import { applyCommands } from './commands.js';

// applyCommands 的平台语义扩展：让同一套输入接缝同时支持俯视（直接控速）和平台（重力+跳跃）。
describe('applyCommands — 平台语义（重力实体 vy 不被输入清零；jump→Action）', () => {
  it('有 Acceleration 的实体：输入只控水平，vy 保留给重力；jump → Action{jump}', () => {
    const w = new World();
    w.createEntity('p');
    w.addComponent('p', { type: 'Velocity', vx: 0, vy: 5, angular: 0 } as Velocity); // 正在下落
    w.addComponent('p', { type: 'Acceleration', ax: 0, ay: 1 } as Acceleration);
    w.addComponent('p', { type: 'Controllable', playerId: 'p1', speed: 3 } as Controllable);

    applyCommands(w, [{ playerId: 'p1', tick: 1, move: { dx: 1, dy: 0 }, jump: true }]);

    const v = w.getComponent<Velocity>('p', 'Velocity')!;
    expect(v.vx).toBe(3); // 水平受输入控制
    expect(v.vy).toBe(5); // 垂直保留（不被输入抹掉，交给重力/跳跃）
    expect(w.getComponent<Action>('p', 'Action')?.name).toBe('jump'); // 跳跃意图落成 Action
  });

  it('无输入：水平归零、Action 清掉，但重力实体 vy 仍保留', () => {
    const w = new World();
    w.createEntity('p');
    w.addComponent('p', { type: 'Velocity', vx: 9, vy: 7, angular: 0 } as Velocity);
    w.addComponent('p', { type: 'Acceleration', ax: 0, ay: 1 } as Acceleration);
    w.addComponent('p', { type: 'Controllable', playerId: 'p1', speed: 3 } as Controllable);
    w.addComponent('p', { type: 'Action', name: 'jump', value: 1 } as Action); // 上一帧残留

    applyCommands(w, []); // 这一帧无命令

    const v = w.getComponent<Velocity>('p', 'Velocity')!;
    expect(v.vx).toBe(0); // 无输入即不再水平移动
    expect(v.vy).toBe(7); // 垂直不动（重力管）
    expect(w.hasComponent('p', 'Action')).toBe(false); // Action 每帧重算 → 清掉
  });

  it('俯视实体（无 Acceleration）：行为不变，vy 仍由输入直接控制', () => {
    const w = new World();
    w.createEntity('p');
    w.addComponent('p', { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
    w.addComponent('p', { type: 'Controllable', playerId: 'p1', speed: 2 } as Controllable);

    applyCommands(w, [{ playerId: 'p1', tick: 1, move: { dx: 0, dy: 1 } }]);

    expect(w.getComponent<Velocity>('p', 'Velocity')!.vy).toBe(2); // 俯视：vy 受输入控制
    expect(w.hasComponent('p', 'Action')).toBe(false);
  });
});
