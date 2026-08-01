import { defineCapability } from '@engine/core/define-capability.js';
import type { Card } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  t3-hand-pattern —— 通用「变长牌族」判型 + 跨型压制序 + 逢人配的确定性解释器
//  （REQ-GUANDAN-牌型 下沉；Tier3「算法/解释器型机制」大类）。
//
//  为什么不改 t3-poker-hand（前置裁决 2026-07-17）：poker-hand 是 Balatro 域**计分器**——
//  牌型固定闭集（high-card…flush-five）评一手出 chips/mult；无变长牌族（4-10 炸/三连对/钢板）、
//  无跨型压制序（炸弹族 > 普通型）、无「甲能否压乙」成对比较、无级牌语义。这些是**判定器本身的域差**，
//  不是 rankingTable 数据填得出来的。故另立通用表驱动件（poker-hand 本体零改动，只借鉴其
//  isStraightRanks 连续段技法 + wild 有界枚举思路）。
//
//  设计三层（严守 manifesto：牌族/压制阶/级牌全是 config 数据，引擎只当固定解释器）：
//    ① 牌族 DSL 闭集（config·纯数据）：5 kind = ntuple/sequence/tuple-sequence/flush-sequence/fixed-set。
//    ② 压制序=数值阶表（config·data）：family.tier（普通型 0；炸弹族按长度/同花顺/天王 t1..t9）。
//    ③ 级牌语义（config）：levelRank（比 A 大比小王小的重映射）+ wild（红桃级牌逢人配·除王外百搭）。
//  三接口（纯函数·全整数·确定性·可回放）：
//    matchPattern(cards,cfg)  —— 判型（返回最强合法解释，含 tier/rank）。
//    beats(a,b,cfg)           —— 成对压制（a 能否压 b）。
//    legalResponses(hand,target,cfg) —— 合法应对枚举（确定性排序·首个=最小合法压牌；提示按钮 + AI 候选共用）。
//  掼蛋（淮安标准）= 首个消费方的 **config fixture**（能力本身游戏无关）；同族游戏（斗地主/跑得快）后续零代码接入。
//  确定性：纯整数计数/连续段扫描/有界枚举，无随机、无浮点 → lockstep/录放安全。
// ═══════════════════════════════════════════════════════════════

// ── 牌族 DSL 闭集（config·纯数据）─────────────────────────────────────────────
export type FamilyKind =
  | 'ntuple' // 同点 N 张：单/对/三/三带二（composition）/炸弹（n 变长）
  | 'sequence' // 顺子：runLen 连续 rank 各 1 张
  | 'tuple-sequence' // 三连对(木板)/钢板(二连三)：runLen 连续 rank 各 groupSize 张
  | 'flush-sequence' // 同花顺：sequence 且全同花色
  | 'fixed-set'; // 天王炸：字面牌集（rank+count 硬清单，如四大天王）

export interface HandFamily {
  name: string; // 牌族名（如 'single'/'pair'/'bomb'/'straight-flush'）
  kind: FamilyKind;
  // ntuple：composition（固定组结构，各组 distinct rank）或 n（单组变长）二选一。
  //   单=composition[1] / 对=[2] / 三=[3] / 三带二=[3,2]；炸弹=n{min:4,max:10}。
  composition?: readonly number[];
  n?: { min: number; max: number };
  // sequence / tuple-sequence / flush-sequence 的连续段参数。
  runLen?: number; // 连续 rank 段长
  groupSize?: number; // tuple-sequence 每 rank 张数（三连对=2，钢板=3）；sequence/flush-sequence 缺省 1
  suited?: boolean; // 是否要求全同花色（flush-sequence=true）
  // fixed-set 的字面牌清单（rank→需要张数）。天王炸=[{rank:小王,count:2},{rank:大王,count:2}]。
  cards?: readonly { rank: number; count: number }[];
  // 压制阶：数值（固定阶，普通型=0）或按长度取阶（变长炸弹族）。高阶压低阶（跨族）。
  tier: number | { byLength: Record<number, number> };
  // 同族同阶比较规则令牌（缺省 byRank）：byRank=比 rank；byLenThenRank=先比长度再比 rank。
  compare?: 'byRank' | 'byLenThenRank';
}

