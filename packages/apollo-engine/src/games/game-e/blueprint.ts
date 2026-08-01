import type { WorldBlueprint, EntityBlueprint } from '../../assembly/demo.assembly.js';
import type { Card } from '@engine/protocol/components.js';
import { resourceCapability, flagCapability, stringVariableCapability } from '@atom-skills/index.js';
import { eventWhenCapability, effectApplyCapability } from '@skills/tier2/index.js';
import { pokerHandCapability, cardScoringCapability } from '@skills/tier3/index.js';
import { HAND_RANKINGS, type HandType } from './hand-rankings.js';
import { RANK_ORDER, type Card as DataCard } from './deck.js';
import { ENCHANTS } from './enchants.js';
import { growResId } from './jokers.js';
import type { JokerCard, ScoreTarget } from './jokers.js';

// ════════════════════════════════════════════════════════════════════════
//  Game E · 计分链蓝图 —— 纯数据装配真能力，零游戏 system 代码。
//
//  一拍计分（同 tick）：
//    poker-eval(Update) 读 PlayedHand → 判牌型 → set 基础 chips/mult + 写 hand_type
//      → event-when(Update) 按 flag/hand_type 发信号(score / jolly_fire)
//      → effect-apply(Commit) 按 order 升序对 chips/mult 加/乘（小丑结算）
//
//  分工严守 manifesto：判牌型=poker-hand(REQ-011)，加乘有序=effect-apply(REQ-012)，
//  其余（选牌/盲注/回合）用 flag/condition/event-when 重组。小丑 = 一条 Effect 数据。
//  仍缺 REQ-013(valueFrom)：score=chips×mult 的「资源×资源」与量纲动态值小丑(Bull/Banner)待它。
// ════════════════════════════════════════════════════════════════════════

// 资源 / 信号 / 变量 id（测试与装配共用）。
export const R_CHIPS = 'chips';
export const R_MULT = 'mult';
export const R_MONEY = 'money';
export const R_HAND_SCORE = 'hand_score'; // 本手最终得分 = chips × mult（REQ-013 valueFrom timesResourceId）
export const V_HAND_TYPE = 'hand_type';
export const F_SCORING = 'scoring';
export const F_STRAIGHT = 'is_straight'; // poker-eval 写：本手是否含顺子（REQ-E-022）
export const F_FLUSH = 'is_flush'; // poker-eval 写：本手是否含同花（REQ-E-022）
// REQ-E-023⑤ 判型规则修饰 Flag（被动小丑置位，poker-eval 读 → 改判型阈值）。
export const F_MOD_FOURFINGERS = 'mod_four_fingers';
export const F_MOD_SHORTCUT = 'mod_shortcut';
export const F_MOD_SMEARED = 'mod_smeared';
/** handMod 种类 → 它点亮的 Flag id（买/卖时游戏侧置位）。four_fingers 同时开 4 张顺+4 张同花。 */
export const HANDMOD_FLAGS: Record<string, readonly string[]> = {
  four_fingers: [F_MOD_FOURFINGERS],
  shortcut: [F_MOD_SHORTCUT],
  smeared: [F_MOD_SMEARED],
};
export const SIG_SCORE = 'score';
export const SIG_JOLLY = 'jolly_fire';
// 回合循环（增量1：可玩切片）。round_score 跨手累加；hands_left 每出一手 -1；blind_target 过关线。
export const R_ROUND_SCORE = 'round_score';
export const R_HANDS_LEFT = 'hands_left';
export const R_DISCARDS_LEFT = 'discards_left';
export const R_BLIND = 'blind_target';
export const SIG_COMMIT = 'hand_committed'; // 边沿信号：每"出一手"触发一次（与 score 的 level 区分）
// REQ-E-023④（数据驱动）：弃牌 / 过关 边沿信号 —— 游戏侧脉冲对应 Flag → 自增长小丑的累加 Effect 监听它。
export const SIG_DISCARD = 'discard_made';
export const SIG_ROUND = 'round_cleared';
export const F_DID_DISCARD = 'did_discard';
export const F_DID_ROUND = 'did_round';
// poker-eval 派生事实（供条件类小丑门控："含对子/三条/两对" = rankMaxCount/pairCount 阈值；"出牌≤N" = handSize）。
export const R_RANK_MAX = 'rank_max_count';
export const R_PAIR_COUNT = 'pair_count';
export const R_HAND_SIZE = 'hand_size';

