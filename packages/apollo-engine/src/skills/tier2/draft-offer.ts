// ═══════════════════════════════════════════════════════════════
//  draft-offer —— Roguelite「升级三选一」抽选的**确定性纯函数核**
//  （REQ-SURVIVOR编排 E1·非 capability，先例见 dice.ts / hex.ts）。
//
//  真缺口（Lead 裁决 2026-07-23）：dice-roll 只「掷一份声明骰池」，没有
//  「按已持有 + 槽位满否**过滤候选池** → 加权抽 N 个不重复 offer → 选中回填」
//  这套 draft 编排。吸血鬼幸存者式割草每次升级都要它，Roguelite/roguelike 通用。
//
//  分工（严守 manifesto，只补「过滤→加权抽 N→回填」真缺口）：
//    · 候选闭集 / 权重 / 槽位 / 满级 / 前置 = 纯数据表（DraftCandidate[]，最弱 LLM 可产）。
//    · 触发（哪拍抽）= 消费游戏在升级信号里调 rollOffer；选哪个 = 玩家输入 → applyPick。
//    · kind / 资格语义 = 消费游戏填数据，本核只管「容器 + 过滤 + 加权不重复抽 + 回填」骨架。
//  确定性（lockstep/录放安全）：同 seed + 同 pool/state → 同 offer 列（mulberry32 纯数据 PRNG，
//  绝不 Math.random）；加权抽按稳定输入序 tie-break，结果唯一确定。
// ═══════════════════════════════════════════════════════════════
import { mulberry32 } from '@atom-skills/index.js';
import { weightedPick } from './weighted-pick.js';

/** 一个候选升级项（纯数据）。id 唯一；weight 加权抽权重（>0 才可抽）；
 *  slot 归属槽（如 'weapon'/'passive'，配 DraftState.slots 容量）；
 *  maxLevel 满级上限（已持有且 owned[id] ≥ maxLevel → 不再 offer）；
 *  requires 前置 id 列（全部已持有才 offer·未满足=不合格）。 */
export interface DraftCandidate {
  id: string;
  weight: number;
  slot?: string;
  maxLevel?: number;
  requires?: readonly string[];
}

/** 玩家当前拥有态（纯数据）。owned=id→等级（≥1 即持有）；
 *  slots=槽名→{used 已占, cap 上限}（新项占一格，满则新项不合格；升级已持有项不占格）。 */
export interface DraftState {
  owned: Readonly<Record<string, number>>;
  slots: Readonly<Record<string, { used: number; cap: number }>>;
}

export interface RollOfferOpts {
  n: number; // offer 张数（如 3）
  seed: number; // 确定性种子
}

/** 候选是否合格（可进本次 offer）：weight>0；已满级排除；新项要有空槽；前置全满足。 */
export function isEligible(c: DraftCandidate, state: DraftState): boolean {
  if (!(c.weight > 0)) return false;
  const level = state.owned[c.id] ?? 0;
  // 已持有：仅当未满级才可再 offer（升级）；满级排除。
  if (level > 0) {
    if (c.maxLevel !== undefined && level >= c.maxLevel) return false;
  } else {
    // 新项：其槽必须有空位（无 slot 声明 = 不占槽，恒有位）。
    if (c.slot !== undefined) {
      const s = state.slots[c.slot];
      if (s && s.used >= s.cap) return false;
    }
  }
  // 前置：requires 里的 id 必须全部已持有。
  if (c.requires) {
    for (const req of c.requires) {
      if ((state.owned[req] ?? 0) <= 0) return false;
    }
  }
  return true;
}

/** 加权抽 N 个**不重复**（无放回）：反复用共享核 weightedPick 从剩余池单抽一个、移出，直到抽满 N 或池空。
 *  确定性：同 rand 序列 + 同输入序 → 同结果（weightedPick 内部浮点越界回退末元素兜底）。 */
function weightedPickDistinct(candidates: readonly DraftCandidate[], n: number, rand: () => number): DraftCandidate[] {
  const remaining = [...candidates];
  const picked: DraftCandidate[] = [];
  while (picked.length < n && remaining.length > 0) {
    const pick = weightedPick(remaining, rand);
    if (!pick) break; // 权重总和 <=0（池非空但全零权重）→ 抽不动，同原实现语义
    picked.push(pick);
    remaining.splice(remaining.indexOf(pick), 1); // 候选按引用唯一（同一 pool 不重复放同一对象）→ indexOf 精确定位
  }
  return picked;
}

/** 抽一次 offer：过滤不合格候选 → 加权抽 ≤n 个不重复 → 返回 offer 列（DraftCandidate 引用·稳定序）。
 *  空池/无合格项 → 返回 []；合格数 < n → 返回全部合格（加权序）。纯函数（不改 pool/state）。 */
export function rollOffer(pool: readonly DraftCandidate[], state: DraftState, opts: RollOfferOpts): DraftCandidate[] {
  const n = Math.max(0, Math.floor(opts.n));
  if (n === 0) return [];
  const eligible = pool.filter((c) => isEligible(c, state));
  if (eligible.length === 0) return [];
  const rand = mulberry32(opts.seed | 0);
  return weightedPickDistinct(eligible, n, rand);
}

/** 回填选中项到 state（返回**新** state，不改入参）：已持有→等级 +1；新项→等级置 1 且其槽 used +1。
 *  offerId 不在 pool / 不合格由调用方保证（本函数信任 offer 出自 rollOffer）；未知 slot 静默不计。 */
export function applyPick(offerId: string, candidate: DraftCandidate, state: DraftState): DraftState {
  const owned: Record<string, number> = { ...state.owned };
  const slots: Record<string, { used: number; cap: number }> = {};
  for (const k of Object.keys(state.slots)) slots[k] = { ...state.slots[k] };
  const had = (owned[offerId] ?? 0) > 0;
  owned[offerId] = (owned[offerId] ?? 0) + 1;
  if (!had && candidate.slot !== undefined && slots[candidate.slot]) {
    slots[candidate.slot].used += 1;
  }
  return { owned, slots };
}