export interface HandPatternConfig {
  families: readonly HandFamily[];
  levelRank?: number; // 级牌点数（重映射到比 A 大、比小王小）；缺省=无级牌
  jokerRanks?: readonly number[]; // 王 rank，弱→强升序（如 [15,16]=小王,大王）；缺省=无王
  wild?: { suit: number; rank: number }; // 逢人配牌（红桃级牌）；缺省=无逢人配
}

// 判型结果（供 beats / legalResponses 比较）。
export interface PatternMatch {
  family: string;
  kind: FamilyKind;
  tier: number; // 压制阶（跨族用）
  rank: number; // 同阶比较键（普通牌用 eff/自然 rank；顺族用自然顶 rank）
  length: number; // 张数
  compare: 'byRank' | 'byLenThenRank';
  wildsUsed: number; // 本解用掉几张逢人配（排序偏好：应对尽量少用逢人配）
  cards: Card[]; // 实际选中的牌（分类=全手牌；应对=子集）
}

// ── 级牌重映射：eff rank（比较用）。大王 > 小王 > 级牌 > A > K …。全整数。────────
const LEVEL_EFF = 15; // 级牌：A(14) 之上、小王之下
const JOKER_EFF_BASE = 16; // 王：小王=16、大王=17（按 jokerRanks 序）

/** 牌 rank → 比较用 eff rank（级牌抬到 A 之上小王之下；王最高）。纯函数。 */
export function effRank(rank: number, cfg: HandPatternConfig): number {
  const ji = cfg.jokerRanks ? cfg.jokerRanks.indexOf(rank) : -1;
  if (ji >= 0) return JOKER_EFF_BASE + ji;
  if (cfg.levelRank != null && rank === cfg.levelRank) return LEVEL_EFF;
  return rank; // 2..14（A=14）
}

/** family.tier（数值或按长度）→ 具体阶。缺表长度取 0（配置缺口可见，不静默为高阶）。 */
export function resolveTier(fam: HandFamily, length: number): number {
  return typeof fam.tier === 'number' ? fam.tier : (fam.tier.byLength[length] ?? 0);
}

// family 是否属炸弹族（能产出 tier>0）→ legalResponses 剪枝用。
function familyIsBomb(fam: HandFamily): boolean {
  if (typeof fam.tier === 'number') return fam.tier > 0;
  return Object.values(fam.tier.byLength).some((t) => t > 0);
}

// ── 手牌拆分：naturals（按 rank）/ wilds（逢人配）/ jokers（王）───────────────────
interface CardSplit {
  natCards: Map<number, Card[]>; // rank → 自然牌（不含王/逢人配）
  natRanks: Map<number, number>; // rank → 自然牌张数
  natSuits: Set<number>; // 自然牌出现的花色（同花判定）
  wildCards: Card[]; // 逢人配牌
  jokerCounts: Map<number, number>; // 王 rank → 张数
  jokerCards: Map<number, Card[]>;
  wild: number; // = wildCards.length
  total: number;
}

function splitCards(cards: readonly Card[], cfg: HandPatternConfig): CardSplit {
  const natCards = new Map<number, Card[]>();
  const natRanks = new Map<number, number>();
  const natSuits = new Set<number>();
  const wildCards: Card[] = [];
  const jokerCounts = new Map<number, number>();
  const jokerCards = new Map<number, Card[]>();
  const jset = new Set(cfg.jokerRanks ?? []);
  const push = (m: Map<number, Card[]>, k: number, c: Card): void => {
    let a = m.get(k);
    if (!a) { a = []; m.set(k, a); }
    a.push(c);
  };
  for (const c of cards) {
    if (cfg.wild && c.suit === cfg.wild.suit && c.rank === cfg.wild.rank) { wildCards.push(c); continue; }
    if (jset.has(c.rank)) { push(jokerCards, c.rank, c); jokerCounts.set(c.rank, (jokerCounts.get(c.rank) ?? 0) + 1); continue; }
    push(natCards, c.rank, c);
    natRanks.set(c.rank, (natRanks.get(c.rank) ?? 0) + 1);
    natSuits.add(c.suit);
  }
  return { natCards, natRanks, natSuits, wildCards, jokerCounts, jokerCards, wild: wildCards.length, total: cards.length };
}

const sum = (a: readonly number[]): number => a.reduce((x, y) => x + y, 0);

// ═══════════════════════════════════════════════════════════════
//  ① matchPattern —— 判型（返回最强合法解释）
// ═══════════════════════════════════════════════════════════════