// 数据牌型 id（下划线）→ 引擎 poker-hand 牌型名（连字符）。
export const HAND_TYPE_TO_ENGINE: Record<HandType, string> = {
  high_card: 'high-card',
  pair: 'pair',
  two_pair: 'two-pair',
  three_kind: 'three-of-a-kind',
  straight: 'straight',
  flush: 'flush',
  full_house: 'full-house',
  four_kind: 'four-of-a-kind',
  straight_flush: 'straight-flush',
  five_kind: 'five-of-a-kind',
  flush_house: 'flush-house',
  flush_five: 'flush-five',
};

/** 由数据牌型表构造 poker-hand 的 rankingTable（引擎键名）。 */
export function buildRankingTable(): Record<string, { chips: number; mult: number }> {
  const table: Record<string, { chips: number; mult: number }> = {};
  for (const id of Object.keys(HAND_RANKINGS) as HandType[]) {
    const r = HAND_RANKINGS[id];
    table[HAND_TYPE_TO_ENGINE[id]] = { chips: r.baseChips, mult: r.baseMult };
  }
  return table;
}

/** 引擎牌型名中「包含对子」的全集（maxCount≥2）。Balatro：三条/葫芦/四条等都 contains pair。 */
export const ENGINE_HANDS_CONTAINING_PAIR: readonly string[] = [
  'pair',
  'two-pair',
  'three-of-a-kind',
  'full-house',
  'four-of-a-kind',
  'five-of-a-kind',
  'flush-house',
  'flush-five',
];

// 花色名 → 引擎数字（0..3）。
const SUIT_TO_NUM: Record<DataCard['suit'], number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };

/** 数据牌 {suit,rank(字符串),enchants?} → 引擎牌 {suit,rank,mods?,retrigger?}（多附魔合并：mods 串接、retrigger 求和，REQ-E-021）。 */
export function toEngineCard(c: DataCard): Card {
  const out: Card = { suit: SUIT_TO_NUM[c.suit], rank: RANK_ORDER[c.rank] };
  if (c.enchants && c.enchants.length) {
    const mods: Array<{ op: 'add' | 'mul'; target: string; value: number }> = [];
    let retrig = 0;
    for (const id of c.enchants) {
      const en = ENCHANTS[id];
      if (en.mods) for (const m of en.mods) mods.push({ ...m });
      if (en.retrigger) retrig += en.retrigger;
    }
    if (mods.length) out.mods = mods;
    if (retrig) out.retrigger = retrig;
  }
  return out;
}

/** 便捷构造引擎牌（直接给数字）。 */
export const card = (suit: number, rank: number): Card => ({ suit, rank });

// Balatro 标准每牌基础筹码（纯数据，引擎不写死）：2..10=点值，J/Q/K=10，A=11。
// card-scoring(REQ-014) 逐张 pass 据此累加 chips（= 牌型基础 + Σ每张牌 baseChips）。
export const BASE_CHIPS_BY_RANK: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  '11': 10, '12': 10, '13': 10, '14': 11,
};

/** 一手牌的逐张 baseChips 之和（测试/UI 投影；与 card-score-pass 同源数据）。 */
export function sumBaseChips(cards: readonly Card[]): number {
  return cards.reduce((s, c) => s + (BASE_CHIPS_BY_RANK[String(c.rank)] ?? 0), 0);
}

