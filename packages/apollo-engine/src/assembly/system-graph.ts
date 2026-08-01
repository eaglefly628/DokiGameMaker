import type { SystemDeclaration, ComponentType } from '@engine/core/types.js';
import type { CapabilityDefinition } from '@engine/core/define-capability.js';

// ═══════════════════════════════════════════════════════════════
//  system-graph —— 系统调度依赖图分析（REQ-STAB·积木稳定性工具）。
//
//  引擎 topological-sort 在 load 时把一个 world 的全部系统按 phase 分桶、桶内拓扑排序：
//    · 组件推断边：A 写 X 且 B 读/consume X ⇒ A→B。
//    · 显式边：runsAfter[id]⇒id→self；runsBefore[id]⇒self→id。
//    · 显式边**删除相反方向的组件边**（打破 RMW 伪环）。
//  不可排（有环）→ 引擎抛错，但错误信息把「环 + 一切被环卡住的下游」全列出来（over-report），
//  且不指出是哪条边/哪个组件闭的环。本模块用 **Tarjan 精确切出最小 SCC**、点名闭环组件、给破环建议，
//  并检出两类**恒为 bug** 的形态：悬空显式边（runsBefore/runsAfter 指向不存在的系统=静默失效）、
//  重复 system id（同 id 多能力=idToIndex 覆盖·定序静默改变）。
//
//  健全性：world 只装子集系统；DAG 的子图恒为 DAG。故「全局图无 SCC ⇒ 任何 world 都可排」是充分条件。
//  但全局超集常含「现实从不同装」的能力组合而成环——因此 SCC 作**信息/棘轮**报，硬失败只给悬空边/重复 id。
//  本模块与 topological-sort 的边模型**逐条对齐**（改引擎调度语义须同步改此文件·配套 fidelity 测试钉死）。
// ═══════════════════════════════════════════════════════════════

export interface SysRef {
  id: string;
  capId: string;
  phase: number;
  sys: SystemDeclaration;
}

export interface Scc {
  phase: number;
  systems: Array<{ id: string; capId: string }>;
  /** 闭环的 RMW 组件（SCC 内既被写又被读的共享组件）——破环从这里下手。 */
  viaComponents: string[];
  /** 破环建议：在这些系统对之间加显式 runsBefore/runsAfter。 */
  suggestion: string;
}

export interface DanglingEdge {
  system: string;
  capId: string;
  kind: 'runsBefore' | 'runsAfter';
  ref: string; // 指向的不存在系统 id
}

export interface SystemGraphReport {
  systemCount: number;
  phases: number[];
  explicitEdgeCount: number;
  sccs: Scc[];
  danglingEdges: DanglingEdge[];
  duplicateIds: Array<{ id: string; caps: string[] }>;
  /** 全局按 phase 是否可排（无 SCC）。 */
  acyclic: boolean;
}

/** 展平所有能力的系统，标注 capId + phase（缺省 0）。 */
export function collectSystems(caps: readonly CapabilityDefinition[]): SysRef[] {
  const out: SysRef[] = [];
  for (const c of caps) {
    for (const s of c.systems ?? []) {
      out.push({ id: s.id, capId: c.id, phase: s.phase ?? 0, sys: s });
    }
  }
  return out;
}

/** 同一 system id 出现在 >1 能力（全局 idToIndex 会静默覆盖 → 定序不可预期）。 */
export function findDuplicateSystemIds(refs: readonly SysRef[]): Array<{ id: string; caps: string[] }> {
  const byId = new Map<string, string[]>();
  for (const r of refs) {
    const arr = byId.get(r.id) ?? [];
    arr.push(r.capId);
    byId.set(r.id, arr);
  }
  const dups: Array<{ id: string; caps: string[] }> = [];
  for (const [id, caps] of byId) if (caps.length > 1) dups.push({ id, caps });
  return dups.sort((a, b) => a.id.localeCompare(b.id));
}

/** 显式 runsBefore/runsAfter 指向一个**全局都不存在**的系统 id → 静默失效（typo/删系统的定序漏洞）。 */
export function findDanglingEdges(refs: readonly SysRef[]): DanglingEdge[] {
  const known = new Set(refs.map((r) => r.id));
  const out: DanglingEdge[] = [];
  for (const r of refs) {
    for (const ref of r.sys.runsBefore ?? []) if (!known.has(ref)) out.push({ system: r.id, capId: r.capId, kind: 'runsBefore', ref });
    for (const ref of r.sys.runsAfter ?? []) if (!known.has(ref)) out.push({ system: r.id, capId: r.capId, kind: 'runsAfter', ref });
  }
  return out;
}

// 单个 phase 桶内：完全复刻 topological-sort 的最终邻接（组件边经显式覆盖 + 显式边），
// 并记录每条组件边由哪个组件产生（供破环点名）。
interface PhaseGraph {
  refs: SysRef[];
  adj: Set<number>[];
  /** compEdgeComponents[u][v] = 产生 u→v 组件边的组件集合（用于点名 RMW 组件）。 */
  compEdgeComponents: Map<string, Set<string>>;
}

