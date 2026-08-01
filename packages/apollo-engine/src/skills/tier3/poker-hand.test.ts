import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Card, PlayedHand, PokerHand, Resource, StringVar, Signal, Effect, Flag } from '@engine/protocol/components.js';
import { pokerHandCapability, evaluateHand, isStraightRanks } from './poker-hand.js';
import { effectApplyCapability } from '../tier2/effect-apply.js';

// 牌速记：c(suit, rank)。点数 A=14, K=13, Q=12, J=11；花色 0..3。
const c = (suit: number, rank: number): Card => ({ suit, rank });
const A = 14, K = 13, Q = 12, J = 11;

// ── 纯算法 helper：isStraightRanks ───────────────────────────────
describe('poker helpers — isStraightRanks', () => {
  it('普通连续 5,6,7,8,9 → 顺', () => expect(isStraightRanks([5, 6, 7, 8, 9])).toBe(true));
  it('A 高 Broadway 10,J,Q,K,A → 顺', () => expect(isStraightRanks([10, J, Q, K, A])).toBe(true));
  it('A 低轮子 A,2,3,4,5 → 顺', () => expect(isStraightRanks([A, 2, 3, 4, 5])).toBe(true));
  it('乱序仍判（内部排序）', () => expect(isStraightRanks([8, 5, 7, 9, 6])).toBe(true));
  it('不连续 2,3,4,5,7 → 非顺', () => expect(isStraightRanks([2, 3, 4, 5, 7])).toBe(false));
  it('Q,K,A,2,3 不绕回 → 非顺', () => expect(isStraightRanks([Q, K, A, 2, 3])).toBe(false));
  it('非 5 张 → 非顺', () => expect(isStraightRanks([5, 6, 7, 8])).toBe(false));
  // REQ-E-023⑤ 参数：need / maxStep
  it('need=4：4 连即顺（four_fingers）', () => expect(isStraightRanks([5, 6, 7, 8], 4)).toBe(true));
  it('maxStep=2：隔 1 成顺 3-5-7-9-J（shortcut）', () => expect(isStraightRanks([3, 5, 7, 9, J], 5, 2)).toBe(true));
  it('maxStep=1：同样隔 1 牌 → 非顺', () => expect(isStraightRanks([3, 5, 7, 9, J], 5, 1)).toBe(false));
});

describe('poker helpers — evaluateHand 判型规则修饰 HandMods（REQ-E-023⑤）', () => {
  it('fourFlush：4 张同花 + 1 张异色 → 同花（缺省非同花）', () => {
    const hand = [c(0, 2), c(0, 5), c(0, 7), c(0, 9), c(1, K)]; // 4♠ + 1♥
    expect(evaluateHand(hand).isFlush).toBe(false);
    expect(evaluateHand(hand, { fourFlush: true }).isFlush).toBe(true);
  });
  it('fourStraight：4 连 + 1 张离群 → 顺（缺省非顺）', () => {
    const hand = [c(0, 5), c(1, 6), c(2, 7), c(3, 8), c(0, K)]; // 5-6-7-8 + K
    expect(evaluateHand(hand).isStraight).toBe(false);
    expect(evaluateHand(hand, { fourStraight: true }).isStraight).toBe(true);
  });
  it('gappedStraight：3-5-7-9-J 隔 1 → 顺（缺省非顺）', () => {
    const hand = [c(0, 3), c(1, 5), c(2, 7), c(3, 9), c(0, J)];
    expect(evaluateHand(hand).isStraight).toBe(false);
    expect(evaluateHand(hand, { gappedStraight: true }).isStraight).toBe(true);
  });
  it('suitMerge：3♥ + 2♦ = 5 红 → 同花（缺省非同花）', () => {
    const hand = [c(1, 2), c(1, 5), c(1, 7), c(2, 9), c(2, K)]; // ♥♥♥♦♦
    expect(evaluateHand(hand).isFlush).toBe(false);
    expect(evaluateHand(hand, { suitMerge: true }).isFlush).toBe(true);
  });
});