// ════════════════════════════════════════════════════════════════════════
//  小丑 = 纯数据 → 蓝图实体（catalog → entities 派生，"加一张小丑 = 加一条数据，零蓝图代码"）。
//  buildJokerEntities 把 jokers.ts 的 JokerCard 声明映射到引擎实体，严守"逻辑在引擎、小丑是数据"：
//    - on_hand_scored + always        → Effect(onSignal=score)
//    - on_hand_scored + hand_contains  → EventWhen(and(scoring, rankMaxCount/pairCount 阈值)) + Effect(该信号)
//    - on_hand_scored + hand_size_lte  → EventWhen(and(scoring, hand_size lte n)) + Effect
//    - on_card_scored + card_suit/face/even → PerCardRule（逐张，REQ-014）
//    - retrigger>0（Hanging Chad）      → PerCardRetrigger（首张重触发，REQ-014）
//    - on_round_end / on_blind_selected → 暂跳过（切片无回合结束/选盲注信号；后续增量接）
//  order：加在前(10+idx) / 乘在后(100+idx) → 保证"先加后乘"（组内可交换，结果确定）。
// ════════════════════════════════════════════════════════════════════════

const TARGET_TO_RES: Record<ScoreTarget, string> = { chips: R_CHIPS, mult: R_MULT, money: R_MONEY };
// 量纲动态值的资源源（jokers.ts ValueFrom.resourceId → 引擎 Resource id）。
const VALUEFROM_RES: Record<string, string> = { money: R_MONEY, discards: R_DISCARDS_LEFT };

// 牌型"包含"判定 → 条件（用 poker-eval 派生事实，非字符串牌型名）。含对子=rankMaxCount≥2、含三条=≥3、含两对=pairCount≥2、含四条=≥4。
function containsCondition(hand: HandType): Record<string, unknown> {
  switch (hand) {
    case 'pair': return { kind: 'resource', id: R_RANK_MAX, cmp: 'gte', value: 2 };
    case 'three_kind': return { kind: 'resource', id: R_RANK_MAX, cmp: 'gte', value: 3 };
    case 'four_kind': return { kind: 'resource', id: R_RANK_MAX, cmp: 'gte', value: 4 };
    case 'two_pair': return { kind: 'resource', id: R_PAIR_COUNT, cmp: 'gte', value: 2 };
    case 'straight': return { kind: 'flag', id: F_STRAIGHT }; // REQ-E-022
    case 'flush': return { kind: 'flag', id: F_FLUSH }; // REQ-E-022
    default: throw new Error(`containsCondition: 未支持的牌型包含判定 "${hand}"（需补派生事实）`);
  }
}

/** 一张小丑 → 它在蓝图里的实体集（id 以 `j_<jokerId>` 前缀，避免碰撞）。idx 决定结算 order。 */
/** 小丑实体打的 Tag 位（REQ-E-023① countOf 用：Abstract「每小丑 +3 倍」数它）。 */
export const TAG_JOKER = 1;

