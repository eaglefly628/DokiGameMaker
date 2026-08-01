import type { HandType } from './hand-rankings.js';
import type { Suit } from './deck.js';
import { jokerArtKey } from './assets.js';

// ════════════════════════════════════════════════════════════════════════
//  Game E · 小丑牌数据（纯数据：每张小丑 = 一条声明式计分规则）
//  每张小丑映射到引擎的 Condition→Event→Effect：
//    trigger → 挂在哪个信号（event-when 产）  ·  when → ConditionExpr（条件门控）
//    {op,target,value} → Effect（modify-resource，op 由 REQ-012 提供 add|mul）
//  「最弱 LLM 能产出这一行 {op,target,value} 吗？能 → 数据接口。」——不写游戏 system。
//  起手 14 张全部是官方真实小丑（名字/数值/型号对齐 Balatro Wiki · Jokers）。
// ════════════════════════════════════════════════════════════════════════

/** 官方 7 型（效果产出分类）。 */
export type JokerType = '+c' | '+m' | 'Xm' | '++' | '!!' | '...' | '+$';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

/** 计分修改：op 作用于 target，value 为量。mul 需引擎 REQ-012。 */
export type ScoreOp = 'add' | 'mul';
export type ScoreTarget = 'chips' | 'mult' | 'money';

/** 触发时机 → 决定 effect 监听的信号（事件分类学）。 */
export type Trigger =
  | 'on_hand_scored' // Indep.：出牌结算时一次
  | 'on_card_scored' // On Scored：每张计分牌（需 REQ-011 逐张迭代）
  | 'on_round_end' // 回合结束
  | 'on_discard' // 弃牌时
  | 'on_blind_selected'; // 选盲注时

/** 条件门控（映射 ConditionExpr）。缺省=无条件。 */
export type JokerCondition =
  | { readonly kind: 'always' }
  | { readonly kind: 'hand_contains'; readonly hand: HandType } // 含某牌型
  | { readonly kind: 'hand_size_lte'; readonly n: number } // 出牌张数 ≤ n
  | { readonly kind: 'card_suit'; readonly suit: Suit } // 逐张：该牌花色（配 on_card_scored）
  | { readonly kind: 'card_face' } // 逐张：人头牌
  | { readonly kind: 'card_even' } // 逐张：偶数点
  | { readonly kind: 'card_odd' } // 逐张：奇数点（A 计奇）
  | { readonly kind: 'card_rank_in'; readonly ranks: readonly number[] } // 逐张：点数 ∈ 集合（引擎 rank 2..14；Fibonacci 等）
  | { readonly kind: 'resource_cmp'; readonly id: string; readonly cmp: 'lte' | 'gte' | 'eq'; readonly value: number }; // 读某 Resource 比较（如剩余弃牌=0）

/** 动态值来源（量纲类，如「每 $1」「每剩 1 弃牌」）。映射候选 REQ-013 valueFrom。 */
export interface ValueFrom {
  readonly resourceId: string; // 如 'money' / 'discards'
  readonly coeff: number; // value = coeff × resource.current
}

