// 游戏 AI 样例：蓝图装进真 ECS → aggro 锁定玩家（索敌）+ grid-move 沿 hex A* 逼近（寻路）。
// 纯蓝图 + 现成能力，无专属 system。
import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import { aiBlueprint } from './ai-lab.js';
import { hexDistance } from '@skills/tier2/hex.js';
import type { Relation, HexPos } from '@engine/protocol/components.js';

describe('Game I · 游戏 AI 样例（索敌 + 寻路蓝图）', () => {
  it('蓝图纯数据：玩家 + 5 敌 + 棋盘（无专属 system）', () => {
    const bp = aiBlueprint();
    expect(bp.capabilities.length).toBeGreaterThan(0);
    expect(Object.keys(bp.entities)).toEqual(['board', 'player', 'enemy-1', 'enemy-2', 'enemy-3', 'enemy-4', 'enemy-5']);
  });

  it('索敌：aggro 给敌人写 Relation(target=player)', () => {
    const e = new Engine();
    e.load(aiBlueprint());
    e.world.tick();
    const rel = e.world.getComponent<Relation>('enemy-1', 'Relation');
    expect(rel?.kind).toBe('target');
    expect(rel?.targetId).toBe('player');
  });

  it('寻路：grid-move 让敌人沿 hex 网格逼近玩家（距离单调下降到相邻停）', () => {
    const e = new Engine();
    e.load(aiBlueprint());
    const player = e.world.getComponent<HexPos>('player', 'HexPos')!;
    const enemy0 = e.world.getComponent<HexPos>('enemy-1', 'HexPos')!;
    const d0 = hexDistance(enemy0, player);
    for (let i = 0; i < 400; i++) e.world.tick(); // 足够多拍走到贴脸
    const enemyN = e.world.getComponent<HexPos>('enemy-1', 'HexPos')!;
    const dN = hexDistance(enemyN, player);
    expect(dN).toBeLessThan(d0);                 // 逼近了
    expect(dN).toBe(1);                            // 到相邻格停（range:1）
  });
});
