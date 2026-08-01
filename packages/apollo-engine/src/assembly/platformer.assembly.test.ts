import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Component } from '@engine/core/types.js';
import type { Transform, Velocity } from '@engine/protocol/components.js';
import { applyCommands } from '@net/index.js';
import type { Command } from '@net/index.js';
import { platformerBlueprint } from './platformer.assembly.js';

// 复刻 Engine.load + Engine.step 的核心，headless 跑整条链：blueprint → 输入接缝 → 6 原子。
function loadWorld(): World {
  const w = new World();
  for (const cap of platformerBlueprint.capabilities) for (const s of cap.systems) w.addSystem(s);
  for (const [id, comps] of Object.entries(platformerBlueprint.entities)) {
    w.createEntity(id);
    for (const [type, data] of Object.entries(comps)) w.addComponent(id, { ...data, type } as Component);
  }
  return w;
}
const T = (w: World): Transform => w.getComponent<Transform>('player', 'Transform')!;
const V = (w: World): Velocity => w.getComponent<Velocity>('player', 'Velocity')!;
function step(w: World, cmds: Command[]): void {
  applyCommands(w, cmds); // Engine.step：先注入输入命令
  w.tick(); // 再跑一个模拟步
}
const jump = (w: World): Command => ({ playerId: 'p1', tick: w.getVersion() + 1, move: { dx: 0, dy: 0 }, jump: true });
const right = (w: World): Command => ({ playerId: 'p1', tick: w.getVersion() + 1, move: { dx: 1, dy: 0 } });

describe('platformer.assembly — 端到端可玩性（blueprint + 输入接缝 + 6 原子）', () => {
  it('玩家受重力下坠，被地面接住，停在地面之上', () => {
    const w = loadWorld();
    const startY = T(w).y; // 80
    for (let i = 0; i < 60; i++) step(w, []);
    const y = T(w).y;
    expect(y).toBeGreaterThan(startY); // 确实下落了
    expect(Math.abs(y - 333)).toBeLessThan(1); // 停在地面顶上（地面顶边 348 - 玩家半高 15）
    expect(Math.abs(V(w).vy)).toBeLessThan(1); // 垂直静止
  });

  it('落地后按跳 → 腾空（被 Grounded 闸门放行，升到远高于静止线）', () => {
    const w = loadWorld();
    for (let i = 0; i < 60; i++) step(w, []); // 先落地
    const restY = T(w).y;
    let minY = restY;
    for (let i = 0; i < 20; i++) {
      step(w, [jump(w)]);
      minY = Math.min(minY, T(w).y);
    }
    expect(minY).toBeLessThan(restY - 40); // 明显跃起（jumpSpeed=14、重力0.6）
  });

  it('左右输入 → 水平移动（横向复用 Controllable，且不被重力/落地干扰）', () => {
    const w = loadWorld();
    for (let i = 0; i < 60; i++) step(w, []); // 落地
    const x0 = T(w).x;
    for (let i = 0; i < 10; i++) step(w, [right(w)]);
    expect(T(w).x).toBeGreaterThan(x0); // 向右走了
    expect(Math.abs(T(w).y - 333)).toBeLessThan(2); // 仍贴地：水平移动不影响垂直
  });
});