export function jokerToEntities(j: JokerCard, idx: number): Record<string, EntityBlueprint> {
  const out: Record<string, EntityBlueprint> = {};
  const target = TARGET_TO_RES[j.target];
  const order = (j.op === 'mul' ? 100 : 10) + idx;
  const valueFrom = j.valueFrom ? { resourceId: VALUEFROM_RES[j.valueFrom.resourceId] ?? j.valueFrom.resourceId, coeff: j.valueFrom.coeff } : undefined;
  // 给主实体 j_<id> 打 JOKER tag（每张小丑恰好一个 → countOf 数得准），并返回。
  const tagged = (o: Record<string, EntityBlueprint>): Record<string, EntityBlueprint> => {
    const e = o[`j_${j.id}`] as Record<string, unknown> | undefined;
    if (e) e.Tag = { flags: TAG_JOKER };
    return o;
  };

  // REQ-E-023⑤：被动判型修饰小丑（four_fingers/shortcut/smeared）—— 无计分实体，只占一个 tag（供 countOf 数 + 占位）；
  // 判型 Flag 由游戏侧买/卖时置位（见 HANDMOD_FLAGS）。
  if (j.handMod) { out[`j_${j.id}`] = {} as unknown as EntityBlueprint; return tagged(out); }

  if (j.trigger === 'on_card_scored') {
    let pcWhen: Record<string, unknown>;
    if (j.when.kind === 'card_suit') pcWhen = { kind: 'suit', suit: SUIT_TO_NUM[j.when.suit] };
    else if (j.when.kind === 'card_face') pcWhen = { kind: 'rankIn', ranks: [11, 12, 13] };
    else if (j.when.kind === 'card_even') pcWhen = { kind: 'rankIn', ranks: [2, 4, 6, 8, 10] };
    else if (j.when.kind === 'card_odd') pcWhen = { kind: 'rankIn', ranks: [14, 3, 5, 7, 9] };
    else if (j.when.kind === 'card_rank_in') pcWhen = { kind: 'rankIn', ranks: [...j.when.ranks] };
    else pcWhen = { kind: 'always' };
    // 逐张重触发：always=首张(Hanging Chad, index 0)；带条件=按 when 命中的牌（Hack 2/3/4/5、Sock and Buskin 人头）。
    if (j.retrigger && j.retrigger > 0) {
      const rw = j.when.kind === 'always' ? { kind: 'index', eq: 0 } : pcWhen;
      out[`j_${j.id}`] = { PerCardRetrigger: { when: rw, extra: j.retrigger } } as unknown as EntityBlueprint;
      return tagged(out);
    }
    const pcr: Record<string, unknown> = { when: pcWhen, op: j.op, targetResource: target, value: j.value };
    if (j.chance) pcr.chance = j.chance; // REQ-E-023②：逐张概率门（Bloodstone/Business Card）
    if (j.held) pcr.held = true; // REQ-E-023③：对留手牌求值（Baron/Shoot the Moon）
    out[`j_${j.id}`] = { PerCardRule: pcr } as unknown as EntityBlueprint;
    // 第二条效果（Scholar/Walkie：同 when 再加一条 PerCardRule）。
    if (j.extra) out[`j_${j.id}_x`] = { PerCardRule: { when: pcWhen, op: j.extra.op, targetResource: TARGET_TO_RES[j.extra.target], value: j.extra.value } } as unknown as EntityBlueprint;
    return tagged(out);
  }

  // on_round_end / on_discard / on_blind_selected：效果由游戏侧线性脚本解释 owned（经济等），引擎侧只占一个 tag（countOf 计入 + 占位）。
  if (j.trigger !== 'on_hand_scored') { out[`j_${j.id}`] = {} as unknown as EntityBlueprint; return tagged(out); }

  const effect: Record<string, unknown> = { onSignal: SIG_SCORE, kind: 'modify-resource', targetId: target, op: j.op, order };
  if (j.grow) { // REQ-E-023④（数据驱动）：计分读 per-joker 计数 Resource；累加由「信号→Effect」做，引擎执行（无游戏侧解释器）
    const gid = growResId(j.id);
    effect.valueFrom = { resourceId: gid };
    out[gid] = { Resource: { id: gid, current: j.grow.start, min: -1_000_000_000, max: 1_000_000_000 } } as unknown as EntityBlueprint;
    const acc = (key: string, signal: string, delta: number) => { out[key] = { Effect: { onSignal: signal, kind: 'modify-resource', targetId: gid, op: 'add', value: delta, order: 3000 } } as unknown as EntityBlueprint; };
    if (j.grow.hand != null) {
      if (j.grow.cond) { // 条件累加：出牌边沿 + 牌面条件（同 jolly 门套路）
        const cond = j.grow.cond === 'size4' ? { kind: 'resource', id: R_HAND_SIZE, cmp: 'eq', value: 4 } : j.grow.cond === 'straight' ? { kind: 'flag', id: F_STRAIGHT } : { kind: 'resource', id: R_PAIR_COUNT, cmp: 'gte', value: 2 };
        out[`gg_${j.id}`] = { EventWhen: { signal: `gs_${j.id}`, when: { kind: 'and', of: [{ kind: 'flag', id: F_SCORING }, cond] }, mode: 'edge', armed: false } } as unknown as EntityBlueprint;
        acc(`ga_${j.id}`, `gs_${j.id}`, j.grow.hand);
      } else acc(`ga_${j.id}`, SIG_COMMIT, j.grow.hand);
    }
    if (j.grow.discard != null) acc(`gd_${j.id}`, SIG_DISCARD, j.grow.discard);
    if (j.grow.round != null) acc(`gr_${j.id}`, SIG_ROUND, j.grow.round);
  } else if (j.countTag === 'jokers') effect.valueFrom = { countOf: TAG_JOKER, coeff: j.value }; // REQ-E-023①：×小丑数（Abstract）
  else if (valueFrom) effect.valueFrom = valueFrom;
  else effect.value = j.value;
  if (j.chance) effect.chance = j.chance; // REQ-E-023②：整手概率门

  if (j.when.kind === 'always') {
    out[`j_${j.id}`] = { Effect: effect } as unknown as EntityBlueprint;
    return tagged(out);
  }

  // 条件类：建专属信号门（scoring 且 含某牌型 / 出牌≤N），Effect 监听该门信号。
  const sig = `js_${j.id}`;
  let cond: Record<string, unknown>;
  if (j.when.kind === 'hand_contains') cond = containsCondition(j.when.hand);
  else if (j.when.kind === 'hand_size_lte') cond = { kind: 'resource', id: R_HAND_SIZE, cmp: 'lte', value: j.when.n };
  else if (j.when.kind === 'resource_cmp') cond = { kind: 'resource', id: j.when.id, cmp: j.when.cmp, value: j.when.value };
  else cond = { kind: 'flag', id: F_SCORING };
  out[`gate_${j.id}`] = { EventWhen: { signal: sig, when: { kind: 'and', of: [{ kind: 'flag', id: F_SCORING }, cond] }, mode: 'level', armed: false } } as unknown as EntityBlueprint;
  out[`j_${j.id}`] = { Effect: { ...effect, onSignal: sig } } as unknown as EntityBlueprint;
  return tagged(out);
}