// ── 纯算法 helper：evaluateHand 全牌型 + 边界 ─────────────────────
describe('poker evaluateHand — 全牌型判定', () => {
  it('高牌（无对/无顺/无同花）', () => {
    expect(evaluateHand([c(0, 2), c(1, 5), c(2, 7), c(3, 9), c(0, K)]).type).toBe('high-card');
  });
  it('对子（5 张含一对）', () => {
    expect(evaluateHand([c(0, 5), c(1, 5), c(2, 2), c(3, 7), c(0, 9)]).type).toBe('pair');
  });
  it('两对', () => {
    expect(evaluateHand([c(0, 5), c(1, 5), c(2, 9), c(3, 9), c(0, 2)]).type).toBe('two-pair');
  });
  it('三条', () => {
    expect(evaluateHand([c(0, 6), c(1, 6), c(2, 6), c(3, 2), c(0, 9)]).type).toBe('three-of-a-kind');
  });
  it('顺子（中段，混花色）', () => {
    expect(evaluateHand([c(0, 5), c(1, 6), c(2, 7), c(3, 8), c(0, 9)]).type).toBe('straight');
  });
  it('顺子（A 高 Broadway）', () => {
    expect(evaluateHand([c(0, 10), c(1, J), c(2, Q), c(3, K), c(0, A)]).type).toBe('straight');
  });
  it('顺子（A 低轮子 A-2-3-4-5）', () => {
    expect(evaluateHand([c(0, A), c(1, 2), c(2, 3), c(3, 4), c(0, 5)]).type).toBe('straight');
  });
  it('同花（5 张同花色，非顺）', () => {
    expect(evaluateHand([c(1, 2), c(1, 5), c(1, 7), c(1, 9), c(1, K)]).type).toBe('flush');
  });
  it('葫芦（3+2）', () => {
    expect(evaluateHand([c(0, 7), c(1, 7), c(2, 7), c(3, 4), c(0, 4)]).type).toBe('full-house');
  });
  it('四条', () => {
    expect(evaluateHand([c(0, 9), c(1, 9), c(2, 9), c(3, 9), c(0, 2)]).type).toBe('four-of-a-kind');
  });
  it('同花顺（顺 + 同花，优先于同花/顺）', () => {
    const e = evaluateHand([c(0, 6), c(0, 7), c(0, 8), c(0, 9), c(0, 10)]);
    expect(e.type).toBe('straight-flush');
    expect(e.isFlush).toBe(true);
    expect(e.isStraight).toBe(true);
  });
  it('同花顺（A 低轮子也算）', () => {
    expect(evaluateHand([c(2, A), c(2, 2), c(2, 3), c(2, 4), c(2, 5)]).type).toBe('straight-flush');
  });
  it('五条（5 张同点，混花色）', () => {
    expect(evaluateHand([c(0, 8), c(1, 8), c(2, 8), c(3, 8), c(0, 8)]).type).toBe('five-of-a-kind');
  });
  it('同花葫芦（3+2 且全同花色）', () => {
    expect(evaluateHand([c(2, 7), c(2, 7), c(2, 7), c(2, 4), c(2, 4)]).type).toBe('flush-house');
  });
  it('同花五（5 张同点同花色）', () => {
    expect(evaluateHand([c(3, 8), c(3, 8), c(3, 8), c(3, 8), c(3, 8)]).type).toBe('flush-five');
  });
});

