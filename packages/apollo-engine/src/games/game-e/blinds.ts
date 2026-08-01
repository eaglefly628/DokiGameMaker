// ════════════════════════════════════════════════════════════════════════
//  Game E · 盲注分数曲线（纯数据：每 ante 的 base 分 + 三道盲注倍率）
//  这是「数据」侧：盲注线是查表。门控判定（score ≥ 线）是引擎现成能力
//  （event-when 的 condition: resource(score) gte threshold），不在此写。
//  数值源：Balatro Wiki · Module:Blind Score（White/基础难度，Ante 1-16）。
// ════════════════════════════════════════════════════════════════════════

export type BlindKind = 'small' | 'big' | 'boss';

/** 三道盲注对 ante base 的倍率：Small ×1 / Big ×1.5 / Boss ×2。 */
export const BLIND_MULT: Readonly<Record<BlindKind, number>> = {
  small: 1,
  big: 1.5,
  boss: 2,
};

export const BLIND_ORDER: readonly BlindKind[] = ['small', 'big', 'boss'];

/**
 * 每个 ante 的基础分（索引 = ante，ante 从 1 起；index 0 占位 100=教程局）。
 * 超指数增长：曲线靠「设计查表」而非闭式公式（与 Balatro 一致）。
 */
export const ANTE_BASE: readonly number[] = [
  100, // ante 0（占位/教程）
  300, // 1
  800, // 2
  2_000, // 3
  5_000, // 4
  11_000, // 5
  20_000, // 6
  35_000, // 7
  50_000, // 8
  110_000, // 9
  560_000, // 10
  7_200_000, // 11
  300_000_000, // 12
  47_000_000_000, // 13
  2.9e13, // 14
  7.7e16, // 15
  8.6e20, // 16
];

/** 已表数据覆盖到的最高 ante。 */
export const MAX_TABULATED_ANTE = ANTE_BASE.length - 1;

/**
 * 某 ante 某道盲注的分数线 = base × 倍率（纯数据投影）。
 * 超出已表 ante 时返回 Infinity（未表，调用方决定无限模式外推策略）。
 */
export function blindRequirement(ante: number, kind: BlindKind): number {
  const base = ANTE_BASE[ante];
  if (base === undefined) return Number.POSITIVE_INFINITY;
  return base * BLIND_MULT[kind];
}
