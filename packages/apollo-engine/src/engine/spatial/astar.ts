// astar —— 通用确定性 A*（纯函数·无副作用·整数节点 id）。从 hex.ts 的网格 A* 抽出的「图无关」核：
// 节点 = 整数 id（NavGraph 下标 / hex cellKey 皆可），邻居/代价/启发由调用方给。lockstep 安全：
// open 线性取 min 按 (fScore 升, 节点 id 升) tie-break → 路径唯一确定·不依赖 Map/插入序（同 hex.ts 纪律）。
// 代价/启发可为浮点（Euclidean 用 IEEE sqrt·确定性·与 steering/collision-resolve 同类）；tie-break 用整数 id 保确定。
//
// （注：tier2/hex.ts 的 hexNextStep 是本核的网格特化先例·暂未迁；二者算法同构·后续可让 hex 复用本核去重·
//  独立改动免连累 grid-move 既测。当前 NavGraph 寻路用本通用核·hex 维持原状。）

/**
 * 通用 A*：求 start→goal 的最短路（含两端的节点 id 序列），无路 → null。
 * @param start     起点节点 id（整数）
 * @param goal      终点节点 id（整数）
 * @param neighbors 节点 → 邻居节点 id 列表（确定性顺序：同一节点每次返回同序）
 * @param cost      相邻两节点的边代价（应 > 0）
 * @param heuristic 节点 → 到 goal 的估计代价（admissible：不高估真实代价 → 保最短路）
 */
export function astar(
  start: number,
  goal: number,
  neighbors: (n: number) => readonly number[],
  cost: (a: number, b: number) => number,
  heuristic: (n: number) => number,
): number[] | null {
  if (start === goal) return [start];
  const gScore = new Map<number, number>([[start, 0]]);
  const cameFrom = new Map<number, number>(); // childId → parentId
  // open：{id,f}；小图用数组 + 线性取 min（按 f 升、id 升 tie-break）→ 确定（不依赖插入/Map 序）。
  const open: Array<{ id: number; f: number }> = [{ id: start, f: heuristic(start) }];

  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bi].f || (open[i].f === open[bi].f && open[i].id < open[bi].id)) bi = i;
    }
    const cur = open.splice(bi, 1)[0].id;
    if (cur === goal) {
      // 回溯 cameFrom → 反转得 start..goal。
      const path = [cur];
      let k = cur;
      while (cameFrom.has(k)) { k = cameFrom.get(k)!; path.push(k); }
      return path.reverse();
    }
    const g = gScore.get(cur)!;
    for (const nb of neighbors(cur)) {
      const ng = g + cost(cur, nb);
      if (ng < (gScore.get(nb) ?? Infinity)) {
        cameFrom.set(nb, cur);
        gScore.set(nb, ng);
        const f = ng + heuristic(nb);
        const ex = open.find((o) => o.id === nb);
        if (ex) ex.f = f; else open.push({ id: nb, f }); // 已闭合(splice 出)则重入 open（处理重开）
      }
    }
  }
  return null; // 无路（图不连通）
}