describe('poker evaluateHand — 边界 / 并列取高', () => {
  it('并列取高：葫芦不被判成对子/三条', () => {
    expect(evaluateHand([c(0, 7), c(1, 7), c(2, 7), c(3, 4), c(0, 4)]).type).toBe('full-house');
  });
  it('并列取高：同花顺不被判成同花或顺', () => {
    expect(evaluateHand([c(0, 6), c(0, 7), c(0, 8), c(0, 9), c(0, 10)]).type).toBe('straight-flush');
  });
  it('少于 5 张：2 张同点 → 对子', () => {
    expect(evaluateHand([c(0, 5), c(1, 5)]).type).toBe('pair');
  });
  it('少于 5 张：1 张 → 高牌', () => {
    expect(evaluateHand([c(0, A)]).type).toBe('high-card');
  });
  it('少于 5 张：4 张同点 → 四条（不需满 5 张）', () => {
    expect(evaluateHand([c(0, 9), c(1, 9), c(2, 9), c(3, 9)]).type).toBe('four-of-a-kind');
  });
  it('需"全"同花：4 张同花 + 1 张异花 → 非同花（高牌）', () => {
    expect(evaluateHand([c(0, 2), c(0, 5), c(0, 7), c(0, 9), c(1, K)]).type).toBe('high-card');
  });
  it('同花需 ≥5 张：4 张同花色 → 非同花', () => {
    expect(evaluateHand([c(0, 2), c(0, 5), c(0, 7), c(0, 9)]).isFlush).toBe(false);
  });
  it('Q-K-A-2-3 不绕回 → 非顺（高牌）', () => {
    expect(evaluateHand([c(0, Q), c(1, K), c(2, A), c(3, 2), c(0, 3)]).type).toBe('high-card');
  });
});

describe('poker evaluateHand — 迭代接口（按点数 / 按花色计数）', () => {
  it('rankCounts 按点数计数', () => {
    const e = evaluateHand([c(0, 7), c(1, 7), c(2, 7), c(3, 4), c(0, 4)]);
    expect(e.rankCounts.get(7)).toBe(3);
    expect(e.rankCounts.get(4)).toBe(2);
  });
  it('suitCounts 按花色计数（供"每张红桃 +chips"类小丑）', () => {
    const e = evaluateHand([c(1, 2), c(1, 5), c(0, 7), c(0, 9), c(2, K)]);
    expect(e.suitCounts.get(1)).toBe(2); // 两张花色1
    expect(e.suitCounts.get(0)).toBe(2);
    expect(e.suitCounts.get(2)).toBe(1);
  });
});

// ── 系统 poker-eval：读 PlayedHand → set 基础 chips/mult + 牌型名 ──
function loadPoker(
  cards: Card[],
  table: Record<string, { chips: number; mult: number }>,
  opts: { handTypeVar?: string; max?: number } = {},
): World {
  const w = new World();
  for (const s of pokerHandCapability.systems) w.addSystem(s);
  w.createEntity('table');
  w.addComponent('table', {
    type: 'PokerHand', rankingTable: table, chipsResource: 'chips', multResource: 'mult', handTypeVar: opts.handTypeVar,
  } as PokerHand);
  w.addComponent('table', { type: 'PlayedHand', cards } as PlayedHand);
  const max = opts.max ?? 99999;
  for (const id of ['chips', 'mult']) {
    w.createEntity(`res:${id}`);
    w.addComponent(`res:${id}`, { type: 'Resource', id, current: 0, min: 0, max } as Resource);
  }
  if (opts.handTypeVar) {
    w.createEntity('sv');
    w.addComponent('sv', { type: 'StringVar', id: opts.handTypeVar, value: '' } as StringVar);
  }
  return w;
}
const res = (w: World, id: string): number => w.getComponent<Resource>(`res:${id}`, 'Resource')!.current;