export interface JokerCard {
  readonly id: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly cost: number;
  readonly jokerType: JokerType;
  readonly trigger: Trigger;
  readonly when: JokerCondition;
  readonly op: ScoreOp;
  readonly target: ScoreTarget;
  /** 静态量；若用 valueFrom 则为系数语义（见 valueFrom）。 */
  readonly value: number;
  /** 量纲动态值（候选 REQ-013）；缺省=静态 value。 */
  readonly valueFrom?: ValueFrom;
  /** 第二条效果（同 trigger/when）：双产出小丑用（Scholar=A +20筹+4倍、Walkie=10/4 +10筹+4倍）。 */
  readonly extra?: { readonly op: ScoreOp; readonly target: ScoreTarget; readonly value: number };
  /** 概率门（REQ-E-023②）：命中 when 后再按 num/den roll 才施用（Bloodstone 每张♥ 1/2 ×1.5、Business Card 人头 1/2 +$2）。 */
  readonly chance?: { readonly num: number; readonly den: number };
  /** 计数缩放（REQ-E-023① countOf）：value 视作"每个该类实体 ×value"（Abstract 每小丑 +3 倍）。 */
  readonly countTag?: 'jokers';
  /** 留手生效（REQ-E-023③）：on_card_scored 规则改对"留在手里没出的牌"求值（Baron 留手 K ×1.5）。 */
  readonly held?: boolean;
  /** 被动判型修饰（REQ-E-023⑤）：拥有期间点亮对应 mod Flag（four_fingers 4 张成顺/同花、shortcut 带空顺、smeared 红黑各算同花）。 */
  readonly handMod?: 'four_fingers' | 'shortcut' | 'smeared';
  /** 经济触发（游戏侧线性脚本在流程点解释，非引擎）：on='round'(过关结算) / 'discard'(弃牌时)。kind=一组固定的金额公式词汇。 */
  readonly econ?: { readonly on: 'round' | 'discard'; readonly kind: 'flat' | 'per_boss' | 'per_9_in_deck' | 'interest' | 'per_unused_discard' | 'face_gte_3'; readonly value: number };
  /** 自增长（REQ-E-023④ 重组：per-joker 计数 Resource + 计分 valueFrom 读出）。流程在 hand/discard/round 事件按 ± 更新计数；
   *  cond（仅 hand 事件）按出的牌判定才累加。计分用本小丑的 op/target 把计数作用上去（counter 起始 start）。 */
  readonly grow?: { readonly start: number; readonly hand?: number; readonly discard?: number; readonly round?: number; readonly cond?: 'size4' | 'straight' | 'two_pair' };
  /** 被动改本道盲注资源（游戏侧每道开局读 owned 累加；Juggler +1手牌、Drunkard +1弃牌、Stuntman -2手牌…）。 */
  readonly passive?: { readonly handSize?: number; readonly hands?: number; readonly discards?: number };
  /** 重触发次数（REQ-014 PerCardRetrigger）：>0 表示首张计分牌额外重触发 N 次（Hanging Chad=2）。 */
  readonly retrigger?: number;
  /** 美术 key（jokerArtKey(id)）；缺图自动退化占位。 */
  readonly artKey: string;
  /** 人话描述（= 数据的投影，渲染叠在卡面，见 design §七）。 */
  readonly text: string;
}

const J = (j: Omit<JokerCard, 'artKey'>): JokerCard => ({ ...j, artKey: jokerArtKey(j.id) });