/** 判型：给定一手牌，返回其最强合法牌族解释（按 tier→rank 取最优；同优取 families 声明序首个），无合法解释=null。 */
export function matchPattern(cards: readonly Card[], cfg: HandPatternConfig): PatternMatch | null {
  if (cards.length === 0) return null;
  const split = splitCards(cards, cfg);
  const whole = [...cards];
  let best: PatternMatch | null = null;
  for (const fam of cfg.families) {
    const rl = matchFamilyExact(split, fam, cfg);
    if (!rl) continue;
    const m: PatternMatch = { family: fam.name, kind: fam.kind, tier: resolveTier(fam, split.total), rank: rl.rank, length: split.total, compare: fam.compare ?? 'byRank', wildsUsed: split.wild, cards: whole };
    if (!best || m.tier > best.tier || (m.tier === best.tier && m.rank > best.rank)) best = m;
  }
  return best;
}

// 判型分派：整副手牌是否恰构成某族（wild 参与填充）；返回 {rank}（自然/eff 视族而定）或 null。
function matchFamilyExact(split: CardSplit, fam: HandFamily, cfg: HandPatternConfig): { rank: number } | null {
  switch (fam.kind) {
    case 'ntuple': return matchNtuple(split, fam, cfg);
    case 'sequence':
    case 'tuple-sequence':
    case 'flush-sequence': return matchRun(split, fam, cfg);
    case 'fixed-set': return matchFixedSet(split, fam);
  }
}

function matchNtuple(split: CardSplit, fam: HandFamily, cfg: HandPatternConfig): { rank: number } | null {
  const isSingle = !!fam.composition && fam.composition.length === 1 && fam.composition[0] === 1;
  // 单张：唯一允许含王的 ntuple（大王 > 小王 > 级牌 > A > …）。
  if (isSingle) {
    if (split.total !== 1) return null;
    if (split.jokerCounts.size) return { rank: effRank([...split.jokerCounts.keys()][0], cfg) };
    if (split.wild) return { rank: cfg.levelRank != null ? effRank(cfg.levelRank, cfg) : 14 }; // 红桃级牌单出=级牌
    return { rank: effRank([...split.natRanks.keys()][0], cfg) };
  }
  // 其余 ntuple 一律不含王（王只做单张或天王炸）。
  if (split.jokerCounts.size) return null;
  if (fam.composition) {
    if (split.total !== sum(fam.composition)) return null;
    const rank = classifyComposition(split.natRanks, fam.composition, cfg);
    return rank == null ? null : { rank };
  }
  if (fam.n) {
    const L = split.total;
    if (L < fam.n.min || L > fam.n.max) return null;
    const distinct = [...split.natRanks.keys()];
    if (distinct.length > 1) return null; // 炸弹=单一 rank
    if (distinct.length === 1) return { rank: effRank(distinct[0], cfg) };
    return { rank: cfg.levelRank != null ? effRank(cfg.levelRank, cfg) : 14 }; // 全逢人配炸弹（边角）
  }
  return null;
}

// composition 判型：把（降序）组结构一一分配到 distinct 自然 rank（size≥count），余组纯逢人配填。
// wild 用量由 total===Σcomp 前置保证=Σ亏空，无需另核。取 comp[0]（比较组）rank 最大化（三带二比三张 rank）。
function classifyComposition(natRanks: Map<number, number>, comp: readonly number[], cfg: HandPatternConfig): number | null {
  const groups = [...comp].sort((a, b) => b - a);
  const g0 = groups[0];
  const rest = groups.slice(1);
  const nats = [...natRanks.entries()];
  if (nats.length > groups.length) return null; // rank 数超过组数 → 不可行
  type Cand = { eff: number; rank: number | null }; // rank=null → comp[0] 纯逢人配
  const cands: Cand[] = [];
  for (const [r, c] of nats) if (c <= g0) cands.push({ eff: effRank(r, cfg), rank: r });
  cands.push({ eff: cfg.levelRank != null ? effRank(cfg.levelRank, cfg) : 14, rank: null });
  cands.sort((a, b) => b.eff - a.eff); // eff 降序 → 首个可行=最强比较组
  for (const cand of cands) {
    const remCounts = (cand.rank === null ? nats : nats.filter(([r]) => r !== cand.rank)).map(([, c]) => c);
    if (remCounts.length > rest.length) continue;
    if (canPlace(remCounts, rest)) return cand.eff;
  }
  return null;
}

