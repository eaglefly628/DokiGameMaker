// ═══════════════════════════════════════════════════════════════
//  weighted-pick —— 加权轮盘赌单抽的**共享纯函数核**（非 capability·先例见 dice.ts / hex.ts）。
//
//  DRY 缺口（Lead 裁决·REQ-TAPSPAWN weighted-spawn 调研时发现）：draft-offer.ts 的
//  weightedPickDistinct（去重多抽）与 weighted-spawn.ts（掉落表单抽）各自需要同一段
//  「按权重比例从候选里选一个、浮点越界回退末元素兜底」算法——抽成本函数，两处调，避免
//  两套不小心漂移的加权抽实现。draft-offer 的"去重"是外层反复单抽+移出，非本函数职责。
//
//  确定性：纯函数，唯一随机来源是调用方传入的 rand()（[0,1) 取数器，通常是 mulberry32(seed)
//  或经 nextRandom(RandomSeed) 包一层）；同 rand 序列 + 同 entries 输入序 → 同结果。
// ═══════════════════════════════════════════════════════════════

/** 加权抽 1 个（有放回）：按 weight 比例从 entries 里选一个；浮点误差可能使累减到最后一项仍 ≥0，
 *  此时兜底选末元素（同 draft-offer 原实现）。entries 空 / 权重总和 <=0 → undefined（不崩，调用方判空）。 */
export function weightedPick<T extends { weight: number }>(entries: readonly T[], rand: () => number): T | undefined {
  if (entries.length === 0) return undefined;
  let total = 0;
  for (const e of entries) total += e.weight;
  if (!(total > 0)) return undefined;
  let r = rand() * total;
  let idx = 0;
  for (; idx < entries.length; idx++) {
    r -= entries[idx].weight;
    if (r < 0) break;
  }
  if (idx >= entries.length) idx = entries.length - 1; // 浮点兜底
  return entries[idx];
}
