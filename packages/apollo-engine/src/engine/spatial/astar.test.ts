// 通用确定性 A*（astar.ts）单测：最短路 / 无路 / start==goal / 代价择优 / 确定性（tie-break 按节点 id）。
import { describe, it, expect } from 'vitest';
import { astar } from './astar.js';

// 小图工具：邻接表 + 均一/带权代价 + 零启发（退化 Dijkstra·便于验最短路）。
type Adj = number[][];
const neigh = (adj: Adj) => (n: number): readonly number[] => adj[n] ?? [];
const unitCost = (): number => 1;
const zeroH = (): number => 0;

describe('astar · 通用 A*', () => {
  it('直线图 0-1-2-3：求得全路径', () => {
    const adj: Adj = [[1], [0, 2], [1, 3], [2]];
    expect(astar(0, 3, neigh(adj), unitCost, zeroH)).toEqual([0, 1, 2, 3]);
  });

  it('start==goal → [start]', () => {
    expect(astar(2, 2, neigh([[], [], []]), unitCost, zeroH)).toEqual([2]);
  });

  it('无路（不连通）→ null', () => {
    const adj: Adj = [[1], [0], [3], [2]]; // {0,1} 与 {2,3} 两团
    expect(astar(0, 3, neigh(adj), unitCost, zeroH)).toBeNull();
  });

  it('带权择优：绕行总代价更低则选绕行', () => {
    // 0→3：直边代价 10；绕 0-1-2-3 各 1（合计 3）→ 选绕行。
    const adj: Adj = [[1, 3], [0, 2], [1, 3], [0, 2]];
    const cost = (a: number, b: number): number => ((a === 0 && b === 3) || (a === 3 && b === 0) ? 10 : 1);
    expect(astar(0, 3, neigh(adj), cost, zeroH)).toEqual([0, 1, 2, 3]);
  });

  it('启发可引导（admissible）仍得最短路', () => {
    const nodes = [{ x: 0 }, { x: 1 }, { x: 2 }, { x: 3 }];
    const adj: Adj = [[1], [0, 2], [1, 3], [2]];
    const h = (n: number): number => Math.abs(nodes[3].x - nodes[n].x); // 到 goal 的 x 距离·admissible
    const cost = (a: number, b: number): number => Math.abs(nodes[b].x - nodes[a].x);
    expect(astar(0, 3, neigh(adj), cost, h)).toEqual([0, 1, 2, 3]);
  });

  it('确定性：多次调用 + 等价分叉按节点 id tie-break → 路径唯一', () => {
    // 菱形：0→{1,2}→3，两条等长路（0-1-3 与 0-2-3）。tie-break 取小 id → 选经 1。
    const adj: Adj = [[1, 2], [0, 3], [0, 3], [1, 2]];
    const p1 = astar(0, 3, neigh(adj), unitCost, zeroH);
    const p2 = astar(0, 3, neigh(adj), unitCost, zeroH);
    expect(p1).toEqual(p2);
    expect(p1).toEqual([0, 1, 3]); // 经更小 id 的中间节点 1（确定）
  });
});