// 可行性：每个自然 rank 的 count 能否放进一个不同的 group（size≥count）。组数极小 → 回溯足够。
function canPlace(counts: readonly number[], groups: readonly number[]): boolean {
  if (counts.length === 0) return true;
  const [c, ...rest] = counts;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] >= c) {
      const ng = groups.slice(0, i).concat(groups.slice(i + 1));
      if (canPlace(rest, ng)) return true;
    }
  }
  return false;
}

function matchRun(split: CardSplit, fam: HandFamily, cfg: HandPatternConfig): { rank: number } | null {
  const g = fam.groupSize ?? 1;
  const k = fam.runLen ?? 0;
  if (k <= 0) return null;
  if (split.jokerCounts.size) return null; // 顺族不含王
  if (split.total !== g * k) return null;
  for (const c of split.natRanks.values()) if (c > g) return null; // 某 rank 自然牌超过一格容量 → 不成段
  if (fam.suited && split.natSuits.size > 1) return null; // 同花顺：自然牌须同一花色（wild 灵活）
  const top = bestRunWindow(split.natRanks, split.wild, k, g);
  return top == null ? null : { rank: top };
}

// 连续段窗口扫描：rank 域 1..14（A=14 亦可当 1 凑低段）。返回可行窗口的最高顶 rank（比较键），或 null。
// per-rank 需 g 张：自然牌（≤g）补足差额=逢人配；全窗差额须恰=wild 张数。自高顶向低顶扫→取最强。
function bestRunWindow(natRanks: Map<number, number>, wild: number, k: number, g: number): number | null {
  for (let s = 15 - k; s >= 1; s--) {
    const positions: number[] = [];
    for (let p = s; p < s + k; p++) positions.push(p);
    const posSet = new Set(positions);
    const posCount = new Map<number, number>();
    let ok = true;
    for (const [r, c] of natRanks) {
      const pos = r === 14 ? (posSet.has(14) ? 14 : posSet.has(1) ? 1 : -1) : r; // A 可高(14)可低(1)
      if (!posSet.has(pos)) { ok = false; break; }
      posCount.set(pos, (posCount.get(pos) ?? 0) + c);
    }
    if (!ok) continue;
    let need = 0;
    let over = false;
    for (const p of positions) {
      const have = posCount.get(p) ?? 0;
      if (have > g) { over = true; break; }
      need += g - have;
    }
    if (over || need !== wild) continue;
    return s + k - 1; // 顶 rank（自然）；A 低窗 [1..k] 顶=k
  }
  return null;
}

function matchFixedSet(split: CardSplit, fam: HandFamily): { rank: number } | null {
  if (!fam.cards) return null;
  if (split.natRanks.size > 0 || split.wild > 0) return null; // 天王炸=纯字面牌（逢人配代不了王）
  let need = 0;
  for (const { rank, count } of fam.cards) {
    if ((split.jokerCounts.get(rank) ?? 0) !== count) return null;
    need += count;
  }
  if (split.total !== need) return null; // 无多余王
  return { rank: 0 }; // 天王炸唯一 → rank 无意义（同阶相等=不可压）
}

// ═══════════════════════════════════════════════════════════════
//  ② beats —— 成对压制比较
// ═══════════════════════════════════════════════════════════════

/** 同阶同族比较：a 相对 b 的强弱符号（>0=a 强）。byRank=比 rank；byLenThenRank=先长度后 rank。 */
export function compareMatches(a: PatternMatch, b: PatternMatch): number {
  if (a.compare === 'byLenThenRank') {
    if (a.length !== b.length) return a.length - b.length;
    return a.rank - b.rank;
  }
  return a.rank - b.rank;
}

// 两个已判型的手牌：a 能否压 b。跨阶=高阶压低阶；同阶=普通型须同族同长再比 rank，炸弹阶直接比。
function beatsMatch(a: PatternMatch, b: PatternMatch): boolean {
  if (a.tier !== b.tier) return a.tier > b.tier;
  if (a.tier === 0 && (a.family !== b.family || a.length !== b.length)) return false; // 普通型跨族/跨长不可比
  return compareMatches(a, b) > 0;
}

