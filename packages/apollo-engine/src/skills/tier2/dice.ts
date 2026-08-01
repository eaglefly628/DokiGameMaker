// ═══════════════════════════════════════════════════════════════
//  dice —— 骰能力族的**确定性纯函数核**（REQ-GAMED；非 capability，先例见 hex.ts）。
//
//  「骰池/骰面/对掷策略 = 数据；掷骰/锁定/禁骰/对掷比大小 = 引擎确定性算法」（宪法对齐）。本模块只含
//  **确定性纯函数**（消费 RandomSeed 整数 PRNG，绝不 Math.random）：
//    · rollDicePool —— 按锁定掩码掷骰池（未锁位掷新、锁定位保留上次结果）。dice-roll 系统的算法核。
//    · applyBanFilter —— 结算前禁骰（禁最高/最低 n 颗，标 banned 不移出）。同上。
//    · opposedRoll —— 对掷判定：双方各掷 [1,战力] 比大小，平局按 tiePolicy 数据决定（game-g 对掷下沉）。
//  确定性（lockstep/录放安全）：同一 RandomSeed 状态 → 同一序列；禁骰同值按下标升序 tie-break、
//  对掷平局按固定 tiePolicy 阶梯 → 结果唯一确定，不依赖遍历序/浮点超越函数。
// ═══════════════════════════════════════════════════════════════
import type { RandomSeed, DieSpec, RolledDie } from '@engine/protocol/components.js';
import { nextRandom, randomInt } from '@atom-skills/index.js';

// ── 掷骰池（锁定重掷）─────────────────────────────────────────────
// 按下标逐颗掷：locked 含该下标且 prev 有对应结果 → 保留上次（清 banned，禁骰在 applyBanFilter 重算）；
// 否则在 [0, faces.length) 内确定性取一面（消费 rng、推进序列）。返回与 dice 等长、下标对齐的结果数组。
// 纯函数（除推进 rng 状态外无副作用）：同 rng 状态 + 同 dice/locked/prev → 同结果。
export function rollDicePool(
  dice: readonly DieSpec[],
  locked: ReadonlySet<number>,
  prev: readonly RolledDie[] | undefined,
  rng: RandomSeed,
): RolledDie[] {
  const out: RolledDie[] = [];
  for (let i = 0; i < dice.length; i++) {
    const die = dice[i];
    const keep = locked.has(i) ? prev?.[i] : undefined;
    if (keep) {
      // 锁定位：保留上次点数/元素/面下标；banned 由后续 applyBanFilter 在全量结果上重算（先清）。
      out.push({ value: keep.value, element: keep.element, faceIndex: keep.faceIndex });
      continue;
    }
    const n = die.faces.length;
    if (n === 0) { out.push({ value: 0, faceIndex: -1 }); continue; } // 空骰（退化）：点数 0、面下标 -1，仍推进不了 rng（无面可掷）
    const faceIndex = randomInt(rng, 0, n); // 均匀取一面（推进 rng 一次）
    const face = die.faces[faceIndex];
    out.push(face.element === undefined ? { value: face.value, faceIndex } : { value: face.value, element: face.element, faceIndex });
  }
  return out;
}

// ── 结算前禁骰 ───────────────────────────────────────────────────
// 把最高/最低的 n 颗标 banned=true（不移出，保下标对齐）。先清全体 banned，再选取。
// 同值按下标升序 tie-break（确定性）。n≤0 → 全不禁（no-op）；n≥results 数 → 全禁。
export function applyBanFilter(results: RolledDie[], ban: { kind: 'banHighest' | 'banLowest'; n: number } | undefined): void {
  for (const r of results) r.banned = false;
  if (!ban || ban.n <= 0 || results.length === 0) return;
  const n = Math.min(ban.n, results.length);
  const order = results
    .map((r, i) => ({ v: r.value, i }))
    .sort((a, b) => (ban.kind === 'banHighest' ? b.v - a.v || a.i - b.i : a.v - b.v || a.i - b.i));
  for (let k = 0; k < n; k++) results[order[k].i].banned = true;
}

// ── 对掷判定（game-g 战力对掷下沉）───────────────────────────────
export type TiePolicy = 'rollerWins' | 'defenderWins' | 'reroll';
export interface OpposedResult {
  winner: 'A' | 'B'; // A=掷者(roller/pA)、B=守方(defender/pB)
  rollA: number; // A 掷出的点数（最终决胜那次；reroll 时为最后一次）
  rollB: number;
  rerolls: number; // 平局重掷次数（tiePolicy='reroll' 时>0；其余恒 0）
}
// reroll 安全阀：极端(pA=pB=1)时永远平局 → 上限次重掷后按 rollerWins 终结（确定、不死循环）。
export const OPPOSED_MAX_REROLL = 64;

// 双方各在 [1, max(1,round(power))] 内掷一整数、大者胜；平局按 tiePolicy：
//   'rollerWins'=掷者(A)胜、'defenderWins'=守方(B)胜、'reroll'=双方重掷直到分出（上限见 OPPOSED_MAX_REROLL）。
// 消费 rng（每掷一次推进一次；reroll 每轮推进两次）→ 确定/录放安全。
export function opposedRoll(rng: RandomSeed, pA: number, pB: number, tiePolicy: TiePolicy = 'rollerWins'): OpposedResult {
  const A = Math.max(1, Math.round(pA));
  const B = Math.max(1, Math.round(pB));
  let rerolls = 0;
  for (;;) {
    const rollA = 1 + Math.floor(nextRandom(rng) * A);
    const rollB = 1 + Math.floor(nextRandom(rng) * B);
    if (rollA > rollB) return { winner: 'A', rollA, rollB, rerolls };
    if (rollB > rollA) return { winner: 'B', rollA, rollB, rerolls };
    // 平局：
    if (tiePolicy === 'rollerWins') return { winner: 'A', rollA, rollB, rerolls };
    if (tiePolicy === 'defenderWins') return { winner: 'B', rollA, rollB, rerolls };
    rerolls += 1;
    if (rerolls > OPPOSED_MAX_REROLL) return { winner: 'A', rollA, rollB, rerolls }; // 安全阀：终结于掷者胜
  }
}
