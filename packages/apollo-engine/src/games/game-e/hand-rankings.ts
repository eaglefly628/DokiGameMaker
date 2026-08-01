// ════════════════════════════════════════════════════════════════════════
//  Game E · 牌型分值表（纯数据：Lv1 基础 chips/mult + 每级增量）
//  这是「数据」侧：牌型→分值是查表。判定「5 张是哪种牌型」是引擎能力 REQ-011，不在此。
//  数值源：Balatro Wiki · Poker Hands。升级靠星球牌（每用 +1 级，加性增量）。
// ════════════════════════════════════════════════════════════════════════

export type HandType =
  | 'high_card'
  | 'pair'
  | 'two_pair'
  | 'three_kind'
  | 'straight'
  | 'flush'
  | 'full_house'
  | 'four_kind'
  | 'straight_flush'
  | 'five_kind'
  | 'flush_house'
  | 'flush_five';

export interface HandRanking {
  readonly id: HandType;
  readonly name: string;
  readonly baseChips: number;
  readonly baseMult: number;
  readonly perLevelChips: number;
  readonly perLevelMult: number;
  /** 是否隐藏牌型（需卡牌增强才打得出）。 */
  readonly secret: boolean;
}

/** 由弱到强（也是「contains」包含判定的强弱序参考数据）。 */
export const HAND_ORDER: readonly HandType[] = [
  'high_card',
  'pair',
  'two_pair',
  'three_kind',
  'straight',
  'flush',
  'full_house',
  'four_kind',
  'straight_flush',
  'five_kind',
  'flush_house',
  'flush_five',
];

export const HAND_RANKINGS: Readonly<Record<HandType, HandRanking>> = {
  high_card: { id: 'high_card', name: '高牌', baseChips: 5, baseMult: 1, perLevelChips: 10, perLevelMult: 1, secret: false },
  pair: { id: 'pair', name: '对子', baseChips: 10, baseMult: 2, perLevelChips: 15, perLevelMult: 1, secret: false },
  two_pair: { id: 'two_pair', name: '两对', baseChips: 20, baseMult: 2, perLevelChips: 20, perLevelMult: 1, secret: false },
  three_kind: { id: 'three_kind', name: '三条', baseChips: 30, baseMult: 3, perLevelChips: 20, perLevelMult: 2, secret: false },
  straight: { id: 'straight', name: '顺子', baseChips: 30, baseMult: 4, perLevelChips: 30, perLevelMult: 3, secret: false },
  flush: { id: 'flush', name: '同花', baseChips: 35, baseMult: 4, perLevelChips: 15, perLevelMult: 2, secret: false },
  full_house: { id: 'full_house', name: '葫芦', baseChips: 40, baseMult: 4, perLevelChips: 25, perLevelMult: 2, secret: false },
  four_kind: { id: 'four_kind', name: '四条', baseChips: 60, baseMult: 7, perLevelChips: 30, perLevelMult: 3, secret: false },
  straight_flush: { id: 'straight_flush', name: '同花顺', baseChips: 100, baseMult: 8, perLevelChips: 40, perLevelMult: 4, secret: false },
  five_kind: { id: 'five_kind', name: '五条', baseChips: 120, baseMult: 12, perLevelChips: 35, perLevelMult: 3, secret: true },
  flush_house: { id: 'flush_house', name: '同花葫芦', baseChips: 140, baseMult: 14, perLevelChips: 40, perLevelMult: 4, secret: true },
  flush_five: { id: 'flush_five', name: '同花五', baseChips: 160, baseMult: 16, perLevelChips: 50, perLevelMult: 3, secret: true },
};

/** 某牌型在 level（≥1）的基础分（纯数据投影，确定性；非引擎逻辑）。 */
export function handScoreAtLevel(id: HandType, level: number): { chips: number; mult: number } {
  const r = HAND_RANKINGS[id];
  const steps = Math.max(0, Math.floor(level) - 1);
  return { chips: r.baseChips + r.perLevelChips * steps, mult: r.baseMult + r.perLevelMult * steps };
}