/** 一组小丑 → 合并的蓝图实体集（供 buildGameEBlueprint 的 jokerEntities 参数）。 */
export function buildJokerEntities(jokers: readonly JokerCard[]): Record<string, EntityBlueprint> {
  const out: Record<string, EntityBlueprint> = {};
  jokers.forEach((j, i) => Object.assign(out, jokerToEntities(j, i)));
  return out;
}

// 默认（curated）小丑实体：保留本程之前手调的 5 张 + Jolly 门，作为确定性回归测试的稳定基线。
// 真游戏（game-e.tsx）传 buildJokerEntities(STARTER_JOKERS) 接全 14 张。
function curatedJokerEntities(): Record<string, EntityBlueprint> {
  return {
    joker_base: { Effect: { onSignal: SIG_SCORE, kind: 'modify-resource', targetId: R_MULT, op: 'add', value: 4, order: 10 } } as unknown as EntityBlueprint,
    joker_chips: { Effect: { onSignal: SIG_SCORE, kind: 'modify-resource', targetId: R_CHIPS, op: 'add', value: 50, order: 5 } } as unknown as EntityBlueprint,
    joker_jolly: { Effect: { onSignal: SIG_JOLLY, kind: 'modify-resource', targetId: R_MULT, op: 'add', value: 8, order: 11 } } as unknown as EntityBlueprint,
    joker_cavendish: { Effect: { onSignal: SIG_SCORE, kind: 'modify-resource', targetId: R_MULT, op: 'mul', value: 3, order: 100 } } as unknown as EntityBlueprint,
    joker_bull: { Effect: { onSignal: SIG_SCORE, kind: 'modify-resource', targetId: R_CHIPS, op: 'add', valueFrom: { resourceId: R_MONEY, coeff: 2 }, order: 6 } } as unknown as EntityBlueprint,
    gate_jolly: {
      EventWhen: {
        signal: SIG_JOLLY,
        when: {
          kind: 'and',
          of: [
            { kind: 'flag', id: F_SCORING },
            { kind: 'or', of: ENGINE_HANDS_CONTAINING_PAIR.map((h) => ({ kind: 'string', id: V_HAND_TYPE, equals: h })) },
          ],
        },
        mode: 'level',
        armed: false,
      },
    } as unknown as EntityBlueprint,
  };
}

