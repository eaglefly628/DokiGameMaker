// Game F · 六边形棋盘配置（喂引擎 hex/grid-move 能力 —— 主程 REQ-024/027 已落地）。
//
// hex 数学（坐标/邻接/A* 寻路/投影）由**引擎**拥有：@skills/tier2/hex + grid-move。
// 本文件只剩纯**数据**：棋盘尺寸/投影常量 + 装饰性棋盘格生成（用引擎同款 odd-r 真投影对齐单位）。
//
// 布局：**odd-r（REQ-F-037 迁移，外审 Q5）**——sim 严格 axial、真投影 x=q·ts+r·ts/2，矩形观感来自
// 每行 axial q 范围随 −(r>>1) 平移 → **几何≡拓扑（视觉相邻=逻辑相邻）**，绕后/贴身判定不再骗人。
// （像素位置与旧 'offset' 恒等：col·ts+(r&1)·ts/2 ≡ (col−(r>>1))·ts+r·ts/2，画面不动、只换坐标语义。）
// **7×8 = 56 格错位矩形（用户 2026-06-11 钦定金铲铲真规格）**：单边 4×7、中线 r3/r4；
// 每个居中格恰 6 邻接——贴脸/包抄/光环范围的数理底座。摆子数据用视觉 (col,row)，
// 经 offsetToAxial 换算成 sim 的 axial (q,r)。（旧 12×12=144 格是注释与实现失配的历史错版。）
import type { EntityBlueprint } from '../../assembly/demo.assembly.js';
import { offsetToAxial } from '@skills/tier2/hex.js';

export { offsetToAxial }; // 供 blueprint/测试以视觉 (col,row) 摆子
export const COLS = 7;
export const ROWS = 8;
export const HALF_ROWS = 4;
export const TILE = 40; // 每格像素（= HexBoard.tileSize；7×8 小盘配大格，走位紧凑可读）
export const LAYOUT = 'odd-r' as const; // 错位矩形（REQ-F-037；旧 'offset' 已废弃待删）

// 横向居中；纵向整盘上移 30px——给棋盘下方让出备战席托盘排 + 商店三大框（金铲铲式纵向分区）。
export const ORIGIN_X = -((COLS - 1) * TILE + TILE / 2) / 2;
export const ORIGIN_Y = -((ROWS - 1) * TILE * 0.75) / 2 - 30;

// 引擎同款 odd-r 真投影（grid-move layout:'odd-r' 的复刻；仅用于装饰棋盘格/槽位对齐——单位投影由引擎做）。
export function project(q: number, r: number): { x: number; y: number } {
  return { x: ORIGIN_X + q * TILE + r * (TILE / 2), y: ORIGIN_Y + r * (TILE * 0.75) };
}

// 棋盘格实体（表现层底）：每格一个六边形贴片，落格中心、zOrder0（棋子之下）。
// r<HALF_ROWS(4) = 魏冷半场 / r>=4 = 蜀暖半场，分清两方领地（单边 4×7）。
export function boardEntities(warmKey: string, coolKey: string): Record<string, EntityBlueprint> {
  const out: Record<string, EntityBlueprint> = {};
  for (let r = 0; r < ROWS; r++) {
    for (let q = 0; q < COLS; q++) {
      // 装饰格按视觉 (col,row) 遍历，经 axial 投影落位（像素与旧版恒等）；id 维持视觉坐标命名。
      const a = offsetToAxial(q, r);
      const p = project(a.q, a.r);
      out[`hex_${q}_${r}`] = {
        Transform: { x: p.x, y: p.y, rotation: 0, scaleX: 1, scaleY: 1 },
        Sprite: { textureKey: r >= HALF_ROWS ? warmKey : coolKey, anchorX: 0.5, anchorY: 0.5, zOrder: 0 },
      };
    }
  }
  return out;
}
