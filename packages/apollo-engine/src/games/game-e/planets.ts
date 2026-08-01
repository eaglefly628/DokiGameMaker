// ════════════════════════════════════════════════════════════════════════
//  Game E · 星球牌（纯数据：每张星球牌升级一种牌型）
//  这是「数据」侧：星球牌 → 牌型映射是查表。「升级 = 牌型基础分 +perLevel 增量」
//  由 hand-rankings 的 handScoreAtLevel 投影；运行时把投影写回引擎 PokerHand.rankingTable。
//  数值源：Balatro Wiki · Planet Cards（每用一次 +1 级，加性增量）。
// ════════════════════════════════════════════════════════════════════════

import type { HandType } from './hand-rankings.js';

export interface PlanetCard {
  readonly kind: 'planet';
  readonly id: string;
  readonly name: string; // 中文名（Balatro 行星名意译）
  readonly hand: HandType; // 升级哪种牌型
  readonly icon: string; // 展示用 emoji
  readonly cost: number; // 商店售价（$）
}

/** 九大行星 + 三隐藏星（与 12 种牌型一一对应；数值源 Balatro）。 */
export const PLANETS: readonly PlanetCard[] = [
  { kind: 'planet', id: 'pluto', name: '冥王星', hand: 'high_card', icon: '🌑', cost: 3 },
  { kind: 'planet', id: 'mercury', name: '水星', hand: 'pair', icon: '🟤', cost: 3 },
  { kind: 'planet', id: 'uranus', name: '天王星', hand: 'two_pair', icon: '🔵', cost: 3 },
  { kind: 'planet', id: 'venus', name: '金星', hand: 'three_kind', icon: '🟡', cost: 3 },
  { kind: 'planet', id: 'saturn', name: '土星', hand: 'straight', icon: '🪐', cost: 3 },
  { kind: 'planet', id: 'jupiter', name: '木星', hand: 'flush', icon: '🟠', cost: 3 },
  { kind: 'planet', id: 'earth', name: '地球', hand: 'full_house', icon: '🌍', cost: 3 },
  { kind: 'planet', id: 'mars', name: '火星', hand: 'four_kind', icon: '🔴', cost: 3 },
  { kind: 'planet', id: 'neptune', name: '海王星', hand: 'straight_flush', icon: '🟦', cost: 3 },
  { kind: 'planet', id: 'planet_x', name: '行星X', hand: 'five_kind', icon: '🛰️', cost: 5 },
  { kind: 'planet', id: 'ceres', name: '谷神星', hand: 'flush_house', icon: '⚪', cost: 5 },
  { kind: 'planet', id: 'eris', name: '阋神星', hand: 'flush_five', icon: '⚫', cost: 5 },
];

const BY_HAND: Readonly<Record<HandType, PlanetCard>> = Object.fromEntries(
  PLANETS.map((p) => [p.hand, p]),
) as Record<HandType, PlanetCard>;

/** 升级某牌型对应的星球牌（查表，确定性）。 */
export function planetForHand(hand: HandType): PlanetCard {
  return BY_HAND[hand];
}

/** 商店常见星球牌（不含三隐藏星，避免早期暴露隐藏牌型）。 */
export const COMMON_PLANETS: readonly PlanetCard[] = PLANETS.filter((p) => p.cost === 3);