describe('poker-eval system — 写基础 chips/mult', () => {
  const TABLE = {
    'pair': { chips: 10, mult: 2 },
    'flush': { chips: 35, mult: 4 },
    'straight-flush': { chips: 100, mult: 8 },
  };

  it('出对子 → set chips=10, mult=2（来自 rankingTable）', () => {
    const w = loadPoker([c(0, 5), c(1, 5), c(2, 2), c(3, 7), c(0, 9)], TABLE);
    w.tick();
    expect(res(w, 'chips')).toBe(10);
    expect(res(w, 'mult')).toBe(2);
  });

  it('出同花顺 → set chips=100, mult=8（优先牌型）', () => {
    const w = loadPoker([c(0, 6), c(0, 7), c(0, 8), c(0, 9), c(0, 10)], TABLE);
    w.tick();
    expect(res(w, 'chips')).toBe(100);
    expect(res(w, 'mult')).toBe(8);
  });

  it('handTypeVar → 写牌型名 StringVar（供 condition string 读"打出同花→小丑触发"）', () => {
    const w = loadPoker([c(1, 2), c(1, 5), c(1, 7), c(1, 9), c(1, K)], TABLE, { handTypeVar: 'lastHand' });
    w.tick();
    expect(w.getComponent<StringVar>('sv', 'StringVar')!.value).toBe('flush');
  });

  it('空手牌 → 不评估（chips/mult 不被改写，保持原值）', () => {
    const w = loadPoker([], TABLE);
    w.getComponent<Resource>('res:chips', 'Resource')!.current = 77; // 装配层上一回合留下
    w.tick();
    expect(res(w, 'chips')).toBe(77);
  });

  it('基础分钳上下限（mult 基础超 max → 钳到 max）', () => {
    const w = loadPoker([c(0, 6), c(0, 7), c(0, 8), c(0, 9), c(0, 10)], TABLE, { max: 50 });
    w.tick();
    expect(res(w, 'chips')).toBe(50); // 100 钳到 50
    expect(res(w, 'mult')).toBe(8);
  });

  it('牌型不在表中 → 基础 0/0（配置缺口可见，不静默残留）', () => {
    const w = loadPoker([c(0, 2), c(1, 5), c(2, 7), c(3, 9), c(0, K)], TABLE); // high-card 不在表
    w.getComponent<Resource>('res:mult', 'Resource')!.current = 5;
    w.tick();
    expect(res(w, 'mult')).toBe(0);
  });
});

// ── 派生事实（REQ-011 完善）：包含谓词原语 + 出牌张数 → 修正"含某牌型"判定 ──
function loadFacts(cards: Card[]): World {
  const w = new World();
  for (const s of pokerHandCapability.systems) w.addSystem(s);
  w.createEntity('table');
  w.addComponent('table', {
    type: 'PokerHand', rankingTable: {}, chipsResource: 'chips', multResource: 'mult',
    rankMaxCountResource: 'rmax', pairCountResource: 'pairs', isStraightFlag: 'isStraight', isFlushFlag: 'isFlush', handSizeResource: 'hsize',
  } as PokerHand);
  w.addComponent('table', { type: 'PlayedHand', cards } as PlayedHand);
  for (const id of ['chips', 'mult', 'rmax', 'pairs', 'hsize']) {
    w.createEntity(`res:${id}`);
    w.addComponent(`res:${id}`, { type: 'Resource', id, current: 0, min: 0, max: 99 } as Resource);
  }
  for (const id of ['isStraight', 'isFlush']) {
    w.createEntity(`flag:${id}`);
    w.addComponent(`flag:${id}`, { type: 'Flag', id, active: false } as Flag);
  }
  return w;
}
const fres = (w: World, id: string): number => w.getComponent<Resource>(`res:${id}`, 'Resource')!.current;
const fflag = (w: World, id: string): boolean => w.getComponent<Flag>(`flag:${id}`, 'Flag')!.active;