function buildPhaseGraph(refs: SysRef[]): PhaseGraph {
  const n = refs.length;
  const idToIndex = new Map<string, number>();
  refs.forEach((r, i) => idToIndex.set(r.id, i));

  const writersOf = new Map<ComponentType, number[]>();
  for (let i = 0; i < n; i++) for (const w of refs[i].sys.writes) {
    if (!writersOf.has(w)) writersOf.set(w, []);
    writersOf.get(w)!.push(i);
  }
  const componentEdges: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  const compEdgeComponents = new Map<string, Set<string>>();
  const noteComp = (u: number, v: number, c: string) => {
    const k = `${u}->${v}`;
    if (!compEdgeComponents.has(k)) compEdgeComponents.set(k, new Set());
    compEdgeComponents.get(k)!.add(c);
  };
  for (let i = 0; i < n; i++) {
    const deps = new Set([...refs[i].sys.reads, ...refs[i].sys.consumes]);
    for (const dep of deps) {
      const writers = writersOf.get(dep);
      if (!writers) continue;
      for (const w of writers) if (w !== i) { componentEdges[w].add(i); noteComp(w, i, dep); }
    }
  }

  const explicitEdges: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    for (const afterId of refs[i].sys.runsAfter ?? []) { const j = idToIndex.get(afterId); if (j !== undefined && j !== i) explicitEdges.push([j, i]); }
    for (const beforeId of refs[i].sys.runsBefore ?? []) { const j = idToIndex.get(beforeId); if (j !== undefined && j !== i) explicitEdges.push([i, j]); }
  }
  // 显式边删相反方向组件边。
  for (const [u, v] of explicitEdges) componentEdges[v].delete(u);

  const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let u = 0; u < n; u++) for (const v of componentEdges[u]) adj[u].add(v);
  for (const [u, v] of explicitEdges) adj[u].add(v);
  return { refs, adj, compEdgeComponents };
}

// Tarjan 强连通分量（迭代式·避免深递归爆栈）。返回 size>1 的 SCC（真环）。
function tarjanSccs(adj: Set<number>[]): number[][] {
  const n = adj.length;
  const index = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const onStack = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  let idx = 0;
  const out: number[][] = [];

  for (let s = 0; s < n; s++) {
    if (index[s] !== -1) continue;
    // 迭代 DFS：帧 = [node, 邻居迭代器数组下标]
    const work: Array<{ v: number; nbrs: number[]; i: number }> = [{ v: s, nbrs: [...adj[s]], i: 0 }];
    index[s] = low[s] = idx++; stack.push(s); onStack[s] = true;
    while (work.length) {
      const f = work[work.length - 1];
      if (f.i < f.nbrs.length) {
        const w = f.nbrs[f.i++];
        if (index[w] === -1) {
          index[w] = low[w] = idx++; stack.push(w); onStack[w] = true;
          work.push({ v: w, nbrs: [...adj[w]], i: 0 });
        } else if (onStack[w]) {
          low[f.v] = Math.min(low[f.v], index[w]);
        }
      } else {
        if (low[f.v] === index[f.v]) {
          const comp: number[] = [];
          for (;;) { const w = stack.pop()!; onStack[w] = false; comp.push(w); if (w === f.v) break; }
          if (comp.length > 1) out.push(comp);
        }
        work.pop();
        if (work.length) low[work[work.length - 1].v] = Math.min(low[work[work.length - 1].v], low[f.v]);
      }
    }
  }
  return out;
}

/** 完整分析：全部能力 → 悬空边 / 重复 id / 逐 phase 最小 SCC（含闭环组件 + 破环建议）。 */
export function analyzeSystemGraph(caps: readonly CapabilityDefinition[]): SystemGraphReport {
  const refs = collectSystems(caps);
  const duplicateIds = findDuplicateSystemIds(refs);
  const danglingEdges = findDanglingEdges(refs);
  let explicitEdgeCount = 0;
  for (const r of refs) explicitEdgeCount += (r.sys.runsBefore?.length ?? 0) + (r.sys.runsAfter?.length ?? 0);

  const phases = Array.from(new Set(refs.map((r) => r.phase))).sort((a, b) => a - b);
  const sccs: Scc[] = [];
  for (const phase of phases) {
    const pref = refs.filter((r) => r.phase === phase);
    const g = buildPhaseGraph(pref);
    for (const comp of tarjanSccs(g.adj)) {
      const set = new Set(comp);
      const via = new Set<string>();
      for (const u of comp) for (const v of g.adj[u]) {
        if (!set.has(v)) continue;
        const cs = g.compEdgeComponents.get(`${u}->${v}`);
        if (cs) for (const c of cs) via.add(c);
      }
      const systems = comp.map((i) => ({ id: pref[i].id, capId: pref[i].capId })).sort((a, b) => a.id.localeCompare(b.id));
      const viaComponents = [...via].sort();
      sccs.push({
        phase, systems, viaComponents,
        suggestion: viaComponents.length
          ? `在环内系统间加显式 runsBefore/runsAfter 打破 RMW（闭环组件：${viaComponents.join(', ')}）`
          : '在环内系统间加显式 runsBefore/runsAfter 打破',
      });
    }
  }
  return {
    systemCount: refs.length,
    phases,
    explicitEdgeCount,
    sccs,
    danglingEdges,
    duplicateIds,
    acyclic: sccs.length === 0,
  };
}
