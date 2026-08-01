import { Engine } from '../../runtime/engine.js';
import type { Resource, PlayedHand, Flag, StringVar, ScoreTrace, ScoreEvent } from '@engine/protocol/components.js';
import { buildGameEBlueprint, buildJokerEntities, jokerToEntities, toEngineCard, HAND_TYPE_TO_ENGINE, HANDMOD_FLAGS, F_DID_DISCARD, F_DID_ROUND, R_CHIPS, R_MULT, R_MONEY, R_HAND_SCORE, R_ROUND_SCORE, R_HANDS_LEFT, R_DISCARDS_LEFT, R_BLIND, V_HAND_TYPE } from './blueprint.js';
import { shuffledDeck, mulberry32, type Card } from './deck.js';
import { HAND_ORDER, handScoreAtLevel, type HandType } from './hand-rankings.js';
import { rollJokerOffer, roundEndPayout, discardPayout, passiveTotals, type JokerCard } from './jokers.js';
import { blindRequirement, BLIND_ORDER, type BlindKind } from './blinds.js';
import { type PlanetCard } from './planets.js';
import { bossForAnte, type BossBlind } from './boss-blinds.js';
import { type EnchantId } from './enchants.js';

// ════════════════════════════════════════════════════════════════════════
//  Game E · 回合流程脚本（GameSession）
//
//  ★ 形态声明（与 Lead/用户敲定）：回合流程是一段**线性、过程化的脚本**——
//    这是「游戏=数据」之外被**明确接受**的代码形态（把发牌→出/弃→冲线→结算→商店→下一道
//    这种线性编排硬拼成数据状态机太形而上学）。脚本只做**编排**，不含算分/小丑/牌型逻辑——
//    那些仍是引擎能力 + 数据（poker-hand/card-scoring/effect-apply/ScoreTrace）。
//
//  分层：
//    · 引擎+数据：判牌型、逐张、小丑加乘、合并、逐步 trace（确定性、可测、可 lockstep）。
//    · 本脚本：线性回合编排（盲注/手数/弃牌/抽牌/商店/经济/胜负），读如瀑布。
//    · React(game-e.tsx)：薄表现层——渲染 session 状态 + 把点击转成 session 调用 + 回放 trace。
//
//  无 React 依赖 → 可 headless 单测（回合逻辑不靠 UI 验证）。
// ════════════════════════════════════════════════════════════════════════

export const HAND_SIZE = 8;
export const HANDS_PER_BLIND = 4;
export const DISCARDS_PER_BLIND = 3;
export const JOKER_SLOTS = 5;
export const REROLL_COST = 5;
const BLIND_REWARD: Record<BlindKind, number> = { small: 3, big: 4, boss: 5 };

/** 出牌结算结果（供 UI 回放 trace + 推进流程）。 */
export interface PlayResult {
  type: HandType;
  chips: number;
  mult: number;
  score: number;
  events: ScoreEvent[]; // 引擎逐步 trace（UI 回放，不重算）
  outcome: 'continue' | 'won-blind' | 'lost'; // 继续本盲注 / 过线进商店 / 出牌耗尽失败
}

export class GameSession {
  private engine!: Engine;
  private deck: Card[] = [];
  private deckPtr = 0;
  private seed: number;

  ante = 1;
  blindIdx = 0; // 0 small / 1 big / 2 boss
  owned: JokerCard[] = [];
  hand: Card[] = [];
  /** 各牌型当前等级（星球牌升级，默认 1）。 */
  handLevels: Record<HandType, number> = Object.fromEntries(HAND_ORDER.map((h) => [h, 1])) as Record<HandType, number>;
  /** 本道盲注手牌张数（Boss「镣铐」会减 1）。 */
  handSize = HAND_SIZE;
  /** Boss「尖牙」：每次出牌按张数扣 $。 */
  payPerPlay = false;
  /** 已击败 Boss 数（Rocket 等经济小丑读）。 */
  bossesBeaten = 0;
  /** 本道盲注已弃牌次数（Delayed Gratification 判"一次没弃"）。 */
  discardsUsed = 0;
  /** 牌身份 → 附魔列表（塔罗牌盖章，可叠多个，持久；洗牌不丢，按 suit+rank 绑定）。 */
  enchanted: Record<string, EnchantId[]> = {};