describe('poker-eval 派生事实 — 包含谓词原语 + 张数（REQ-011 完善）', () => {
  it('对子：rankMaxCount=2, pairCount=1', () => {
    const w = loadFacts([c(0, 5), c(1, 5), c(2, 2), c(3, 7), c(0, 9)]);
    w.tick();
    expect(fres(w, 'rmax')).toBe(2);
    expect(fres(w, 'pairs')).toBe(1);
  });
  it('两对：rankMaxCount=2, pairCount=2', () => {
    const w = loadFacts([c(0, 5), c(1, 5), c(2, 9), c(3, 9), c(0, 2)]);
    w.tick();
    expect(fres(w, 'rmax')).toBe(2);
    expect(fres(w, 'pairs')).toBe(2);
  });
  it('三条：rankMaxCount=3', () => {
    const w = loadFacts([c(0, 6), c(1, 6), c(2, 6), c(3, 2), c(0, 9)]);
    w.tick();
    expect(fres(w, 'rmax')).toBe(3);
  });
  it('★bug 修正：葫芦 含对子（rankMaxCount≥2）且 含两对（pairCount=2，Balatro 语义）—— 只看最高型 StringVar 会漏', () => {
    const w = loadFacts([c(0, 7), c(1, 7), c(2, 7), c(3, 4), c(0, 4)]);
    w.tick();
    expect(fres(w, 'rmax')).toBe(3); // ≥2 → "含对子" 条件 rankMaxCount gte 2 命中（Jolly 打葫芦也触发）
    expect(fres(w, 'pairs')).toBe(2); // 葫芦含两对（trip 含一对 + 自带一对）
  });
  it('四条：rankMaxCount=4, pairCount=1（不含两对）', () => {
    const w = loadFacts([c(0, 9), c(1, 9), c(2, 9), c(3, 9), c(0, 2)]);
    w.tick();
    expect(fres(w, 'rmax')).toBe(4);
    expect(fres(w, 'pairs')).toBe(1);
  });
  it('顺子：isStraight=true, isFlush=false', () => {
    const w = loadFacts([c(0, 5), c(1, 6), c(2, 7), c(3, 8), c(0, 9)]);
    w.tick();
    expect(fflag(w, 'isStraight')).toBe(true);
    expect(fflag(w, 'isFlush')).toBe(false);
  });
  it('同花：isFlush=true, isStraight=false', () => {
    const w = loadFacts([c(1, 2), c(1, 5), c(1, 7), c(1, 9), c(1, K)]);
    w.tick();
    expect(fflag(w, 'isFlush')).toBe(true);
    expect(fflag(w, 'isStraight')).toBe(false);
  });
  it('同花顺：两 flag 皆 true', () => {
    const w = loadFacts([c(0, 6), c(0, 7), c(0, 8), c(0, 9), c(0, 10)]);
    w.tick();
    expect(fflag(w, 'isStraight')).toBe(true);
    expect(fflag(w, 'isFlush')).toBe(true);
  });
  it('handSize：出牌张数（Half Joker「≤3张」靠这个）', () => {
    const w = loadFacts([c(0, 5), c(1, 5), c(2, 9)]);
    w.tick();
    expect(fres(w, 'hsize')).toBe(3);
  });
});

// ── 集成：REQ-011 基础分 + REQ-012 小丑 ×mult → Balatro 计分 ─────
describe('poker-eval + effect-apply 集成（REQ-011 ⊕ REQ-012 = Balatro 计分链）', () => {
  it('poker(Update) set 基础 mult=2 → 小丑(Commit) ×1.5 → mult=3（基础先于修正）', () => {
    const w = new World();
    for (const s of pokerHandCapability.systems) w.addSystem(s);
    for (const s of effectApplyCapability.systems) w.addSystem(s);

    w.createEntity('table');
    w.addComponent('table', {
      type: 'PokerHand', rankingTable: { 'pair': { chips: 10, mult: 2 } },
      chipsResource: 'chips', multResource: 'mult',
    } as PokerHand);
    w.addComponent('table', { type: 'PlayedHand', cards: [c(0, 5), c(1, 5), c(2, 2), c(3, 7), c(0, 9)] } as PlayedHand);
    for (const id of ['chips', 'mult']) {
      w.createEntity(`res:${id}`);
      w.addComponent(`res:${id}`, { type: 'Resource', id, current: 0, min: 0, max: 99999 } as Resource);
    }
    // 小丑：出牌时 ×1.5 Mult（REQ-012 op:'mul'）。
    w.createEntity('joker');
    w.addComponent('joker', { type: 'Effect', onSignal: 'score', kind: 'modify-resource', targetId: 'mult', op: 'mul', value: 1.5, order: 1 } as Effect);
    w.createEntity('sig');
    w.addComponent('sig', { type: 'Signal', name: 'score', source: 'test' } as Signal);

    w.tick();
    expect(res(w, 'chips')).toBe(10); // 基础 chips
    expect(res(w, 'mult')).toBe(3); // 基础 2 ×1.5 小丑
  });
});

