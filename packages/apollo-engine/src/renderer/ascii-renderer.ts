import type { IWorld } from '@engine/core/types.js';
import { collectRenderables, type Renderable } from './renderable.js';

export interface AsciiRendererOptions {
  width?: number; // 网格列数
  height?: number; // 网格行数
  worldWidth?: number; // 世界宽 → 映射到列
  worldHeight?: number; // 世界高 → 映射到行
}

// 最简渲染后端：把世界投影成字符网格（终端可视化 / 调试）。
// 与 CanvasRenderer 共用 collectRenderables —— 核心一致，后端可换。
export class AsciiRenderer {
  constructor(private readonly opts: AsciiRendererOptions = {}) {}

  render(world: IWorld): string {
    const cols = this.opts.width ?? 40;
    const rows = this.opts.height ?? 12;
    const ww = this.opts.worldWidth ?? 120;
    const wh = this.opts.worldHeight ?? 200;
    const grid: string[][] = Array.from({ length: rows }, () => Array<string>(cols).fill('·'));

    for (const r of collectRenderables(world)) {
      const cx = Math.round((r.x / ww) * (cols - 1));
      const cy = Math.round((r.y / wh) * (rows - 1));
      if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue;
      grid[cy][cx] = glyphFor(r);
    }

    return grid.map((row) => row.join('')).join('\n');
  }
}

function glyphFor(r: Renderable): string {
  if (r.text) return r.text.content[0] ?? 'T';
  if (r.sprite) return r.sprite.textureKey[0]?.toUpperCase() ?? 'S';
  if (r.shape?.kind === 'circle') return 'o';
  if (r.shape?.kind === 'box') return '#';
  return '?';
}