  constructor(seed = 20260608) {
    this.seed = seed;
    this.reset();
  }

  /** 当前 Boss 诅咒（仅 boss 道生效）。 */
  get boss(): BossBlind | null {
    return this.blindKind === 'boss' ? bossForAnte(this.ante) : null;
  }

  // ── 引擎资源读写（薄封装）──
  private resOf(id: string): Resource | undefined {
    for (const [eid] of this.engine.world.query('Resource')) {
      const r = this.engine.world.getComponent<Resource>(eid, 'Resource');
      if (r && r.id === id) return r;
    }
    return undefined;
  }
  get(id: string): number { return this.resOf(id)?.current ?? 0; }
  private set(id: string, v: number): void {
    const r = this.resOf(id);
    if (r) r.current = Math.max(r.min, Math.min(r.max, v));
  }

  // 投影 getter（供 UI / 测试读）。
  get target(): number { return this.get(R_BLIND); }
  get roundScore(): number { return this.get(R_ROUND_SCORE); }
  get handsLeft(): number { return this.get(R_HANDS_LEFT); }
  get discardsLeft(): number { return this.get(R_DISCARDS_LEFT); }
  get money(): number { return this.get(R_MONEY); }
  get blindKind(): BlindKind { return BLIND_ORDER[this.blindIdx]; }
  /** 某牌型当前（含星球牌升级）的基础 chips/mult（读引擎 rankingTable）。 */
  handBase(hand: HandType): { chips: number; mult: number } {
    const pk = this.engine.world.getComponent<{ type: string; rankingTable: Record<string, { chips: number; mult: number }> }>('table', 'PokerHand');
    return pk?.rankingTable[HAND_TYPE_TO_ENGINE[hand]] ?? { chips: 0, mult: 0 };
  }

  /** 整局重开：新引擎（开局 0 小丑）+ 回到 Ante1 小盲注。 */
  reset(): void {
    this.engine = new Engine({ tickRate: 60 });
    this.engine.load(buildGameEBlueprint(buildJokerEntities([])));
    this.engine.world.addComponent('table', { type: 'ScoreTrace', events: [] } as ScoreTrace); // 开启逐步 trace
    this.owned = [];
    this.ante = 1;
    this.blindIdx = 0;
    this.handLevels = Object.fromEntries(HAND_ORDER.map((h) => [h, 1])) as Record<HandType, number>;
    this.enchanted = {};
    this.bossesBeaten = 0;
    this.startBlind();
  }

  /** 给一张牌（按身份）追加一个附魔（塔罗牌来源；可叠加，不覆盖）。 */
  enchant(c: Card, id: EnchantId): void {
    const k = `${c.suit}${c.rank}`;
    this.enchanted[k] = [...(this.enchanted[k] ?? []), id];
  }
  private withEnchant(c: Card): Card {
    const e = this.enchanted[`${c.suit}${c.rank}`];
    return e && e.length ? { ...c, enchants: e } : c;
  }

  /** 用一张星球牌：牌型 +1 级 → 把升级后的基础分写回引擎 rankingTable（下次出牌生效）。 */
  usePlanet(p: PlanetCard): void {
    this.handLevels[p.hand] += 1;
    this.applyHandLevel(p.hand);
  }
  private applyHandLevel(hand: HandType): void {
    const pk = this.engine.world.getComponent<{ type: string; rankingTable: Record<string, { chips: number; mult: number }> }>('table', 'PokerHand');
    if (pk) pk.rankingTable[HAND_TYPE_TO_ENGINE[hand]] = handScoreAtLevel(hand, this.handLevels[hand]);
  }
  /** 由 handLevels 重建引擎 rankingTable（×mult；Boss「燧石」=0.5 减半）。每道盲注开局调，幂等。 */
  private rebuildRankingTable(mult = 1): void {
    const pk = this.engine.world.getComponent<{ type: string; rankingTable: Record<string, { chips: number; mult: number }> }>('table', 'PokerHand');
    if (!pk) return;
    for (const h of HAND_ORDER) {
      const sc = handScoreAtLevel(h, this.handLevels[h] ?? 1);
      pk.rankingTable[HAND_TYPE_TO_ENGINE[h]] = mult === 1 ? sc : { chips: Math.floor(sc.chips * mult), mult: Math.max(1, Math.floor(sc.mult * mult)) };
    }
  }