/** 成对压制：a 这手能否压过 b 这手（任一非法牌型 → 不能压）。 */
export function beats(a: readonly Card[], b: readonly Card[], cfg: HandPatternConfig): boolean {
  const ma = matchPattern(a, cfg);
  const mb = matchPattern(b, cfg);
  if (!ma || !mb) return false;
  return beatsMatch(ma, mb);
}

// ═══════════════════════════════════════════════════════════════
//  ③ legalResponses —— 合法应对枚举
// ═══════════════════════════════════════════════════════════════

/**
 * 合法应对枚举：从 hand 里枚举所有能压 target 的合法出牌（target=null → 自由领出全部合法牌型）。
 * 确定性排序（tier→rank→length→用逢人配数→牌签名 升序）；**首个=最小合法压牌**（提示按钮 / AI 候选共用）。
 * 自洽保证（REQ-HANDPAT）：每条候选按 matchPattern 规范判读入集，故 legalResponses ⊆ 合法集——
 * ∀ p ∈ legalResponses(hand,target) ⇒ beats(p.cards,target)（有 target）/ matchPattern(p.cards)≠null（领出），act 必接受。
 */
export function legalResponses(hand: readonly Card[], target: readonly Card[] | null, cfg: HandPatternConfig): PatternMatch[] {
  const mt = target ? matchPattern(target, cfg) : null;
  if (target && !mt) return []; // 目标非法 → 无从压
  const split = splitCards(hand, cfg);
  const plays: PatternMatch[] = [];
  for (const fam of cfg.families) {
    if (mt) {
      // 剪枝：目标普通型 → 同族 + 全炸弹族；目标炸弹 → 仅炸弹族。
      if (mt.tier === 0) { if (fam.name !== mt.family && !familyIsBomb(fam)) continue; }
      else if (!familyIsBomb(fam)) continue;
    }
    for (const play of generatePlays(split, fam, cfg)) {
      if (!mt || beatsMatch(play, mt)) plays.push(play);
    }
  }
  // 规范口径自洽复核（REQ-HANDPAT·A-008）：生成 + 去重排序**保持不变**，最后一步按 matchPattern 的
  //【最强判读】剔除 act 会拒的候选——act/beats/legalCheck 都按最强判读收牌；含逢人配的候选可多族判读，
  // 家族口径声称能压、规范口径却落到别的家族时 act 拒收。领出须成型；应对须规范判读真能压 target
  //（谓词 ≡ beats(p.cards,target,cfg)）。刻意置于 sortResponses 之后：不动 raw/去重池，只做末端剔除，
  // 与消费方（game-a AI 的 `raw.filter(beats)`）**幂等**——存活集逐字段一致，保 legalResponses ⊆ 合法集。
  return sortResponses(plays).filter((p) => {
    const canon = matchPattern(p.cards, cfg);
    if (!canon) return false; // 领出/应对均要求规范判读成型
    return mt ? beatsMatch(canon, mt) : true; // 应对：规范判读须真能压 target
  });
}

// 去重（同 family|tier|rank|length 取代表：少用逢人配、牌签名小）+ 确定性排序。
function cardSig(cards: readonly Card[]): string {
  return cards.map((c) => `${c.suit}:${c.rank}`).sort().join(',');
}
function sortResponses(plays: PatternMatch[]): PatternMatch[] {
  const best = new Map<string, PatternMatch>();
  for (const p of plays) {
    const key = `${p.family}|${p.tier}|${p.rank}|${p.length}`;
    const cur = best.get(key);
    if (!cur || p.wildsUsed < cur.wildsUsed || (p.wildsUsed === cur.wildsUsed && cardSig(p.cards) < cardSig(cur.cards))) best.set(key, p);
  }
  return [...best.values()].sort((a, b) =>
    a.tier - b.tier || a.rank - b.rank || a.length - b.length || a.wildsUsed - b.wildsUsed || cardSig(a.cards).localeCompare(cardSig(b.cards)),
  );
}

// 从手牌选具体牌拼一个 play：逐槽先取自然牌（min(有, 需)）再抽逢人配填差额（顺序抽·不复用）。差额超逢人配→null。
function assemblePlay(slots: readonly { avail: readonly Card[]; need: number }[], wildPool: readonly Card[]): { cards: Card[]; wildsUsed: number } | null {
  const cards: Card[] = [];
  let wi = 0;
  for (const { avail, need } of slots) {
    const useNat = Math.min(avail.length, need);
    for (let i = 0; i < useNat; i++) cards.push(avail[i]);
    for (let d = need - useNat; d > 0; d--) {
      if (wi >= wildPool.length) return null;
      cards.push(wildPool[wi++]);
    }
  }
  return { cards, wildsUsed: wi };
}