export function buildGameEBlueprint(jokerEntities: Record<string, EntityBlueprint> = curatedJokerEntities()): WorldBlueprint {
  const entities: Record<string, EntityBlueprint> = {
    // ── 计分资源（基础值由 poker-eval set，小丑在其上加乘）──
    chips: { Resource: { id: R_CHIPS, current: 0, min: 0, max: 1_000_000_000_000 } } as unknown as EntityBlueprint,
    mult: { Resource: { id: R_MULT, current: 0, min: 0, max: 1_000_000_000 } } as unknown as EntityBlueprint,
    money: { Resource: { id: R_MONEY, current: 4, min: -20, max: 1_000_000 } } as unknown as EntityBlueprint,
    handScore: { Resource: { id: R_HAND_SCORE, current: 0, min: 0, max: 1_000_000_000_000 } } as unknown as EntityBlueprint,

    // 牌型名（poker-eval 写；条件类小丑用 condition.string 读）。
    handType: { StringVar: { id: V_HAND_TYPE, value: '' } } as unknown as EntityBlueprint,

    // 计分开关（装配层/输入层在「出牌」时置 true → 驱动 score 信号）。
    scoring: { Flag: { id: F_SCORING, active: false } } as unknown as EntityBlueprint,
    // poker-eval 写的牌型派生 Flag（REQ-E-022）：含顺子 / 含同花。条件类小丑门控读。
    isStraight: { Flag: { id: F_STRAIGHT, active: false } } as unknown as EntityBlueprint,
    isFlush: { Flag: { id: F_FLUSH, active: false } } as unknown as EntityBlueprint,
    // 概率门用的世界 RNG（REQ-E-023②：Bloodstone/Business Card 等；缺它则概率小丑 fail-closed）。
    rng: { RandomSeed: { seed: 20260618, sequence: 0 } } as unknown as EntityBlueprint,
    // REQ-E-023⑤ 判型规则修饰 Flag（被动小丑买入时置位）。
    modFourFingers: { Flag: { id: F_MOD_FOURFINGERS, active: false } } as unknown as EntityBlueprint,
    modShortcut: { Flag: { id: F_MOD_SHORTCUT, active: false } } as unknown as EntityBlueprint,
    modSmeared: { Flag: { id: F_MOD_SMEARED, active: false } } as unknown as EntityBlueprint,

    // ── 回合循环资源（增量1：单局可玩切片）。round_score 跨手累加、过 blind_target 即胜；hands_left 出一手 -1。──
    roundScore: { Resource: { id: R_ROUND_SCORE, current: 0, min: 0, max: 1_000_000_000_000 } } as unknown as EntityBlueprint,
    handsLeft: { Resource: { id: R_HANDS_LEFT, current: 4, min: 0, max: 99 } } as unknown as EntityBlueprint,
    discardsLeft: { Resource: { id: R_DISCARDS_LEFT, current: 3, min: 0, max: 99 } } as unknown as EntityBlueprint,
    blindTarget: { Resource: { id: R_BLIND, current: 300, min: 0, max: 1_000_000_000_000 } } as unknown as EntityBlueprint,

    // poker-eval 派生事实（条件类小丑门控用）：含对子/三条/两对/出牌张数。
    rankMax: { Resource: { id: R_RANK_MAX, current: 0, min: 0, max: 5 } } as unknown as EntityBlueprint,
    pairCount: { Resource: { id: R_PAIR_COUNT, current: 0, min: 0, max: 5 } } as unknown as EntityBlueprint,
    handSize: { Resource: { id: R_HAND_SIZE, current: 0, min: 0, max: 5 } } as unknown as EntityBlueprint,

    // ── 牌桌（单例）：评估器 + 逐张计分配置 + 当前出的牌（选牌交互填 cards）。──
    // PokerHand(REQ-011) 出牌型基础分 + 派生事实；PerCardScore(REQ-014) 逐张累加 baseChips（chips = 牌型基础 + Σ每张牌）。
    table: {
      PokerHand: {
        rankingTable: buildRankingTable(), chipsResource: R_CHIPS, multResource: R_MULT, handTypeVar: V_HAND_TYPE,
        rankMaxCountResource: R_RANK_MAX, pairCountResource: R_PAIR_COUNT, handSizeResource: R_HAND_SIZE,
        isStraightFlag: F_STRAIGHT, isFlushFlag: F_FLUSH,
        handMods: { fourFlushFlag: F_MOD_FOURFINGERS, fourStraightFlag: F_MOD_FOURFINGERS, gappedStraightFlag: F_MOD_SHORTCUT, suitMergeFlag: F_MOD_SMEARED }, // REQ-E-023⑤
      },
      PerCardScore: { chipsResource: R_CHIPS, baseChipsByRank: BASE_CHIPS_BY_RANK },
      PlayedHand: { cards: [] as Card[] },
      HeldHand: { cards: [] as Card[] }, // REQ-E-023③：留手牌（Baron/Shoot the Moon 等读它）
    } as unknown as EntityBlueprint,

    // ── 信号门：scoring → score（每帧 level）──
    gate_score: { EventWhen: { signal: SIG_SCORE, when: { kind: 'flag', id: F_SCORING }, mode: 'level', armed: false } } as unknown as EntityBlueprint,

    // ── 小丑实体（参数注入：默认 curated 5 张；游戏传 buildJokerEntities(STARTER_JOKERS) 接全 14 张）──
    ...jokerEntities,

    // ── 最终合并：hand_score = chips × mult（order 1000，在所有小丑加乘之后）──
    score_combine: { Effect: { onSignal: SIG_SCORE, kind: 'modify-resource', targetId: R_HAND_SCORE, op: 'set', valueFrom: { resourceId: R_CHIPS, timesResourceId: R_MULT }, order: 1000 } } as unknown as EntityBlueprint,

    // ── 回合进度（边沿：每"出一手"一次，与计分链的 level 区分）──
    // gate_commit 在 scoring 上升沿发 hand_committed（一次）；round_accumulate/hands_decrement 监听它，
    // 故多 tick 持有 scoring 也只累加/递减一次（与计分链每 tick 幂等重算解耦）。
    gate_commit: { EventWhen: { signal: SIG_COMMIT, when: { kind: 'flag', id: F_SCORING }, mode: 'edge', armed: false } } as unknown as EntityBlueprint,
    // round_score += hand_score（order>score_combine 的 1000 → 同 tick 读到刚 set 的本手分）。
    round_accumulate: { Effect: { onSignal: SIG_COMMIT, kind: 'modify-resource', targetId: R_ROUND_SCORE, op: 'add', valueFrom: { resourceId: R_HAND_SCORE }, order: 2000 } } as unknown as EntityBlueprint,
    hands_decrement: { Effect: { onSignal: SIG_COMMIT, kind: 'modify-resource', targetId: R_HANDS_LEFT, op: 'add', value: -1, order: 2001 } } as unknown as EntityBlueprint,

    // ── 弃牌 / 过关 边沿信号（REQ-E-023④ 数据驱动自增长）：游戏侧脉冲 Flag → 这里发信号 → 累加 Effect 监听 ──
    didDiscard: { Flag: { id: F_DID_DISCARD, active: false } } as unknown as EntityBlueprint,
    didRound: { Flag: { id: F_DID_ROUND, active: false } } as unknown as EntityBlueprint,
    gate_discard: { EventWhen: { signal: SIG_DISCARD, when: { kind: 'flag', id: F_DID_DISCARD }, mode: 'edge', armed: false } } as unknown as EntityBlueprint,
    gate_round: { EventWhen: { signal: SIG_ROUND, when: { kind: 'flag', id: F_DID_ROUND }, mode: 'edge', armed: false } } as unknown as EntityBlueprint,
  };

  return {
    capabilities: [
      resourceCapability,
      flagCapability,
      stringVariableCapability,
      pokerHandCapability,
      cardScoringCapability, // REQ-014：逐张 baseChips 累加 + 逐张小丑 + retrigger
      eventWhenCapability,
      effectApplyCapability,
    ],
    entities,
  };
}