// ── scoringCardIndices：计分牌集（BUG-001）—— 只有构成牌型的牌计分，垫牌不算 ──
import { scoringCardIndices } from './poker-hand.js';
describe('poker scoringCardIndices — 计分牌（垫牌 kicker 不计分）', () => {
  it('高牌：只最高单张', () => {
    expect(scoringCardIndices([c(0, 2), c(1, 5), c(2, 7), c(3, 9), c(0, K)])).toEqual([4]); // K 最高
  });
  it('对子：成对两张（垫牌不计）', () => {
    expect(scoringCardIndices([c(0, 5), c(1, 5), c(2, 2), c(3, 7), c(0, 9)])).toEqual([0, 1]);
  });
  it('两对：四张（两组对子）', () => {
    expect(scoringCardIndices([c(0, 5), c(1, 5), c(2, 9), c(3, 9), c(0, 2)])).toEqual([0, 1, 2, 3]);
  });
  it('三条：三张（垫牌不计）', () => {
    expect(scoringCardIndices([c(0, 6), c(1, 6), c(2, 6), c(3, 2), c(0, 9)])).toEqual([0, 1, 2]);
  });
  it('四条：四张（第 5 张垫牌不计）', () => {
    expect(scoringCardIndices([c(0, 9), c(1, 9), c(2, 9), c(3, 9), c(0, 2)])).toEqual([0, 1, 2, 3]);
  });
  it('同花：全 5 张计分', () => {
    expect(scoringCardIndices([c(1, 2), c(1, 5), c(1, 7), c(1, 9), c(1, K)])).toEqual([0, 1, 2, 3, 4]);
  });
  it('顺子：全 5 张计分', () => {
    expect(scoringCardIndices([c(0, 5), c(1, 6), c(2, 7), c(3, 8), c(0, 9)])).toEqual([0, 1, 2, 3, 4]);
  });
  it('葫芦：全 5 张计分（3+2 都属牌型）', () => {
    expect(scoringCardIndices([c(0, 7), c(1, 7), c(2, 7), c(3, 4), c(0, 4)])).toEqual([0, 1, 2, 3, 4]);
  });
  it('空手牌 → 空', () => expect(scoringCardIndices([])).toEqual([]));
});