function mkPlay(fam: HandFamily, rank: number, length: number, cards: Card[], wildsUsed: number): PatternMatch {
  return { family: fam.name, kind: fam.kind, tier: resolveTier(fam, length), rank, length, compare: fam.compare ?? 'byRank', wildsUsed, cards };
}

// 枚举某牌族从手牌能出的全部合法牌（含 wild 代入）。
function generatePlays(split: CardSplit, fam: HandFamily, cfg: HandPatternConfig): PatternMatch[] {
  switch (fam.kind) {
    case 'ntuple': return genNtuple(split, fam, cfg);
    case 'sequence':
    case 'tuple-sequence':
    case 'flush-sequence': return genRun(split, fam, cfg);
    case 'fixed-set': return genFixedSet(split, fam);
  }
}

function genNtuple(split: CardSplit, fam: HandFamily, cfg: HandPatternConfig): PatternMatch[] {
  const out: PatternMatch[] = [];
  const natRankList = [...split.natCards.keys()];
  const isSingle = !!fam.composition && fam.composition.length === 1 && fam.composition[0] === 1;
  if (isSingle) {
    // 单张：每张自然牌 + 每种王 + 逢人配当级牌。
    for (const r of natRankList) out.push(mkPlay(fam, effRank(r, cfg), 1, [split.natCards.get(r)![0]], 0));
    for (const [jr, jc] of split.jokerCards) out.push(mkPlay(fam, effRank(jr, cfg), 1, [jc[0]], 0));
    if (split.wild) out.push(mkPlay(fam, cfg.levelRank != null ? effRank(cfg.levelRank, cfg) : 14, 1, [split.wildCards[0]], 1));
    return out;
  }
  if (fam.composition) {
    const comp = [...fam.composition].sort((a, b) => b - a);
    if (comp.length === 1) {
      const s = comp[0];
      for (const r of natRankList) {
        const p = assemblePlay([{ avail: split.natCards.get(r)!, need: s }], split.wildCards);
        if (p) out.push(mkPlay(fam, effRank(r, cfg), s, p.cards, p.wildsUsed));
      }
      if (cfg.levelRank != null) { // 纯逢人配组（如两逢人配当级牌对）
        const p = assemblePlay([{ avail: [], need: s }], split.wildCards);
        if (p) out.push(mkPlay(fam, effRank(cfg.levelRank, cfg), s, p.cards, p.wildsUsed));
      }
      return out;
    }
    if (comp.length === 2) {
      const [c0, c1] = comp; // c0≥c1；比较组=c0（如三带二比三张 rank）
      const cand: (number | null)[] = [...natRankList, null]; // null=纯逢人配组
      for (const r0 of cand) {
        for (const r1 of cand) {
          if (r0 === r1) continue; // distinct rank（含双 null 也排除→避免全逢人配歧义）
          const av0 = r0 === null ? [] : split.natCards.get(r0)!;
          const av1 = r1 === null ? [] : split.natCards.get(r1)!;
          const p = assemblePlay([{ avail: av0, need: c0 }, { avail: av1, need: c1 }], split.wildCards);
          if (p) out.push(mkPlay(fam, r0 === null ? (cfg.levelRank != null ? effRank(cfg.levelRank, cfg) : 14) : effRank(r0, cfg), c0 + c1, p.cards, p.wildsUsed));
        }
      }
      return out;
    }
    return out; // v1 composition 仅 1/2 组（掼蛋全覆盖；更长走 capgap）
  }
  if (fam.n) {
    for (const r of natRankList) {
      for (let L = fam.n.min; L <= fam.n.max; L++) {
        const p = assemblePlay([{ avail: split.natCards.get(r)!, need: L }], split.wildCards);
        if (p) out.push(mkPlay(fam, effRank(r, cfg), L, p.cards, p.wildsUsed));
      }
    }
    return out;
  }
  return out;
}