  /** ① 一道盲注开局：重置回合资源 + 设盲注线（Boss 诅咒可改）+ 洗牌发牌。 */
  startBlind(): void {
    const boss = this.boss;
    const pt = passiveTotals(this.owned); // 被动小丑（Juggler/Drunkard/Stuntman…）改本道资源
    this.handSize = Math.max(1, (boss?.effect === 'small_hand' ? HAND_SIZE - 1 : HAND_SIZE) + pt.handSize);
    this.rebuildRankingTable(boss?.effect === 'halve_base' ? 0.5 : 1); // 燧石减半 / 否则按等级还原
    this.payPerPlay = boss?.effect === 'pay_per_play';
    this.set(R_ROUND_SCORE, 0);
    this.set(R_HANDS_LEFT, Math.max(1, (boss?.effect === 'fewer_hands' ? 1 : HANDS_PER_BLIND) + pt.hands));
    this.set(R_DISCARDS_LEFT, Math.max(0, (boss?.effect === 'no_discards' ? 0 : DISCARDS_PER_BLIND) + pt.discards));
    this.set(R_CHIPS, 0); this.set(R_MULT, 0); this.set(R_HAND_SCORE, 0);
    this.set(R_BLIND, blindRequirement(this.ante, this.blindKind) * (boss?.effect === 'target_x2' ? 2 : 1));
    this.engine.world.getComponent<PlayedHand>('table', 'PlayedHand')!.cards = [];
    this.seed += 1;
    this.deck = shuffledDeck(this.seed);
    this.deckPtr = this.handSize;
    this.hand = this.deck.slice(0, this.handSize);
    this.discardsUsed = 0;
  }

  private drawTo(kept: Card[]): Card[] {
    const need = this.handSize - kept.length;
    const drawn = this.deck.slice(this.deckPtr, this.deckPtr + need);
    this.deckPtr += drawn.length;
    return [...kept, ...drawn];
  }

  /** ② 出牌：引擎结算（牌型/逐张/小丑/合并 + 边沿累加 round_score、hands-1）→ 读 trace + 真值 → 推进流程。 */
  play(selected: readonly number[]): PlayResult | null {
    if (selected.length === 0 || this.handsLeft <= 0) return null;
    const chosen = selected.map((i) => this.hand[i]).filter(Boolean);
    const keepSet = new Set(selected);
    const held = this.hand.filter((_, i) => !keepSet.has(i)); // 留在手里没出的牌（REQ-E-023③）

    this.engine.world.getComponent<PlayedHand>('table', 'PlayedHand')!.cards = chosen.map((c) => toEngineCard(this.withEnchant(c)));
    const heldComp = this.engine.world.getComponent<{ type: string; cards: ReturnType<typeof toEngineCard>[] }>('table', 'HeldHand');
    if (heldComp) heldComp.cards = held.map((c) => toEngineCard(this.withEnchant(c)));
    this.engine.world.getComponent<Flag>('scoring', 'Flag')!.active = true;
    this.engine.world.tick();

    const chips = this.get(R_CHIPS), mult = this.get(R_MULT), score = this.get(R_HAND_SCORE);
    let type: HandType = 'high_card';
    for (const [eid] of this.engine.world.query('StringVar')) {
      const v = this.engine.world.getComponent<StringVar>(eid, 'StringVar');
      if (v && v.id === V_HAND_TYPE) type = v.value.replace(/-/g, '_') as HandType;
    }
    const traceComp = this.engine.world.getComponent<ScoreTrace>('table', 'ScoreTrace');
    const events: ScoreEvent[] = traceComp ? traceComp.events.map((e) => ({ ...e })) : [];

    // 收尾一拍：清出牌/留手 + 关 scoring（disarm 边沿门）。
    this.engine.world.getComponent<PlayedHand>('table', 'PlayedHand')!.cards = [];
    if (heldComp) heldComp.cards = [];
    this.engine.world.getComponent<Flag>('scoring', 'Flag')!.active = false;
    this.engine.world.tick();

    // 抽牌补手（移除已出）。
    const keep = new Set(selected);
    this.hand = this.drawTo(this.hand.filter((_, i) => !keep.has(i)));

    if (this.payPerPlay) this.set(R_MONEY, this.money - chosen.length); // 尖牙：按出牌张数扣 $
    // 自增长「出牌事件」：已由 SIG_COMMIT/条件门的累加 Effect 在上方计分 tick 内自动执行（引擎做，无游戏侧解释）。

    // 推进流程（线性判定）。
    let outcome: PlayResult['outcome'] = 'continue';
    if (this.roundScore >= this.target) {
      const reward = BLIND_REWARD[this.blindKind] + this.handsLeft + Math.min(5, Math.floor(this.money / 5));
      this.set(R_MONEY, this.money + reward);
      if (this.blindKind === 'boss') this.bossesBeaten += 1;
      const unusedDiscards = this.discardsUsed === 0 ? this.discardsLeft : 0; // 一次没弃才算
      this.set(R_MONEY, this.money + roundEndPayout(this.owned, { money: this.money, bossesBeaten: this.bossesBeaten, unusedDiscards }));
      this.pulse(F_DID_ROUND); // 过关事件（Popcorn 等自增长）→ 引擎累加 Effect
      outcome = 'won-blind';
    } else if (this.handsLeft <= 0) {
      outcome = 'lost';
    }
    return { type, chips, mult, score, events, outcome };
  }