/** 起手 14 张：刻意铺满 7 型 × 激活时机，验证 REQ-011/012 表达力。 */
export const STARTER_JOKERS: readonly JokerCard[] = [
  J({ id: 'joker', name: 'Joker', rarity: 'common', cost: 2, jokerType: '+m', trigger: 'on_hand_scored', when: { kind: 'always' }, op: 'add', target: 'mult', value: 4, text: '+4 倍率' }),
  J({ id: 'greedy_joker', name: 'Greedy Joker', rarity: 'common', cost: 5, jokerType: '+m', trigger: 'on_card_scored', when: { kind: 'card_suit', suit: 'diamonds' }, op: 'add', target: 'mult', value: 3, text: '每张计分的 ♦ +3 倍率' }),
  J({ id: 'lusty_joker', name: 'Lusty Joker', rarity: 'common', cost: 5, jokerType: '+m', trigger: 'on_card_scored', when: { kind: 'card_suit', suit: 'hearts' }, op: 'add', target: 'mult', value: 3, text: '每张计分的 ♥ +3 倍率' }),
  J({ id: 'jolly_joker', name: 'Jolly Joker', rarity: 'common', cost: 3, jokerType: '+m', trigger: 'on_hand_scored', when: { kind: 'hand_contains', hand: 'pair' }, op: 'add', target: 'mult', value: 8, text: '含对子 → +8 倍率' }),
  J({ id: 'zany_joker', name: 'Zany Joker', rarity: 'common', cost: 4, jokerType: '+m', trigger: 'on_hand_scored', when: { kind: 'hand_contains', hand: 'three_kind' }, op: 'add', target: 'mult', value: 12, text: '含三条 → +12 倍率' }),
  J({ id: 'half_joker', name: 'Half Joker', rarity: 'common', cost: 5, jokerType: '+m', trigger: 'on_hand_scored', when: { kind: 'hand_size_lte', n: 3 }, op: 'add', target: 'mult', value: 20, text: '出牌 ≤3 张 → +20 倍率' }),
  J({ id: 'scary_face', name: 'Scary Face', rarity: 'common', cost: 4, jokerType: '+c', trigger: 'on_card_scored', when: { kind: 'card_face' }, op: 'add', target: 'chips', value: 30, text: '每张计分的人头牌 +30 筹码' }),
  J({ id: 'even_steven', name: 'Even Steven', rarity: 'common', cost: 4, jokerType: '+m', trigger: 'on_card_scored', when: { kind: 'card_even' }, op: 'add', target: 'mult', value: 4, text: '每张计分的偶数牌 +4 倍率' }),
  J({ id: 'banner', name: 'Banner', rarity: 'common', cost: 5, jokerType: '+c', trigger: 'on_hand_scored', when: { kind: 'always' }, op: 'add', target: 'chips', value: 30, valueFrom: { resourceId: 'discards', coeff: 30 }, text: '每剩 1 次弃牌 +30 筹码' }),
  J({ id: 'bull', name: 'Bull', rarity: 'uncommon', cost: 6, jokerType: '+c', trigger: 'on_hand_scored', when: { kind: 'always' }, op: 'add', target: 'chips', value: 2, valueFrom: { resourceId: 'money', coeff: 2 }, text: '每有 $1 +2 筹码' }),
  J({ id: 'cavendish', name: 'Cavendish', rarity: 'uncommon', cost: 6, jokerType: 'Xm', trigger: 'on_hand_scored', when: { kind: 'always' }, op: 'mul', target: 'mult', value: 3, text: '×3 倍率' }),
  J({ id: 'the_duo', name: 'The Duo', rarity: 'rare', cost: 8, jokerType: 'Xm', trigger: 'on_hand_scored', when: { kind: 'hand_contains', hand: 'pair' }, op: 'mul', target: 'mult', value: 2, text: '含对子 → ×2 倍率' }),
  J({ id: 'golden_joker', name: 'Golden Joker', rarity: 'common', cost: 6, jokerType: '+$', trigger: 'on_round_end', when: { kind: 'always' }, op: 'add', target: 'money', value: 4, econ: { on: 'round', kind: 'flat', value: 4 }, text: '回合结束 +$4' }),
  J({ id: 'hanging_chad', name: 'Hanging Chad', rarity: 'common', cost: 4, jokerType: '...', trigger: 'on_card_scored', when: { kind: 'always' }, op: 'add', target: 'chips', value: 0, retrigger: 2, text: '首张计分牌额外重触发 2 次' }),
  // ── 补全：现有能力可忠实表达的官方小丑（数值对齐 Balatro Wiki）──
  J({ id: 'wrathful_joker', name: 'Wrathful Joker', rarity: 'common', cost: 5, jokerType: '+m', trigger: 'on_card_scored', when: { kind: 'card_suit', suit: 'spades' }, op: 'add', target: 'mult', value: 3, text: '每张计分的 ♠ +3 倍率' }),
  J({ id: 'gluttonous_joker', name: 'Gluttonous Joker', rarity: 'common', cost: 5, jokerType: '+m', trigger: 'on_card_scored', when: { kind: 'card_suit', suit: 'clubs' }, op: 'add', target: 'mult', value: 3, text: '每张计分的 ♣ +3 倍率' }),
  J({ id: 'odd_todd', name: 'Odd Todd', rarity: 'common', cost: 4, jokerType: '+c', trigger: 'on_card_scored', when: { kind: 'card_odd' }, op: 'add', target: 'chips', value: 31, text: '每张计分的奇数牌(A,3,5,7,9) +31 筹码' }),
  J({ id: 'fibonacci', name: 'Fibonacci', rarity: 'uncommon', cost: 8, jokerType: '+m', trigger: 'on_card_scored', when: { kind: 'card_rank_in', ranks: [14, 2, 3, 5, 8] }, op: 'add', target: 'mult', value: 8, text: '每张计分的 A/2/3/5/8 +8 倍率' }),
  J({ id: 'mad_joker', name: 'Mad Joker', rarity: 'common', cost: 4, jokerType: '+m', trigger: 'on_hand_scored', when: { kind: 'hand_contains', hand: 'two_pair' }, op: 'add', target: 'mult', value: 10, text: '含两对 → +10 倍率' }),
  J({ id: 'sly_joker', name: 'Sly Joker', rarity: 'common', cost: 3, jokerType: '+c', trigger: 'on_hand_scored', when: { kind: 'hand_contains', hand: 'pair' }, op: 'add', target: 'chips', value: 50, text: '含对子 → +50 筹码' }),
  J({ id: 'wily_joker', name: 'Wily Joker', rarity: 'common', cost: 4, jokerType: '+c', trigger: 'on_hand_scored', when: { kind: 'hand_contains', hand: 'three_kind' }, op: 'add', target: 'chips', value: 100, text: '含三条 → +100 筹码' }),
  J({ id: 'clever_joker', name: 'Clever Joker', rarity: 'common', cost: 4, jokerType: '+c', trigger: 'on_hand_scored', when: { kind: 'hand_contains', hand: 'two_pair' }, op: 'add', target: 'chips', value: 80, text: '含两对 → +80 筹码' }),
  J({ id: 'the_trio', name: 'The Trio', rarity: 'rare', cost: 8, jokerType: 'Xm', trigger: 'on_hand_scored', when: { kind: 'hand_contains', hand: 'three_kind' }, op: 'mul', target: 'mult', value: 3, text: '含三条 → ×3 倍率' }),
  J({ id: 'the_family', name: 'The Family', rarity: 'rare', cost: 8, jokerType: 'Xm', trigger: 'on_hand_scored', when: { kind: 'hand_contains', hand: 'four_kind' }, op: 'mul', target: 'mult', value: 4, text: '含四条 → ×4 倍率' }),
  J({ id: 'gros_michel', name: 'Gros Michel', rarity: 'common', cost: 5, jokerType: '+m', trigger: 'on_hand_scored', when: { kind: 'always' }, op: 'add', target: 'mult', value: 15, text: '+15 倍率' }),
  // ── REQ-E-022 落地：含顺子/含同花条件小丑（poker-eval 暴露 isFlush/isStraight Flag 后成纯数据）──
  J({ id: 'crazy_joker', name: 'Crazy Joker', rarity: 'common', cost: 4, jokerType: '+m', trigger: 'on_hand_scored', when: { kind: 'hand_contains', hand: 'straight' }, op: 'add', target: 'mult', value: 12, text: '含顺子 → +12 倍率' }),
  J({ id: 'droll_joker', name: 'Droll Joker', rarity: 'common', cost: 4, jokerType: '+m', trigger: 'on_hand_scored', when: { kind: 'hand_contains', hand: 'flush' }, op: 'add', target: 'mult', value: 10, text: '含同花 → +10 倍率' }),
  J({ id: 'devious_joker', name: 'Devious Joker', rarity: 'common', cost: 4, jokerType: '+c', trigger: 'on_hand_scored', when: { kind: 'hand_contains', hand: 'straight' }, op: 'add', target: 'chips', value: 100, text: '含顺子 → +100 筹码' }),
  J({ id: 'crafty_joker', name: 'Crafty Joker', rarity: 'common', cost: 4, jokerType: '+c', trigger: 'on_hand_scored', when: { kind: 'hand_contains', hand: 'flush' }, op: 'add', target: 'chips', value: 80, text: '含同花 → +80 筹码' }),
  J({ id: 'the_order', name: 'The Order', rarity: 'rare', cost: 8, jokerType: 'Xm', trigger: 'on_hand_scored', when: { kind: 'hand_contains', hand: 'straight' }, op: 'mul', target: 'mult', value: 3, text: '含顺子 → ×3 倍率' }),
  J({ id: 'the_tribe', name: 'The Tribe', rarity: 'rare', cost: 8, jokerType: 'Xm', trigger: 'on_hand_scored', when: { kind: 'hand_contains', hand: 'flush' }, op: 'mul', target: 'mult', value: 2, text: '含同花 → ×2 倍率' }),
  // ── B 组：现有能力即可表达（无引擎工）──
  J({ id: 'smiley_face', name: 'Smiley Face', rarity: 'common', cost: 4, jokerType: '+m', trigger: 'on_card_scored', when: { kind: 'card_face' }, op: 'add', target: 'mult', value: 5, text: '每张计分人头牌 +5 倍率' }),
  J({ id: 'arrowhead', name: 'Arrowhead', rarity: 'uncommon', cost: 7, jokerType: '+c', trigger: 'on_card_scored', when: { kind: 'card_suit', suit: 'spades' }, op: 'add', target: 'chips', value: 50, text: '每张计分的 ♠ +50 筹码' }),
  J({ id: 'onyx_agate', name: 'Onyx Agate', rarity: 'uncommon', cost: 7, jokerType: '+m', trigger: 'on_card_scored', when: { kind: 'card_suit', suit: 'clubs' }, op: 'add', target: 'mult', value: 7, text: '每张计分的 ♣ +7 倍率' }),
  J({ id: 'rough_gem', name: 'Rough Gem', rarity: 'uncommon', cost: 7, jokerType: '+$', trigger: 'on_card_scored', when: { kind: 'card_suit', suit: 'diamonds' }, op: 'add', target: 'money', value: 1, text: '每张计分的 ♦ +$1' }),
  J({ id: 'triboulet', name: 'Triboulet', rarity: 'legendary', cost: 20, jokerType: 'Xm', trigger: 'on_card_scored', when: { kind: 'card_rank_in', ranks: [12, 13] }, op: 'mul', target: 'mult', value: 2, text: '每张计分的 K/Q ×2 倍率' }),
  J({ id: 'mystic_summit', name: 'Mystic Summit', rarity: 'common', cost: 5, jokerType: '+m', trigger: 'on_hand_scored', when: { kind: 'resource_cmp', id: 'discards_left', cmp: 'lte', value: 0 }, op: 'add', target: 'mult', value: 15, text: '剩余弃牌为 0 时 +15 倍率' }),
  J({ id: 'scholar', name: 'Scholar', rarity: 'common', cost: 4, jokerType: '++', trigger: 'on_card_scored', when: { kind: 'card_rank_in', ranks: [14] }, op: 'add', target: 'chips', value: 20, extra: { op: 'add', target: 'mult', value: 4 }, text: '每张计分的 A +20 筹码 +4 倍率' }),
  J({ id: 'walkie_talkie', name: 'Walkie Talkie', rarity: 'common', cost: 4, jokerType: '++', trigger: 'on_card_scored', when: { kind: 'card_rank_in', ranks: [10, 4] }, op: 'add', target: 'chips', value: 10, extra: { op: 'add', target: 'mult', value: 4 }, text: '每张计分的 10/4 +10 筹码 +4 倍率' }),
  // ── REQ-E-023 ① 计数缩放 / ② 概率（主程引擎落地后接线）──
  J({ id: 'abstract_joker', name: 'Abstract Joker', rarity: 'common', cost: 4, jokerType: '+m', trigger: 'on_hand_scored', when: { kind: 'always' }, op: 'add', target: 'mult', value: 3, countTag: 'jokers', text: '每拥有 1 个小丑 +3 倍率' }),
  J({ id: 'bloodstone', name: 'Bloodstone', rarity: 'uncommon', cost: 7, jokerType: 'Xm', trigger: 'on_card_scored', when: { kind: 'card_suit', suit: 'hearts' }, op: 'mul', target: 'mult', value: 1.5, chance: { num: 1, den: 2 }, text: '每张计分 ♥ 1/2 概率 ×1.5 倍率' }),
  J({ id: 'business_card', name: 'Business Card', rarity: 'common', cost: 4, jokerType: '+$', trigger: 'on_card_scored', when: { kind: 'card_face' }, op: 'add', target: 'money', value: 2, chance: { num: 1, den: 2 }, text: '每张计分人头牌 1/2 概率 +$2' }),
  // ── REQ-E-023 ③ 留手牌结算（HeldHand）──
  J({ id: 'baron', name: 'Baron', rarity: 'rare', cost: 8, jokerType: 'Xm', trigger: 'on_card_scored', when: { kind: 'card_rank_in', ranks: [13] }, op: 'mul', target: 'mult', value: 1.5, held: true, text: '每张留在手里的 K ×1.5 倍率' }),
  J({ id: 'shoot_the_moon', name: 'Shoot the Moon', rarity: 'common', cost: 5, jokerType: '+m', trigger: 'on_card_scored', when: { kind: 'card_rank_in', ranks: [12] }, op: 'add', target: 'mult', value: 13, held: true, text: '每张留在手里的 Q +13 倍率' }),
  // ── REQ-E-023 ⑤ 被动判型修饰（拥有即生效）──
  J({ id: 'four_fingers', name: 'Four Fingers', rarity: 'uncommon', cost: 7, jokerType: '!!', trigger: 'on_blind_selected', when: { kind: 'always' }, op: 'add', target: 'mult', value: 0, handMod: 'four_fingers', text: '4 张牌即可组成同花和顺子' }),
  J({ id: 'shortcut', name: 'Shortcut', rarity: 'uncommon', cost: 7, jokerType: '!!', trigger: 'on_blind_selected', when: { kind: 'always' }, op: 'add', target: 'mult', value: 0, handMod: 'shortcut', text: '顺子允许有 1 个点数空缺' }),
  J({ id: 'smeared_joker', name: 'Smeared Joker', rarity: 'uncommon', cost: 7, jokerType: '!!', trigger: 'on_blind_selected', when: { kind: 'always' }, op: 'add', target: 'mult', value: 0, handMod: 'smeared', text: '红桃方块算同花色、黑桃梅花算同花色' }),
  // ── 经济：过关结算时 +$（游戏侧线性脚本解释 owned，非引擎）──
  J({ id: 'rocket', name: 'Rocket', rarity: 'uncommon', cost: 6, jokerType: '+$', trigger: 'on_round_end', when: { kind: 'always' }, op: 'add', target: 'money', value: 2, econ: { on: 'round', kind: 'per_boss', value: 2 }, text: '回合结束 +$2 × 已击败 Boss 数' }),
  J({ id: 'cloud_9', name: 'Cloud 9', rarity: 'uncommon', cost: 7, jokerType: '+$', trigger: 'on_round_end', when: { kind: 'always' }, op: 'add', target: 'money', value: 1, econ: { on: 'round', kind: 'per_9_in_deck', value: 1 }, text: '回合结束 每张 9 +$1（满副 +$4）' }),
  J({ id: 'to_the_moon', name: 'To the Moon', rarity: 'uncommon', cost: 5, jokerType: '+$', trigger: 'on_round_end', when: { kind: 'always' }, op: 'add', target: 'money', value: 1, econ: { on: 'round', kind: 'interest', value: 1 }, text: '回合结束 每 $5 额外 +$1 利息' }),
  J({ id: 'delayed_gratification', name: 'Delayed Gratification', rarity: 'common', cost: 4, jokerType: '+$', trigger: 'on_round_end', when: { kind: 'always' }, op: 'add', target: 'money', value: 2, econ: { on: 'round', kind: 'per_unused_discard', value: 2 }, text: '本回合一次没弃牌 → 每剩 1 弃牌 +$2' }),
  J({ id: 'faceless_joker', name: 'Faceless Joker', rarity: 'common', cost: 4, jokerType: '+$', trigger: 'on_discard', when: { kind: 'always' }, op: 'add', target: 'money', value: 5, econ: { on: 'discard', kind: 'face_gte_3', value: 5 }, text: '同一次弃掉 ≥3 张人头 → +$5' }),
  // ── REQ-E-023④（重组）自增长：per-joker 计数 Resource + 计分 valueFrom 读出，流程在事件 ± 更新 ──
  J({ id: 'green_joker', name: 'Green Joker', rarity: 'common', cost: 4, jokerType: '+m', trigger: 'on_hand_scored', when: { kind: 'always' }, op: 'add', target: 'mult', value: 0, grow: { start: 0, hand: 1, discard: -1 }, text: '每出一手 +1 倍率、每弃一次 -1 倍率' }),
  J({ id: 'supernova', name: 'Supernova', rarity: 'common', cost: 5, jokerType: '+m', trigger: 'on_hand_scored', when: { kind: 'always' }, op: 'add', target: 'mult', value: 0, grow: { start: 0, hand: 1 }, text: '本局每出一手累加 +1 倍率' }),
  J({ id: 'ice_cream', name: 'Ice Cream', rarity: 'common', cost: 5, jokerType: '+c', trigger: 'on_hand_scored', when: { kind: 'always' }, op: 'add', target: 'chips', value: 0, grow: { start: 100, hand: -5 }, text: '+100 筹码，每出一手 -5' }),
  J({ id: 'popcorn', name: 'Popcorn', rarity: 'common', cost: 5, jokerType: '+m', trigger: 'on_hand_scored', when: { kind: 'always' }, op: 'add', target: 'mult', value: 0, grow: { start: 20, round: -4 }, text: '+20 倍率，每过一关 -4' }),
  J({ id: 'square_joker', name: 'Square Joker', rarity: 'common', cost: 4, jokerType: '+c', trigger: 'on_hand_scored', when: { kind: 'always' }, op: 'add', target: 'chips', value: 0, grow: { start: 0, hand: 4, cond: 'size4' }, text: '每出一手恰 4 张牌 +4 筹码' }),
  J({ id: 'runner', name: 'Runner', rarity: 'common', cost: 5, jokerType: '+c', trigger: 'on_hand_scored', when: { kind: 'always' }, op: 'add', target: 'chips', value: 0, grow: { start: 0, hand: 15, cond: 'straight' }, text: '每打出含顺子的手 +15 筹码' }),
  J({ id: 'spare_trousers', name: 'Spare Trousers', rarity: 'uncommon', cost: 6, jokerType: '+m', trigger: 'on_hand_scored', when: { kind: 'always' }, op: 'add', target: 'mult', value: 0, grow: { start: 0, hand: 2, cond: 'two_pair' }, text: '每打出含两对的手 +2 倍率' }),
  // ── 条件重触发（PerCardRetrigger.when）──
  J({ id: 'hack', name: 'Hack', rarity: 'uncommon', cost: 6, jokerType: '...', trigger: 'on_card_scored', when: { kind: 'card_rank_in', ranks: [2, 3, 4, 5] }, op: 'add', target: 'chips', value: 0, retrigger: 1, text: '每张计分的 2/3/4/5 额外重触发 1 次' }),
  J({ id: 'sock_and_buskin', name: 'Sock and Buskin', rarity: 'uncommon', cost: 6, jokerType: '...', trigger: 'on_card_scored', when: { kind: 'card_face' }, op: 'add', target: 'chips', value: 0, retrigger: 1, text: '每张计分的人头牌额外重触发 1 次' }),
  // ── 留手+概率（能力已就绪，纯数据）──
  J({ id: 'reserved_parking', name: 'Reserved Parking', rarity: 'common', cost: 6, jokerType: '+$', trigger: 'on_card_scored', when: { kind: 'card_face' }, op: 'add', target: 'money', value: 1, held: true, chance: { num: 1, den: 2 }, text: '每张留在手里的人头牌 1/2 概率 +$1' }),
  // ── 被动改手数/弃牌/手牌（每道开局读 owned）──
  J({ id: 'juggler', name: 'Juggler', rarity: 'common', cost: 4, jokerType: '!!', trigger: 'on_blind_selected', when: { kind: 'always' }, op: 'add', target: 'mult', value: 0, passive: { handSize: 1 }, text: '手牌 +1 张' }),
  J({ id: 'drunkard', name: 'Drunkard', rarity: 'common', cost: 4, jokerType: '!!', trigger: 'on_blind_selected', when: { kind: 'always' }, op: 'add', target: 'mult', value: 0, passive: { discards: 1 }, text: '每回合 +1 次弃牌' }),
  J({ id: 'merry_andy', name: 'Merry Andy', rarity: 'uncommon', cost: 7, jokerType: '!!', trigger: 'on_blind_selected', when: { kind: 'always' }, op: 'add', target: 'mult', value: 0, passive: { discards: 3, handSize: -1 }, text: '每回合 +3 次弃牌，手牌 -1 张' }),
  J({ id: 'troubadour', name: 'Troubadour', rarity: 'uncommon', cost: 6, jokerType: '!!', trigger: 'on_blind_selected', when: { kind: 'always' }, op: 'add', target: 'mult', value: 0, passive: { handSize: 2, hands: -1 }, text: '手牌 +2 张，每回合 -1 次出牌' }),
  J({ id: 'burglar', name: 'Burglar', rarity: 'uncommon', cost: 6, jokerType: '!!', trigger: 'on_blind_selected', when: { kind: 'always' }, op: 'add', target: 'mult', value: 0, passive: { hands: 3, discards: -99 }, text: '选盲注后 +3 次出牌，失去全部弃牌' }),
  J({ id: 'stuntman', name: 'Stuntman', rarity: 'rare', cost: 7, jokerType: '+c', trigger: 'on_hand_scored', when: { kind: 'always' }, op: 'add', target: 'chips', value: 250, passive: { handSize: -2 }, text: '+250 筹码，手牌 -2 张' }),
];

