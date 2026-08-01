import type { AssetManifest } from '@assets/index.js';
import type { Suit, Rank, Card as DataCard } from './deck.js';

// ════════════════════════════════════════════════════════════════════════
//  Game E · 扑克牌精灵表（cards.png → 网格 UV 切片，纯数据）
//  一张 568×672 整图含全套牌，**8 列 × 7 行**网格（每格 **71×96**，竖长比例 ≈0.74）：
//    左半 4 列 = ♥♣♦♠，行 = A,2,3,4,5,6,7（7 行）
//    右半 4 列 = ♥♣♦♠，行 = K,Q,J,10,9,8（6 行）；末行(row6)右 = 两张 Joker + 牌背
//  注意：672/7=96（每格高）——不是 672/8=84。普通扑克牌是竖长的，84 那个会纵向切错。
//  渲染器按 (textureKey, frameIndex) 解析 sprite-sheet（数字索引、按 columns 折行）→ 实体挂
//  Sprite{textureKey:'cards'} + Frame{index: cardSheetIndex(card)} 即显对应牌。
//  「划分 UV」= 数据：列/行→索引是确定函数；sim 不碰像素，图活在资产层、不进 hash。
// ════════════════════════════════════════════════════════════════════════

export const CARDS_SHEET_KEY = 'cards';
export const CARDS_PNG = 'assets/FreeArtLib/cardgame/cards.png';

export const SHEET_W = 568;
export const SHEET_H = 672;
export const COLS = 8;
export const ROWS = 7;
export const CELL_W = SHEET_W / COLS; // 71
export const CELL_H = SHEET_H / ROWS; // 96

// 列内花色顺序（左右两半相同）：♥♣♦♠。
const SUIT_COL: Record<Suit, number> = { hearts: 0, clubs: 1, diamonds: 2, spades: 3 };
const LEFT_RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7']; // 左半（列 0-3）行序
const RIGHT_RANKS: readonly Rank[] = ['K', 'Q', 'J', '10', '9', '8']; // 右半（列 4-7）行序

export interface Cell {
  readonly col: number;
  readonly row: number;
}

/** 一张牌在网格中的 (col,row)。左半=花色列+行；右半=4+花色列+行。 */
export function cardCell(suit: Suit, rank: Rank): Cell {
  const li = LEFT_RANKS.indexOf(rank);
  if (li >= 0) return { col: SUIT_COL[suit], row: li };
  const ri = RIGHT_RANKS.indexOf(rank);
  return { col: 4 + SUIT_COL[suit], row: ri };
}

/** sprite-sheet 帧索引（按 columns 折行）：index = row*COLS + col。供 Frame.index。 */
export function cardSheetIndex(suit: Suit, rank: Rank): number {
  const { col, row } = cardCell(suit, rank);
  return row * COLS + col;
}
export const cardIndexOf = (c: DataCard): number => cardSheetIndex(c.suit, c.rank);

// 特殊帧索引（末行 row=6）。
export const JOKER_A_INDEX = 6 * COLS + 4; // 52
export const JOKER_B_INDEX = 6 * COLS + 5; // 53
export const CARD_BACK_INDEX = 6 * COLS + 6; // 54

/** 像素子矩形（供离线预览/调试切图）。 */
export function cardRect(suit: Suit, rank: Rank): { x: number; y: number; w: number; h: number } {
  const { col, row } = cardCell(suit, rank);
  return { x: col * CELL_W, y: row * CELL_H, w: CELL_W, h: CELL_H };
}

/** 资产清单项：cards.png 作为 8×8 sprite-sheet（含整图尺寸，headless 也可解析）。 */
export const CARDS_SHEET_MANIFEST: AssetManifest = [
  {
    kind: 'sprite-sheet',
    key: CARDS_SHEET_KEY,
    src: CARDS_PNG,
    frameWidth: CELL_W,
    frameHeight: CELL_H,
    columns: COLS,
    count: COLS * ROWS,
  },
];
