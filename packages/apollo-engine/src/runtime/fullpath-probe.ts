import type { Engine } from './engine.js';
import type { World } from '@engine/core/world.js';
import type { WorldSnapshot } from '@engine/core/types.js';

// ═══════════════════════════════════════════════════════════════
//  全路径回归探针（Loop B）—— 无头、确定性的「点遍所有声明按钮」回归测试基建。
//
//  数据驱动游戏的红利：UI 是数据（GameShell UILayout），按钮可**枚举**（collectButtons →
//  signal 列表）；世界是确定的（world.hash）。于是「点遍所有按钮、断言无报错/无 NaN/可复现」
//  不靠脆弱的像素或 DOM 选择器，只靠数据遍历 + 引擎 tick。
//
//  本探针游戏无关：调用方提供 `makeEngine`（造一局干净世界）、`fire`（把一个信号投进输入总线）、
//  `signals`（要点的按钮信号集，通常来自 collectButtons(UILayout)）。
//  纯测试/工具，只读/驱动 world，不改引擎语义。
// ═══════════════════════════════════════════════════════════════

export interface SignalResult {
  signal: string;
  ok: boolean;
  error?: string; // tick 抛出的异常信息
  nonFinite?: string[]; // 点完后快照里出现的 NaN/Infinity 路径
}

export interface FullPathReport {
  perSignal: SignalResult[]; // ① 每个信号从干净起点单独点一次的结果（隔离冒烟）
  deterministic: boolean; // ② 整串顺序点两遍，逐步 hash 是否完全一致
  divergedAt?: { step: number; signal: string };
  finalHash?: string; // 顺序跑完的世界指纹（可作金值钉死跨提交回归）
  ok: boolean; // 全绿：所有信号 ok 且 deterministic
}

export interface ProbeOptions {
  ticksPerAction?: number; // 每点一个按钮后推进多少 tick 让效果结算（默认 8）
  warmup?: number; // makeEngine 之后再预热多少 tick（默认 0；通常 makeEngine 自带预热）
}

export type FireFn = (engine: Engine, signal: string) => void;

// 扫快照里所有非有限数（NaN / ±Infinity）—— 通用不变量。复用 world.snapshot()（全 POD），
// 递归走任意嵌套，**无逐组件代码**（同 determinism hash 的数据驱动思路）。返回 `entity.Comp.field=值` 路径。
export function scanNonFinite(world: World): string[] {
  const out: string[] = [];
  const snap = world.snapshot();
  for (const [eid, comps] of Object.entries(snap)) {
    for (const [type, comp] of Object.entries(comps)) walk(comp as unknown, `${eid}.${type}`, out);
  }
  return out;
}

function walk(v: unknown, path: string, out: string[]): void {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(`${path}=${v}`);
    return;
  }
  if (v === null || typeof v !== 'object') return;
  if (Array.isArray(v)) {
    v.forEach((x, i) => walk(x, `${path}[${i}]`, out));
    return;
  }
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) walk(val, `${path}.${k}`, out);
}

export function fullPathProbe(makeEngine: () => Engine, fire: FireFn, signals: string[], opts: ProbeOptions = {}): FullPathReport {
  const ticks = opts.ticksPerAction ?? 8;
  const warmup = opts.warmup ?? 0;

  // ① 隔离冒烟：每个信号都从一局干净（已预热）世界单独点一次 → 不抛错、无非有限数。
  const perSignal: SignalResult[] = [];
  for (const signal of signals) {
    const r: SignalResult = { signal, ok: true };
    try {
      const e = makeEngine();
      for (let i = 0; i < warmup; i++) e.world.tick();
      fire(e, signal);
      for (let i = 0; i < ticks; i++) e.world.tick();
      const nf = scanNonFinite(e.world);
      if (nf.length) {
        r.ok = false;
        r.nonFinite = nf;
      }
    } catch (err) {
      r.ok = false;
      r.error = err instanceof Error ? err.message : String(err);
    }
    perSignal.push(r);
  }

  // ② 顺序 + 确定性：整串信号在两局干净世界各点一遍，逐步比 hash（同输入必同态；发散=非确定性 bug）。
  let deterministic = true;
  let divergedAt: { step: number; signal: string } | undefined;
  let finalHash: string | undefined;
  try {
    const a = makeEngine();
    const b = makeEngine();
    for (let i = 0; i < warmup; i++) {
      a.world.tick();
      b.world.tick();
    }
    for (let s = 0; s < signals.length; s++) {
      fire(a, signals[s]);
      for (let i = 0; i < ticks; i++) a.world.tick();
      fire(b, signals[s]);
      for (let i = 0; i < ticks; i++) b.world.tick();
      if (a.hash() !== b.hash()) {
        deterministic = false;
        divergedAt = { step: s, signal: signals[s] };
        break;
      }
    }
    finalHash = a.hash();
  } catch {
    deterministic = false;
  }

  const ok = perSignal.every((r) => r.ok) && deterministic;
  return { perSignal, deterministic, divergedAt, finalHash, ok };
}