/** 自增长小丑的计数 Resource id（per-joker）。 */
export function growResId(id: string): string { return `jc_${id}`; }

/** owned 的被动手数/弃牌/手牌张数总增量（游戏侧每道开局加到基准上）。 */
export function passiveTotals(owned: readonly JokerCard[]): { handSize: number; hands: number; discards: number } {
  let handSize = 0, hands = 0, discards = 0;
  for (const j of owned) if (j.passive) { handSize += j.passive.handSize ?? 0; hands += j.passive.hands ?? 0; discards += j.passive.discards ?? 0; }
  return { handSize, hands, discards };
}

/** 弃牌时 owned 的 on='discard' 经济小丑总 $（Faceless：同次弃 ≥3 张人头 +$5）。 */
export function discardPayout(owned: readonly JokerCard[], facesDiscarded: number): number {
  let m = 0;
  for (const j of owned) if (j.econ?.on === 'discard' && j.econ.kind === 'face_gte_3' && facesDiscarded >= 3) m += j.econ.value;
  return m;
}

/** 经济解释（游戏侧线性脚本调用）：过关结算时 owned 的 on='round' 经济小丑总 $。 */
export function roundEndPayout(owned: readonly JokerCard[], ctx: { money: number; bossesBeaten: number; unusedDiscards: number }): number {
  let m = 0;
  for (const j of owned) {
    if (j.econ?.on !== 'round') continue;
    switch (j.econ.kind) {
      case 'flat': m += j.econ.value; break;
      case 'per_boss': m += j.econ.value * ctx.bossesBeaten; break;
      case 'per_9_in_deck': m += j.econ.value * 4; break; // 标准副 4 张 9
      case 'interest': m += Math.floor(Math.max(0, ctx.money) / 5) * j.econ.value; break;
      case 'per_unused_discard': m += j.econ.value * ctx.unusedDiscards; break;
      default: break;
    }
  }
  return m;
}

