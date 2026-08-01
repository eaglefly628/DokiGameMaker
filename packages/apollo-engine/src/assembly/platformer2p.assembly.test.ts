import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Component } from '@engine/core/types.js';
import type { Transform } from '@engine/protocol/components.js';
import { applyCommands } from '@net/index.js';
import type { Command } from '@net/index.js';
import { platformer2pBlueprint } from './platformer2p.assembly.js';

function load2p(): World {
  const w = new World();
  for (const cap of platformer2pBlueprint.capabilities) for (const s of cap.systems) w.addSystem(s);
  for (const [id, comps] of Object.entries(platformer2pBlueprint.entities)) {
    w.createEntity(id);
    for (const [type, data] of Object.entries(comps)) w.addComponent(id, { ...data, type } as Component);
  }
  return w;
}
const X = (w: World, id: string): number => w.getComponent<Transform>(id, 'Transform')!.x;
const Y = (w: World, id: string): number => w.getComponent<Transform>(id, 'Transform')!.y;
function step(w: World, cmds: Command[]): void {
  applyCommands(w, cmds);
  w.tick();
}
const move = (playerId: string, dx: number): Command => ({ playerId, tick: 0, move: { dx, dy: 0 } });

describe('platformer2p — 本地双人（命令按 playerId 路由，互不干扰）', () => {
  it('两名玩家同帧分别左右移动，各动各的', () => {
    const w = load2p();
    for (let i = 0; i < 40; i++) step(w, []); // 都落地
    const x1 = X(w, 'player1');
    const x2 = X(w, 'player2');
    for (let i = 0; i < 10; i++) step(w, [move('p1', -1), move('p2', 1)]); // p1 左、p2 右（彼此分开）
    expect(X(w, 'player1')).toBeLessThan(x1); // p1 向左
    expect(X(w, 'player2')).toBeGreaterThan(x2); // p2 向右
  });

  it('只给 p1 命令时 p2 不动（路由隔离）', () => {
    const w = load2p();
    for (let i = 0; i < 40; i++) step(w, []);
    const x2 = X(w, 'player2');
    for (let i = 0; i < 10; i++) step(w, [move('p1', 1)]);
    expect(X(w, 'player2')).toBe(x2); // p2 没收到命令 → 水平不动
  });

  it('玩家被 bounds-clamp 钳在世界内，不会跑出右边界', () => {
    const w = load2p();
    for (let i = 0; i < 200; i++) step(w, [move('p2', 1)]); // p2 一直向右顶（p1 在左侧远处，互不挡）
    const x = X(w, 'player2');
    expect(x).toBeLessThanOrEqual(625); // 半宽 15、世界右界 640 → 最多 625
    expect(x).toBeGreaterThan(600); // 确实顶到了右墙附近
  });

  it('两名玩家都受重力落到地面上', () => {
    const w = load2p();
    for (let i = 0; i < 60; i++) step(w, []);
    expect(Math.abs(Y(w, 'player1') - 333)).toBeLessThan(1); // 地面顶边 348 - 半高 15
    expect(Math.abs(Y(w, 'player2') - 333)).toBeLessThan(1);
  });
});
