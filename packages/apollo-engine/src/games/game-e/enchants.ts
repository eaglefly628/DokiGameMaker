// ════════════════════════════════════════════════════════════════════════
//  Game E · 卡牌附魔（纯数据：牌的内禀修正 = 版式/增强/蜡封）
//  这是「数据」侧：附魔 → 修正(op/target/value) 是查表；计分时套用由引擎 card-scoring
//  逐张 pass 读 `Card.mods/retrigger`（REQ-E-021）执行——本文件只声明"附魔是什么"。
//  来源（塔罗牌）也在此声明为纯数据；盖章/选牌/表现 = 游戏侧编排。
//  数值源：Balatro Wiki · Editions / Enhancements / Seals（取「计分牌内禀」子集）。
// ════════════════════════════════════════════════════════════════════════

/** 附魔 id（仅收「计分牌内禀」类；held-in-hand 的 steel/gold 与 spawn 蜡封另案）。 */
export type EnchantId = 'foil' | 'holo' | 'poly' | 'bonus' | 'mult' | 'glass' | 'red_seal';

/** 一条牌内禀修正（target = 引擎 Resource id：chips / mult）。与引擎 Card.mods 同形。 */
export interface CardMod {
  readonly op: 'add' | 'mul';
  readonly target: 'chips' | 'mult';
  readonly value: number;
}

export interface Enchant {
  readonly id: EnchantId;
  readonly name: string;
  readonly badge: string; // 牌角徽标字符
  readonly color: string; // 描边/徽标色
  readonly desc: string;
  readonly mods?: readonly CardMod[]; // 计分时套用的修正
  readonly retrigger?: number; // 红蜡封：该牌额外重触发次数
}

/** 附魔表（数值源 Balatro）。 */
export const ENCHANTS: Readonly<Record<EnchantId, Enchant>> = {
  foil: { id: 'foil', name: '闪箔', badge: '✦', color: '#9ecbff', desc: '+50 筹码', mods: [{ op: 'add', target: 'chips', value: 50 }] },
  holo: { id: 'holo', name: '全息', badge: '✦', color: '#f0abfc', desc: '+10 倍率', mods: [{ op: 'add', target: 'mult', value: 10 }] },
  poly: { id: 'poly', name: '多彩', badge: '✦', color: '#fb7185', desc: '×1.5 倍率', mods: [{ op: 'mul', target: 'mult', value: 1.5 }] },
  bonus: { id: 'bonus', name: '加值', badge: '◆', color: '#4cc9f0', desc: '+30 筹码', mods: [{ op: 'add', target: 'chips', value: 30 }] },
  mult: { id: 'mult', name: '倍率', badge: '◆', color: '#f72585', desc: '+4 倍率', mods: [{ op: 'add', target: 'mult', value: 4 }] },
  glass: { id: 'glass', name: '玻璃', badge: '◆', color: '#67e8f9', desc: '×2 倍率', mods: [{ op: 'mul', target: 'mult', value: 2 }] },
  red_seal: { id: 'red_seal', name: '红蜡封', badge: '●', color: '#ef4444', desc: '该牌计分 2 次', retrigger: 1 },
};

export const ENCHANT_IDS = Object.keys(ENCHANTS) as EnchantId[];

// ── 来源：塔罗牌（消耗位道具，使用时给 1 张选中的手牌盖上附魔）──────────────
export interface TarotCard {
  readonly kind: 'tarot';
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly cost: number;
  readonly enchant: EnchantId; // 盖上哪种附魔
}

/** 塔罗牌表（每种附魔一张；Balatro 塔罗意译）。 */
export const TAROTS: readonly TarotCard[] = [
  { kind: 'tarot', id: 't_foil', name: '星币', icon: '🪙', cost: 4, enchant: 'foil' },
  { kind: 'tarot', id: 't_holo', name: '月亮', icon: '🌙', cost: 4, enchant: 'holo' },
  { kind: 'tarot', id: 't_poly', name: '太阳', icon: '☀️', cost: 5, enchant: 'poly' },
  { kind: 'tarot', id: 't_bonus', name: '皇帝', icon: '👑', cost: 3, enchant: 'bonus' },
  { kind: 'tarot', id: 't_mult', name: '战车', icon: '⚔️', cost: 3, enchant: 'mult' },
  { kind: 'tarot', id: 't_glass', name: '高塔', icon: '🗼', cost: 5, enchant: 'glass' },
  { kind: 'tarot', id: 't_seal', name: '正义', icon: '⚖️', cost: 4, enchant: 'red_seal' },
];