/** 按 id 取小丑。 */
export const JOKER_BY_ID: ReadonlyMap<string, JokerCard> = new Map(STARTER_JOKERS.map((j) => [j.id, j]));

/** 商店稀有度权重（对齐 Balatro：常见 ~70% / 罕见 ~25% / 稀有 ~5%）。越强越稀有 → 不会每店都刷到强乘法小丑。 */
export const RARITY_WEIGHT: Readonly<Record<Rarity, number>> = { common: 70, uncommon: 25, rare: 5, legendary: 1 };

/** 稀有度加权抽 n 张未拥有的小丑（rand=取数器，注入以保确定性/可测）。 */
export function rollJokerOffer(ownedIds: ReadonlySet<string>, n: number, rand: () => number): JokerCard[] {
  const tmp = STARTER_JOKERS.filter((j) => !ownedIds.has(j.id));
  const offer: JokerCard[] = [];
  for (let k = 0; k < n && tmp.length; k++) {
    const total = tmp.reduce((s, j) => s + RARITY_WEIGHT[j.rarity], 0);
    let roll = rand() * total;
    let pick = 0;
    for (let i = 0; i < tmp.length; i++) { roll -= RARITY_WEIGHT[tmp[i].rarity]; if (roll <= 0) { pick = i; break; } }
    offer.push(tmp.splice(pick, 1)[0]);
  }
  return offer;
}
