import type { SystemDeclaration, ComponentType } from './types.js';

// 系统定序：先按 phase 分桶（缺省 0=Update），phase 升序；桶内按「组件依赖 + 显式定序」拓扑排序；
// 跨 phase 的顺序由 phase 号决定。
//
// 桶内的边有两种来源：
//   1) 组件依赖（自动）：A 写 X 且 B 读/consume X ⇒ A 在 B 前。
//   2) 显式定序（runsAfter/runsBefore，按 id）：用于纯组件拓扑无法/不该表达的顺序。
// 关键：当两个系统都 read-modify-write 同一组件时，组件图会给出互为前驱的两条边 → 判成环；
// **显式边会覆盖相反方向的组件推断边**，从而以确定顺序打破这种 RMW 伪环（见 R10）。
export function topologicalSort(systems: SystemDeclaration[]): SystemDeclaration[] {
  const phases = Array.from(new Set(systems.map((s) => s.phase ?? 0))).sort((a, b) => a - b);
  if (phases.length <= 1) return sortWithinPhase(systems); // 全缺省 → 与原行为完全一致

  const result: SystemDeclaration[] = [];
  for (const phase of phases) {
    result.push(...sortWithinPhase(systems.filter((s) => (s.phase ?? 0) === phase)));
  }
  return result;
}

// 单个阶段内的拓扑排序（Kahn 算法），边 = 组件推断边（经显式定序覆盖后）+ 显式定序边。
function sortWithinPhase(systems: SystemDeclaration[]): SystemDeclaration[] {
  const n = systems.length;
  const idToIndex = new Map<string, number>();
  for (let i = 0; i < n; i++) idToIndex.set(systems[i].id, i);

  // 1) 组件推断边：writer(X) → reader/consumer(X)。单独存放，便于被显式边覆盖。
  const writersOf = new Map<ComponentType, number[]>();
  for (let i = 0; i < n; i++) {
    for (const w of systems[i].writes) {
      if (!writersOf.has(w)) writersOf.set(w, []);
      writersOf.get(w)!.push(i);
    }
  }
  const componentEdges: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let i = 0; i < n; i++) {
    const deps = new Set([...systems[i].reads, ...systems[i].consumes]);
    for (const dep of deps) {
      const writers = writersOf.get(dep);
      if (!writers) continue;
      for (const w of writers) if (w !== i) componentEdges[w].add(i);
    }
  }

  // 2) 显式定序边（仅限本桶内的 id）：runsAfter[X] ⇒ X→self；runsBefore[Y] ⇒ self→Y。
  const explicitEdges: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    for (const afterId of systems[i].runsAfter ?? []) {
      const j = idToIndex.get(afterId);
      if (j !== undefined && j !== i) explicitEdges.push([j, i]);
    }
    for (const beforeId of systems[i].runsBefore ?? []) {
      const j = idToIndex.get(beforeId);
      if (j !== undefined && j !== i) explicitEdges.push([i, j]);
    }
  }

  // 3) 显式边覆盖相反方向的组件推断边（打破 RMW 伪环）。
  for (const [u, v] of explicitEdges) componentEdges[v].delete(u);

  // 4) 合并成最终邻接表（先组件边后显式边，保证缺省情形与原实现逐位一致）。
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let u = 0; u < n; u++) for (const v of componentEdges[u]) adj[u].add(v);
  for (const [u, v] of explicitEdges) adj[u].add(v);

  const inDegree = new Array(n).fill(0);
  for (let u = 0; u < n; u++) for (const v of adj[u]) inDegree[v]++;

  // Kahn's algorithm（按 index 顺序入队 → 确定性、稳定）
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  const sorted: SystemDeclaration[] = [];
  while (queue.length > 0) {
    const idx = queue.shift()!;
    sorted.push(systems[idx]);
    for (const neighbor of adj[idx]) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    }
  }

  if (sorted.length !== n) {
    const missing = systems.filter((_, i) => !sorted.includes(systems[i])).map((s) => s.id);
    throw new Error(
      `Circular dependency detected among systems: ${missing.join(', ')}. ` +
        `若两系统读改写同一组件，用 runsAfter/runsBefore 显式定序打破。`,
    );
  }

  return sorted;
}