// ───────────────────────────────────────────────────────────────
//  BFS 状态图爬（Loop B 升级）—— 从起点逐个点按钮发现新「界面」，按状态键去重，对新状态递归。
//  分支靠 world.snapshot()/restore()（从同一节点回退再试下一个动作）；去重靠 stateKey（默认 world.hash）。
//  连续态（如战斗，每 tick 新 hash）会让纯 hash 去重爆炸 → 调用方用 `expand` 把这类态当**叶**（发现但不展开）。
//  每条转移都跑不变量（no-throw / no-NaN），报错附**复现路径**（动作序列）。受 maxStates/maxDepth 双约束。
// ───────────────────────────────────────────────────────────────

export interface CrawlOptions {
  maxStates?: number; // 去重状态上限（默认 200）—— 防爆炸的硬闸
  maxDepth?: number; // BFS 深度上限（默认 6）
  ticksPerAction?: number; // 每动作后推进 tick（默认 6）
  stateKey?: (engine: Engine) => string; // 状态去重键（默认 engine.hash()）
  expand?: (engine: Engine) => boolean; // 是否展开此状态的子节点（默认恒真；战斗态→false 当叶）
}

export interface CrawlIssue {
  path: string[]; // 到达出问题前的动作序列（复现路径）
  signal: string; // 触发问题的动作
  detail: string; // 异常信息 / 非有限数字段
}

export interface CrawlReport {
  states: number; // 去重后发现的状态数
  transitions: number; // 试过的 (状态×动作) 次数
  maxDepthReached: number;
  truncated: boolean; // 是否因 maxStates 截断
  errors: CrawlIssue[]; // tick 抛错（含复现路径）
  nonFinite: CrawlIssue[]; // 出现 NaN/Infinity（含复现路径）
  ok: boolean;
}

export function crawlStates(makeEngine: () => Engine, fire: FireFn, actions: string[], opts: CrawlOptions = {}): CrawlReport {
  const maxStates = opts.maxStates ?? 200;
  const maxDepth = opts.maxDepth ?? 6;
  const ticks = opts.ticksPerAction ?? 6;
  const keyOf = opts.stateKey ?? ((e: Engine) => e.hash());
  const canExpand = opts.expand ?? (() => true);

  const e = makeEngine();
  const errors: CrawlIssue[] = [];
  const nonFinite: CrawlIssue[] = [];
  let transitions = 0;
  let maxDepthReached = 0;
  let truncated = false;

  interface Node {
    snap: WorldSnapshot;
    depth: number;
    path: string[];
  }
  const visited = new Set<string>([keyOf(e)]);
  const queue: Node[] = [{ snap: e.world.snapshot(), depth: 0, path: [] }];

  while (queue.length > 0) {
    const node = queue.shift()!;
    maxDepthReached = Math.max(maxDepthReached, node.depth);
    e.world.restore(node.snap);
    if (!canExpand(e) || node.depth >= maxDepth) continue; // 叶 / 到底：发现即可，不展开
    for (const signal of actions) {
      if (visited.size >= maxStates) {
        truncated = true;
        break;
      }
      e.world.restore(node.snap); // 回到本节点，再试下一个动作（restore 从快照克隆，快照不被改）
      transitions++;
      try {
        fire(e, signal);
        for (let i = 0; i < ticks; i++) e.world.tick();
      } catch (err) {
        errors.push({ path: node.path, signal, detail: err instanceof Error ? err.message : String(err) });
        continue;
      }
      const nf = scanNonFinite(e.world);
      if (nf.length) nonFinite.push({ path: node.path, signal, detail: nf.join(', ') });
      const key = keyOf(e);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ snap: e.world.snapshot(), depth: node.depth + 1, path: [...node.path, signal] });
      }
    }
    if (truncated) break;
  }

  return {
    states: visited.size,
    transitions,
    maxDepthReached,
    truncated,
    errors,
    nonFinite,
    ok: errors.length === 0 && nonFinite.length === 0,
  };
}
