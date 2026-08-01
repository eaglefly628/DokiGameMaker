// 导航网格自动烘焙 · 纯函数核（REQ-3D-Nav）。确定性·栅格化 + 织图。
import { describe, it, expect } from 'vitest';
import { gridFromBounds, rasterizeBlocked, bakeNavGraph, type Rect2 } from './navmesh.js';

describe('navmesh · 栅格化 + 自动织 NavGraph', () => {
  it('gridFromBounds：范围+格边长 → 行列/原点', () => {
    const g = gridFromBounds(-10, -10, 10, 10, 2);
    expect(g.cols).toBe(11);
    expect(g.rows).toBe(11);
    expect(g.originX).toBe(-10);
  });

  it('空网格 → 全格成航点 + 有连边', () => {
    const g = gridFromBounds(-10, -10, 10, 10, 2);
    const baked = bakeNavGraph(g, rasterizeBlocked(g, []));
    expect(baked.nodes.length).toBe(g.cols * g.rows);
    expect(baked.edges.length).toBeGreaterThan(0);
  });

  it('寻路碰撞：障碍矩形处不生成航点（封格无节点）', () => {
    const g = gridFromBounds(-10, -10, 10, 10, 2);
    const wall: Rect2 = { minX: -1, maxX: 1, minZ: -6, maxZ: 6 }; // 中间竖墙
    const blocked = rasterizeBlocked(g, [wall]);
    const baked = bakeNavGraph(g, blocked);
    let blockedCount = 0;
    for (let i = 0; i < blocked.length; i++) if (blocked[i]) blockedCount++;
    expect(blockedCount).toBeGreaterThan(0);
    expect(baked.nodes.length).toBe(g.cols * g.rows - blockedCount); // 封格不成节点
    // 墙心 (0,0) 附近无航点
    expect(baked.nodes.some((n) => Math.abs(n.x) < 1 && Math.abs(n.y) < 1)).toBe(false);
  });

  it('边只连可行走相邻格·斜边防穿角（不连对角穿墙）', () => {
    const g = gridFromBounds(0, 0, 4, 4, 2); // 3×3
    // 封住 (1,0) 和 (0,1) → 对角 (0,0)-(1,1) 不应连（防穿角）
    const blocked = rasterizeBlocked(g, [{ minX: 2, maxX: 2, minZ: 0, maxZ: 0 }, { minX: 0, maxX: 0, minZ: 2, maxZ: 2 }]);
    const baked = bakeNavGraph(g, blocked);
    const idx = (x: number, y: number): number => baked.nodes.findIndex((n) => n.x === x && n.y === y);
    const a = idx(0, 0), b = idx(2, 2); // 两对角格
    const linked = baked.edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
    expect(linked).toBe(false); // 防穿角：两正交邻格被封 → 不连对角
  });

  it('确定性：同输入逐位同图', () => {
    const g = gridFromBounds(-10, -10, 10, 10, 2);
    const blocked = rasterizeBlocked(g, [{ minX: -1, maxX: 1, minZ: -6, maxZ: 6 }]);
    expect(bakeNavGraph(g, blocked)).toEqual(bakeNavGraph(g, blocked));
  });
});
