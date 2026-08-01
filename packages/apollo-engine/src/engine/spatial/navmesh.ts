// ═══════════════════════════════════════════════════════════════
//  导航网格自动烘焙 · 纯函数核（REQ-3D-Nav · owner 2026-06-28 拍板「自动摆放」）。
//  把碰撞体 AABB **栅格化**成可行走方格（「寻路碰撞」），再把可行走格**自动织成主程的 `NavGraph`**
//  （节点=空格中心、边=空格相邻连通）—— 喂主程现成的 `pathfind`（A* + 沿路跟随 + collision-resolve 避让）。
//  「手摆 NavGraph」与「自动烘焙 NavGraph」**共存**：作者选一种（摆 NavGraph 或摆 NavMesh 配置）。
//
//  **确定性**（lockstep/录放安全·NavGraph 进 hash）：栅格化只用 floor/ceil/比较（整数化）；节点按格序
//  顺序编号、边按格序生成（与遍历序无关·跨端逐位一致）。斜边防穿角（两正交邻格须都空）。
//  这是 Recast「从几何自动生成 navmesh」的轻量确定性版（栅格而非多边形·先够盒庭·真需要再升多边形）。
// ═══════════════════════════════════════════════════════════════

export interface NavGridDef { originX: number; originZ: number; cellSize: number; cols: number; rows: number; }
export interface Rect2 { minX: number; maxX: number; minZ: number; maxZ: number; } // 世界 XZ 轴对齐矩形（障碍 footprint）
// 主程 NavGraph 的 nodes/edges 形状（避免耦合·结构一致即可被 pathfind 消费）。
export interface BakedGraph { nodes: Array<{ x: number; y: number }>; edges: Array<{ a: number; b: number }>; }

const cellIndex = (g: NavGridDef, cx: number, cz: number): number => cz * g.cols + cx;
const inBounds = (g: NavGridDef, cx: number, cz: number): boolean => cx >= 0 && cx < g.cols && cz >= 0 && cz < g.rows;

// 包围盒 + 格边长 → 网格定义（格 (0,0) 中心 = (minX,minZ)）。
export function gridFromBounds(minX: number, minZ: number, maxX: number, maxZ: number, cellSize: number): NavGridDef {
  const cols = Math.max(1, Math.floor((maxX - minX) / cellSize) + 1);
  const rows = Math.max(1, Math.floor((maxZ - minZ) / cellSize) + 1);
  return { originX: minX, originZ: minZ, cellSize, cols, rows };
}

// 格中心世界坐标。
export function cellCenter(g: NavGridDef, cx: number, cz: number): { x: number; z: number } {
  return { x: g.originX + cx * g.cellSize, z: g.originZ + cz * g.cellSize };
}

// 栅格化障碍：cell 的 AABB 与任一障碍矩形相交 → 标 blocked(1)。保守（宁多勿漏）·半径已在调用方膨进 rects。
export function rasterizeBlocked(g: NavGridDef, rects: readonly Rect2[]): Uint8Array {
  const grid = new Uint8Array(g.cols * g.rows);
  const half = g.cellSize / 2;
  for (const r of rects) {
    const cxLo = Math.max(0, Math.ceil((r.minX - half - g.originX) / g.cellSize));
    const cxHi = Math.min(g.cols - 1, Math.floor((r.maxX + half - g.originX) / g.cellSize));
    const czLo = Math.max(0, Math.ceil((r.minZ - half - g.originZ) / g.cellSize));
    const czHi = Math.min(g.rows - 1, Math.floor((r.maxZ + half - g.originZ) / g.cellSize));
    for (let cz = czLo; cz <= czHi; cz++) for (let cx = cxLo; cx <= cxHi; cx++) grid[cz * g.cols + cx] = 1;
  }
  return grid;
}

// 可行走格 → NavGraph（节点=空格中心·下标即 id；边=八向相邻空格·斜边防穿角）。世界坐标 (x, y=Z) 对齐 game-z Transform。
export function bakeNavGraph(g: NavGridDef, blocked: Uint8Array): BakedGraph {
  // 空格编号（按格序·确定性）。
  const nodeOf = new Int32Array(g.cols * g.rows).fill(-1);
  const nodes: Array<{ x: number; y: number }> = [];
  for (let cz = 0; cz < g.rows; cz++) for (let cx = 0; cx < g.cols; cx++) {
    if (blocked[cellIndex(g, cx, cz)]) continue;
    nodeOf[cellIndex(g, cx, cz)] = nodes.length;
    const p = cellCenter(g, cx, cz);
    nodes.push({ x: p.x, y: p.z }); // NavGraph.y = 世界 Z（game-z：Transform.y→Z）
  }
  // 边：只连「下标更大」的邻格免重（E、S、SE、SW）；斜边须两正交邻格都空（防穿角）。
  const edges: Array<{ a: number; b: number }> = [];
  const free = (cx: number, cz: number): boolean => inBounds(g, cx, cz) && !blocked[cellIndex(g, cx, cz)];
  for (let cz = 0; cz < g.rows; cz++) for (let cx = 0; cx < g.cols; cx++) {
    const a = nodeOf[cellIndex(g, cx, cz)];
    if (a < 0) continue;
    if (free(cx + 1, cz)) edges.push({ a, b: nodeOf[cellIndex(g, cx + 1, cz)] });       // E
    if (free(cx, cz + 1)) edges.push({ a, b: nodeOf[cellIndex(g, cx, cz + 1)] });       // S
    if (free(cx + 1, cz + 1) && free(cx + 1, cz) && free(cx, cz + 1)) edges.push({ a, b: nodeOf[cellIndex(g, cx + 1, cz + 1)] }); // SE
    if (free(cx - 1, cz + 1) && free(cx - 1, cz) && free(cx, cz + 1)) edges.push({ a, b: nodeOf[cellIndex(g, cx - 1, cz + 1)] }); // SW
  }
  return { nodes, edges };
}
