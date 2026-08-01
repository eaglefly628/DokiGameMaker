import { describe, it, expect } from 'vitest';
import { gridDims, gridCells, sheetSpec, atlasFrames } from './slice.js';

describe('slice — 网格切割数学', () => {
  it('整除网格：768×512 / 48×64 → 16×8', () => {
    const p = { sheetW: 768, sheetH: 512, cellW: 48, cellH: 64 };
    expect(gridDims(p)).toEqual({ cols: 16, rows: 8 });
    const cells = gridCells(p);
    expect(cells).toHaveLength(128);
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 48, h: 64 });
    expect(cells[16]).toEqual({ x: 0, y: 64, w: 48, h: 64 }); // 行优先折行
  });

  it('带 spacing/offset：尾部放不下的不算', () => {
    const p = { sheetW: 70, sheetH: 32, cellW: 32, cellH: 32, spacingX: 2 };
    expect(gridDims(p)).toEqual({ cols: 2, rows: 1 });
    expect(gridCells(p).map((c) => c.x)).toEqual([0, 34]);
    const off = { sheetW: 70, sheetH: 40, cellW: 32, cellH: 32, offsetX: 4, offsetY: 4 };
    expect(gridDims(off)).toEqual({ cols: 2, rows: 1 });
    expect(gridCells(off)[0]).toEqual({ x: 4, y: 4, w: 32, h: 32 });
  });

  it('非法单元尺寸 → 0 格（不除零）', () => {
    expect(gridDims({ sheetW: 64, sheetH: 64, cellW: 0, cellH: 32 })).toEqual({ cols: 0, rows: 0 });
  });

  it('sheetSpec：默认满格，可裁短，封顶不越界', () => {
    const p = { sheetW: 96, sheetH: 64, cellW: 32, cellH: 32 };
    expect(sheetSpec(p)).toEqual({ frameWidth: 32, frameHeight: 32, columns: 3, count: 6 });
    expect(sheetSpec(p, 4).count).toBe(4);
    expect(sheetSpec(p, 99).count).toBe(6);
  });

  it('atlasFrames：{n} 模板命名；keep 剔除空格后帧名仍连号', () => {
    const p = { sheetW: 96, sheetH: 32, cellW: 32, cellH: 32 };
    const all = atlasFrames(p, 'hero_walk_{n}');
    expect(Object.keys(all)).toEqual(['hero_walk_0', 'hero_walk_1', 'hero_walk_2']);
    const kept = atlasFrames(p, 'hero_{n}', [0, 2]);
    expect(kept).toEqual({
      hero_0: { x: 0, y: 0, w: 32, h: 32 },
      hero_1: { x: 64, y: 0, w: 32, h: 32 },
    });
  });
});
