import type { Rect } from '../asset-types.js';
import type { SheetSpec } from '../asset-index.js';

// 精灵表切割 —— 纯网格数学：未切割的整张 UV/精灵表 + 网格参数 → 帧矩形。
// 产物两种形态（都落回 AssetIndex 既有契约，运行时零新概念）：
//  · sprite-sheet（等分网格）：spec.sheet = {frameWidth,frameHeight,columns,count} → Frame.index 按列折行
//  · atlas（命名帧）：spec.frames = {名字→矩形} → Sprite/动画剪辑按帧名取

export interface GridParams {
  readonly sheetW: number;
  readonly sheetH: number;
  readonly cellW: number;
  readonly cellH: number;
  /** 整体起点偏移。 */
  readonly offsetX?: number;
  readonly offsetY?: number;
  /** 单元间距。 */
  readonly spacingX?: number;
  readonly spacingY?: number;
}

/** 网格能容纳的列/行数（参数非法返回 0）。 */
export function gridDims(p: GridParams): { cols: number; rows: number } {
  if (p.cellW <= 0 || p.cellH <= 0) return { cols: 0, rows: 0 };
  const ox = p.offsetX ?? 0;
  const oy = p.offsetY ?? 0;
  const sx = p.spacingX ?? 0;
  const sy = p.spacingY ?? 0;
  const cols = Math.floor((p.sheetW - ox + sx) / (p.cellW + sx));
  const rows = Math.floor((p.sheetH - oy + sy) / (p.cellH + sy));
  return { cols: Math.max(0, cols), rows: Math.max(0, rows) };
}

/** 全部单元矩形（行优先，与 sprite-sheet 的 Frame.index 折行规则一致）。 */
export function gridCells(p: GridParams): Rect[] {
  const { cols, rows } = gridDims(p);
  const ox = p.offsetX ?? 0;
  const oy = p.offsetY ?? 0;
  const sx = p.spacingX ?? 0;
  const sy = p.spacingY ?? 0;
  const out: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ x: ox + c * (p.cellW + sx), y: oy + r * (p.cellH + sy), w: p.cellW, h: p.cellH });
    }
  }
  return out;
}

/** 等分网格 → spec.sheet（sprite-sheet 形态）。`count` 可裁短（尾部空格不计）。 */
export function sheetSpec(p: GridParams, count?: number): SheetSpec {
  const { cols, rows } = gridDims(p);
  const max = cols * rows;
  return {
    frameWidth: p.cellW,
    frameHeight: p.cellH,
    columns: cols,
    count: count !== undefined ? Math.min(Math.max(0, count), max) : max,
  };
}

/**
 * 命名帧 → spec.frames（atlas 形态）。模板里 `{n}` 替换为帧序号（0 基，行优先）。
 * `keep` 可选：仅保留指定序号（如剔除空白格——空白判定需像素，由 UI 层用 canvas 算出后传入）。
 */
export function atlasFrames(p: GridParams, template: string, keep?: readonly number[]): Record<string, Rect> {
  const cells = gridCells(p);
  const pick = keep ? keep.filter((i) => i >= 0 && i < cells.length) : cells.map((_, i) => i);
  const out: Record<string, Rect> = {};
  pick.forEach((cellIdx, seq) => {
    // 名字里的 {n} = 输出序号（连续 0..k-1），不是格子号——剔除空格后帧名仍连号。
    out[template.replace(/\{n\}/g, String(seq))] = cells[cellIdx];
  });
  return out;
}
