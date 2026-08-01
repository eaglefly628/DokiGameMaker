// Game I · 游戏 AI 样例（底座「索敌 + 寻路」能力展示）
//
// 纯蓝图数据，不写专属 system：
//   · 索敌（aggro）：敌方单位挂 Perception{targetTag:玩家}+Tag+Transform → 每拍锁定最近玩家 → 写 Relation(target)。
//   · 寻路（grid-move）：敌方挂 HexPos+GridMover+(aggro 写的)Relation → hex A* 求下一格、绕开占位、到相邻停 → 写 HexPos+投影 Transform。
// 引擎 CanvasRenderer 实时绘制：玩家居中（金圆），五个敌人从四周沿六边形网格寻路逼近。全是数据，最弱 LLM 能填。

import type { WorldBlueprint } from '../../assembly/demo.assembly.js';
import { transformCapability, shapeCapability, colorCapability } from '@atom-skills/index.js';
import { aggroCapability } from '@skills/tier3/aggro.js';
import { gridMoveCapability } from '@skills/tier2/grid-move.js';

// 阵营位（Tag.flags）：玩家 / 敌人。
const PLAYER = 1 << 0; // 1
const ENEMY = 1 << 2;  // 4

const TILE = 40, OX = 50, OY = 50;
// hex 轴向格 → 像素（与 grid-move 内 hexCellToPoint 同式：x=OX+q·TILE+r·TILE/2, y=OY+r·TILE·0.75）。
const px = (q: number, r: number): { x: number; y: number } => ({ x: OX + q * TILE + r * (TILE / 2), y: OY + r * (TILE * 0.75) });

function enemy(q: number, r: number, tint: number): WorldBlueprint['entities'][string] {
  const p = px(q, r);
  return {
    Transform: { x: p.x, y: p.y, rotation: 0, scaleX: 1, scaleY: 1 }, // 初值=投影位（aggro 首拍据此测距）
    HexPos: { q, r },
    GridMover: { period: 16, range: 1, elapsed: 0, glideSpeed: 2.6 }, // 每 16 tick 走一格·平滑滑行·到相邻停
    Perception: { targetTag: PLAYER, sightRadius: 0 },                 // 视野无限 → 永远锁玩家
    Tag: { flags: ENEMY },
    Shape: { kind: 'box', width: 26, height: 26 },
    Color: { tint, alpha: 1 },
  };
}

/** 游戏 AI 样例蓝图：玩家居中，五敌索敌（aggro）+ 寻路（grid-move）逼近。 */
export function aiBlueprint(): WorldBlueprint {
  const pc = px(6, 4);
  return {
    capabilities: [transformCapability, shapeCapability, colorCapability, aggroCapability, gridMoveCapability],
    entities: {
      board: { HexBoard: { cols: 13, rows: 9, tileSize: TILE, originX: OX, originY: OY, layout: 'axial' } },
      // 玩家：静止（无 GridMover/Perception），作为敌人的索敌目标。
      player: {
        Transform: { x: pc.x, y: pc.y, rotation: 0, scaleX: 1, scaleY: 1 },
        HexPos: { q: 6, r: 4 },
        Tag: { flags: PLAYER },
        Shape: { kind: 'circle', radius: 17 },
        Color: { tint: 0xd4bd8a, alpha: 1 },
      },
      'enemy-1': enemy(1, 1, 0xd07a6a),
      'enemy-2': enemy(11, 1, 0xd07a6a),
      'enemy-3': enemy(2, 7, 0xc98a86),
      'enemy-4': enemy(10, 7, 0xc98a86),
      'enemy-5': enemy(6, 0, 0xe0a070),
    },
  };
}