// ── wild 百搭（REQ-GAMED #2）── wild:true 的牌可当任意 suit+rank，求最优牌型（小规模确定性枚举）──
const wc = (): Card => ({ suit: 0, rank: 2, wild: true }); // wild 牌（suit/rank 占位，判型时被枚举覆盖）
describe('poker evaluateHand — wild 百搭求最优牌型', () => {
  it('无 wild → 逐字节等价旧行为（不枚举）：这手仍是高牌', () => {
    expect(evaluateHand([c(0, 2), c(1, 5), c(2, 7), c(3, 9), c(0, K)]).type).toBe('high-card');
  });
  it('suit-wild 补同花：4♠ + wild → flush', () => {
    expect(evaluateHand([c(0, 2), c(0, 5), c(0, 7), c(0, 9), wc()]).type).toBe('flush');
  });
  it('rank-wild 补顺子：5-6-7-8(混花色) + wild → straight', () => {
    expect(evaluateHand([c(0, 5), c(1, 6), c(2, 7), c(3, 8), wc()]).type).toBe('straight');
  });
  it('rank-wild 补对子：单张 + wild → pair', () => {
    expect(evaluateHand([c(0, 5), wc()]).type).toBe('pair');
  });
  it('rank-wild 补三条：一对 + wild → three-of-a-kind', () => {
    expect(evaluateHand([c(0, 5), c(1, 5), wc()]).type).toBe('three-of-a-kind');
  });
  it('多 wild：一对 + 2 wild → four-of-a-kind', () => {
    expect(evaluateHand([c(0, 5), c(1, 5), wc(), wc()]).type).toBe('four-of-a-kind');
  });
  it('全 wild：5 张 wild → flush-five（同时最大化同点+同花）', () => {
    expect(evaluateHand([wc(), wc(), wc(), wc(), wc()]).type).toBe('flush-five');
  });
  it('全 wild：2 张 wild → pair', () => {
    expect(evaluateHand([wc(), wc()]).type).toBe('pair');
  });
  it('全 wild + four_fingers 双 mod：4 张 wild → straight-flush（2345 同花 > 四条；验收修的角落）', () => {
    expect(evaluateHand([wc(), wc(), wc(), wc()], { fourFlush: true, fourStraight: true }).type).toBe('straight-flush');
  });
  it('全 wild 无 mod：4 张 wild → four-of-a-kind（同花/顺仍需 5 张，四同点最优）', () => {
    expect(evaluateHand([wc(), wc(), wc(), wc()]).type).toBe('four-of-a-kind');
  });
  it('最优联合（suit+rank 同时代入）：♠10-J-Q-K + wild → straight-flush（皇家）', () => {
    const e = evaluateHand([c(0, 10), c(0, J), c(0, Q), c(0, K), wc()]);
    expect(e.type).toBe('straight-flush');
    expect(e.isFlush).toBe(true);
    expect(e.isStraight).toBe(true);
  });
  it('wild + suitMerge 交互：♥♥♥♦ + wild，开 smeared → 5 红 → flush；关则仅 pair', () => {
    const hand = [c(1, 2), c(1, 5), c(1, 7), c(2, 9), wc()]; // ♥♥♥♦ + wild
    expect(evaluateHand(hand, { suitMerge: true }).type).toBe('flush'); // wild 取红 → 5 红同花
    expect(evaluateHand(hand).type).toBe('pair'); // 无合并：最多 4 红 <5 → wild 只能凑对子
  });
  it('返回的 rankCounts/isFlush 反映最优代入（语义一致）', () => {
    const e = evaluateHand([c(0, 2), c(0, 5), c(0, 7), c(0, 9), wc()]); // 补同花
    expect(e.isFlush).toBe(true);
  });
});

// ── 6-suit flush 契约（REQ-GAMED #5）── Card.suit 是无约束 int，flush 按任意 suit 计数（六色元素可直接跑）──
describe('poker evaluateHand — 6-suit flush 契约（suit 为任意 int）', () => {
  it('5 张同 suit=5（六色）→ flush 命中', () => {
    const e = evaluateHand([c(5, 2), c(5, 7), c(5, 9), c(5, J), c(5, K)]);
    expect(e.isFlush).toBe(true);
    expect(e.type).toBe('flush');
  });
  it('六色混（suit 0..4 各一 + 5）→ 非 flush', () => {
    expect(evaluateHand([c(0, 2), c(1, 7), c(2, 9), c(3, J), c(4, K)]).isFlush).toBe(false);
  });
  it('suit=4 四张 + suit=5 一张（不同色）→ 非 flush', () => {
    expect(evaluateHand([c(4, 2), c(4, 7), c(4, 9), c(4, J), c(5, K)]).isFlush).toBe(false);
  });
  // 契约钉死：suitMerge（smeared）红=1,2 / 黑=0,3 硬编码，只对 **4 花色** 有语义；6-suit 下**不得开启**。
  // 证明：suit≥4 会被 suitMerge 归入"黑"组（s===1||s===2→红(0)，其余→黑(1)），与真实 ♠(0)♣(3) 混并 → 误判。
  // 故 6-suit 同花必须走裸 suit 计数（不传 suitMerge）；本用例锁死这一"为何不能用"的现状。
  it('suitMerge 仅 4 花色有效：6-suit 开启会误并（故契约要求 6-suit 禁用 suitMerge）', () => {
    const mixed = [c(5, 2), c(0, 7), c(5, 9), c(3, J), c(5, K)]; // suit: 5,0,5,3,5（三色）
    expect(evaluateHand(mixed, { suitMerge: true }).isFlush).toBe(true); // 5/0/3 全归"黑"组 → 误判同花（勿用！）
    expect(evaluateHand(mixed).isFlush).toBe(false); // 裸计数：仅 3 张 suit=5 → 正确非同花
  });
});