  /** ③ 弃牌：扣弃牌额度 + 补牌（不计分、不耗出牌次数）。 */
  discard(selected: readonly number[]): boolean {
    if (selected.length === 0 || this.discardsLeft <= 0) return false;
    this.set(R_DISCARDS_LEFT, this.discardsLeft - 1);
    const keep = new Set(selected);
    const discarded = this.hand.filter((_, i) => keep.has(i));
    this.discardsUsed += 1;
    // 自增长（弃牌事件）+ 弃牌经济（Faceless：弃 ≥3 人头 +$5）。
    this.pulse(F_DID_DISCARD); // 弃牌事件（Green -1 等自增长）→ 引擎累加 Effect
    const faces = discarded.filter((c) => c.rank === 'J' || c.rank === 'Q' || c.rank === 'K').length;
    this.set(R_MONEY, this.money + discardPayout(this.owned, faces));
    this.hand = this.drawTo(this.hand.filter((_, i) => !keep.has(i)));
    return true;
  }

  /** 商店货：从未拥有的小丑里种子化、按稀有度加权取 3 张。 */
  rollShop(rngSeed = this.seed): JokerCard[] {
    return rollJokerOffer(new Set(this.owned.map((o) => o.id)), 3, mulberry32(rngSeed));
  }

  /** ④ 买小丑：扣钱 + 加入 owned + 把它的实体注入运行中的引擎。 */
  buyJoker(j: JokerCard): boolean {
    if (this.owned.length >= JOKER_SLOTS || this.money < j.cost) return false;
    this.set(R_MONEY, this.money - j.cost);
    const ents = jokerToEntities(j, this.owned.length);
    for (const [eid, comps] of Object.entries(ents)) {
      this.engine.world.createEntity(eid);
      for (const [type, data] of Object.entries(comps as Record<string, object>)) {
        this.engine.world.addComponent(eid, { type, ...(data as object) } as never);
      }
    }
    if (j.handMod) for (const fid of HANDMOD_FLAGS[j.handMod]) this.setFlagById(fid, true); // REQ-E-023⑤：点亮判型修饰
    this.owned = [...this.owned, j];
    return true;
  }

  private setFlagById(id: string, active: boolean): void {
    for (const [eid] of this.engine.world.query('Flag')) {
      const f = this.engine.world.getComponent<Flag>(eid, 'Flag');
      if (f && f.id === id) { f.active = active; return; }
    }
  }
  /** 脉冲一个边沿 Flag（升→tick→降→tick），让监听它的累加 Effect 各跑一次（弃牌/过关自增长）。 */
  private pulse(flagId: string): void {
    this.setFlagById(flagId, true); this.engine.world.tick();
    this.setFlagById(flagId, false); this.engine.world.tick();
  }

  reroll(): boolean {
    if (this.money < REROLL_COST) return false;
    this.set(R_MONEY, this.money - REROLL_COST);
    return true;
  }

  /** ⑤ 进下一道盲注（Boss 后进下一 Ante）。 */
  nextBlind(): void {
    this.blindIdx += 1;
    if (this.blindIdx > 2) { this.blindIdx = 0; this.ante += 1; }
    this.startBlind();
  }
}