function genRun(split: CardSplit, fam: HandFamily, cfg: HandPatternConfig): PatternMatch[] {
  const g = fam.groupSize ?? 1;
  const k = fam.runLen ?? 0;
  if (k <= 0) return [];
  const out: PatternMatch[] = [];
  const suitOpts: (number | undefined)[] = fam.suited ? (split.natSuits.size ? [...split.natSuits] : [0]) : [undefined];
  const at = (p: number, suit: number | undefined): Card[] => {
    const rank = p === 1 ? 14 : p; // A 低位用 rank-14 牌
    const list = split.natCards.get(rank) ?? [];
    return suit === undefined ? list : list.filter((c) => c.suit === suit);
  };
  for (let s = 15 - k; s >= 1; s--) {
    for (const suit of suitOpts) {
      const slots: { avail: readonly Card[]; need: number }[] = [];
      for (let p = s; p < s + k; p++) slots.push({ avail: at(p, suit), need: g });
      const play = assemblePlay(slots, split.wildCards);
      if (play) out.push(mkPlay(fam, s + k - 1, g * k, play.cards, play.wildsUsed));
    }
  }
  return out;
}

function genFixedSet(split: CardSplit, fam: HandFamily): PatternMatch[] {
  if (!fam.cards) return [];
  const cards: Card[] = [];
  let need = 0;
  for (const { rank, count } of fam.cards) {
    const have = split.jokerCards.get(rank) ?? [];
    if (have.length < count) return [];
    for (let i = 0; i < count; i++) cards.push(have[i]);
    need += count;
  }
  return [mkPlay(fam, 0, need, cards, 0)];
}

// ── 能力注册（纯函数库·无 ECS 组件/系统·编译期 TS 游戏直接 import 三接口消费）──
export const handPatternCapability = defineCapability({
  id: 't3-hand-pattern',
  version: '1.0.0',

  describe: {
    name: 'hand-pattern',
    summary:
      '通用「变长牌族」判型 + 跨型压制序 + 逢人配的确定性解释器：牌族 DSL 闭集（ntuple/sequence/tuple-sequence/flush-sequence/fixed-set）+ 压制数值阶表 + 级牌重映射，config 全数据。三纯函数接口 matchPattern（判型）/beats（成对压制）/legalResponses（合法应对枚举·首个=最小合法压牌）。掼蛋/斗地主/跑得快等出牌类通用底座（poker-hand 计分域之外的判定域）。',
    semantic: ['tier3', 'mechanic', 'cards', 'pattern', 'algorithm', 'determinism'],
    whenToUse:
      '任何「变长牌族 + 跨型压制 + 应对枚举」的出牌类卡牌游戏（掼蛋/斗地主/跑得快…）。牌族表/压制阶/级牌逢人配全摆成 config 数据；编译期 TS 游戏直接 import matchPattern/beats/legalResponses 消费（提示按钮取 legalResponses 首解=最小合法压牌，AI 候选取全表）。与 t3-poker-hand 分工：poker-hand=Balatro 计分域（评一手出 chips/mult），本能力=判定/压制/应对域。',
    examples: [
      '掼蛋 config（fixture·能力本身游戏无关）：families=[{name:"single",kind:"ntuple",composition:[1],tier:0},{name:"pair",kind:"ntuple",composition:[2],tier:0},{name:"bomb",kind:"ntuple",n:{min:4,max:10},tier:{byLength:{4:1,5:2,6:4,7:5,8:6,9:7,10:8}},compare:"byLenThenRank"},{name:"straight-flush",kind:"flush-sequence",runLen:5,suited:true,tier:3},{name:"sky-bomb",kind:"fixed-set",cards:[{rank:15,count:2},{rank:16,count:2}],tier:9}], levelRank:2, jokerRanks:[15,16], wild:{suit:1,rank:2}',
      'matchPattern([{suit:1,rank:5},{suit:2,rank:5}], cfg) → {family:"pair", tier:0, rank:5, length:2}',
      'beats(级牌对, A对, cfg) → true（级牌 eff 15 > A 14）；beats(4张炸, 顺子, cfg) → true（炸弹阶 > 普通型）',
      'legalResponses(手牌, 目标对子, cfg) → [最小能压的对子, …更大对子, …各炸弹]（升序·首个=提示按钮显示的最小合法压牌）',
      '逢人配：一对 + 红桃级牌(wild) → matchPattern 枚举 wild 代入成三同张（借鉴 poker-hand wild 有界枚举·并列取枚举序首解）',
    ],
  },

  components: { provides: {}, reads: [], writes: [], consumes: [] },
  config: {},
  systems: [],
});
