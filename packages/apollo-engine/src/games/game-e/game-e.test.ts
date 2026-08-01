import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import type { Resource, PlayedHand, Flag, Card, StringVar, PerCardRule, PerCardRetrigger } from '@engine/protocol/components.js';
import {
  buildGameEBlueprint,
  card,
  toEngineCard,
  R_CHIPS,
  R_MULT,
  R_MONEY,
  R_HAND_SCORE,
  R_ROUND_SCORE,
  R_HANDS_LEFT,
  R_BLIND,
  V_HAND_TYPE,
} from './blueprint.js';
import { STANDARD_DECK, shuffledDeck, shuffle } from './deck.js';

// 真引擎整合：证明「数据 + 真能力」涌现出 Balatro 完整一手计分，无游戏 system 代码。
//   poker-eval(REQ-011) 判牌型给基础分 → effect-apply(REQ-012) 按 order 有序加乘小丑
//   → REQ-013 valueFrom：Bull 每$1+2c（量纲动态值）+ hand_score=chips×mult（资源×资源）。

function boot() {
  const e = new Engine({ tickRate: 60 });
  e.load(buildGameEBlueprint());
  return e;
}

/** 装配层「出牌」：填 PlayedHand.cards + 置 scoring=true（模拟点「出牌」）。 */
function play(e: Engine, cards: Card[], scoring = true): void {
  e.world.getComponent<PlayedHand>('table', 'PlayedHand')!.cards = cards;
  e.world.getComponent<Flag>('scoring', 'Flag')!.active = scoring;
}

const res = (e: Engine, id: string): number => {
  for (const [eid] of e.world.query('Resource')) {
    const r = e.world.getComponent<Resource>(eid, 'Resource');
    if (r && r.id === id) return r.current;
  }
  throw new Error(`no resource ${id}`);
};
const setRes = (e: Engine, id: string, v: number): void => {
  for (const [eid] of e.world.query('Resource')) {
    const r = e.world.getComponent<Resource>(eid, 'Resource');
    if (r && r.id === id) { r.current = v; return; }
  }
};
const handType = (e: Engine): string => {
  for (const [eid] of e.world.query('StringVar')) {
    const v = e.world.getComponent<StringVar>(eid, 'StringVar');
    if (v && v.id === V_HAND_TYPE) return v.value;
  }
  return '';
};
const tick = (e: Engine, n: number): void => {
  for (let i = 0; i < n; i++) e.world.tick();
};

describe('game-e · 真引擎完整一手计分（REQ-011/012/013 全链）', () => {
  it('出同花：基础35/4 → 逐张+33c、+50c/Bull+8c、+4mult、×3 → 126×24=3024', () => {
    const e = boot();
    play(e, [card(1, 2), card(1, 5), card(1, 7), card(1, 9), card(1, 11)]);
    tick(e, 5);
    expect(handType(e)).toBe('flush');
    expect(res(e, R_CHIPS)).toBe(126); // 35 +逐张(2+5+7+9+J10=33) +50 +(money4×2=8)
    expect(res(e, R_MULT)).toBe(24); // (4 +4) ×3，Jolly 不触发
    expect(res(e, R_HAND_SCORE)).toBe(3024); // 126 × 24（REQ-013 资源×资源）
  });

  it('出对子：Jolly 触发，先加后乘 → 88×42=3696（BUG-001：仅两张K计分）', () => {
    const e = boot();
    play(e, [card(0, 13), card(3, 13), card(0, 2), card(1, 5), card(2, 9)]);
    tick(e, 5);
    expect(handType(e)).toBe('pair');
    expect(res(e, R_CHIPS)).toBe(88); // 10 +计分牌两张K(10+10=20) +50 +8；垫牌2/5/9 不计
    expect(res(e, R_MULT)).toBe(42); // (2 +4 +8) ×3
    expect(res(e, R_HAND_SCORE)).toBe(3696);
  });

  it('order 决定结果：先乘后加会是 (2×3)+4+8=18 ≠ 42 → 有序结算生效', () => {
    const e = boot();
    play(e, [card(0, 13), card(3, 13), card(0, 2), card(1, 5), card(2, 9)]);
    tick(e, 5);
    expect(res(e, R_MULT)).toBe(42);
    expect(res(e, R_MULT)).not.toBe(18);
  });

  it('Bull 是量纲动态值：money 变 → chips 跟着变（REQ-013 coeff）', () => {
    const e = boot();
    setRes(e, R_MONEY, 10); // 改钱
    play(e, [card(1, 2), card(1, 5), card(1, 7), card(1, 9), card(1, 11)]); // flush
    tick(e, 5);
    expect(res(e, R_CHIPS)).toBe(138); // 35 +逐张33 +50 +(money10×2=20)
    expect(res(e, R_HAND_SCORE)).toBe(138 * 24);
  });

  it('未出牌（scoring=false）：基础分(含逐张)设了但小丑不结算、hand_score=0', () => {
    const e = boot();
    play(e, [card(0, 7), card(1, 7), card(2, 7), card(0, 2), card(3, 9)], false);
    tick(e, 3);
    expect(handType(e)).toBe('three-of-a-kind');
    expect(res(e, R_CHIPS)).toBe(51); // 30 牌型基础 +计分牌三张7(7+7+7=21)；垫牌2/9 不计（BUG-001）
    expect(res(e, R_MULT)).toBe(3);
    expect(res(e, R_HAND_SCORE)).toBe(0); // 无 score 信号 → 小丑/合并不结算
  });

  it('toEngineCard：数据牌组黑桃 10/J/Q/K/A → 同花顺端到端', () => {
    const e = boot();
    const want = ['10', 'J', 'Q', 'K', 'A'];
    const cards = STANDARD_DECK.filter((c) => c.suit === 'spades' && want.includes(c.rank)).map(toEngineCard);
    expect(cards.length).toBe(5);
    play(e, cards);
    tick(e, 5);
    expect(handType(e)).toBe('straight-flush');
    expect(res(e, R_CHIPS)).toBe(209); // 100 +逐张(10+J10+Q10+K10+A11=51) +50 +8
    expect(res(e, R_MULT)).toBe(36); // (8 +4) ×3
    expect(res(e, R_HAND_SCORE)).toBe(7524); // 209 × 36
  });
});

// ── REQ-014：逐张小丑 + retrigger 在真游戏链涌现（纯数据装配，零游戏 system）──
//   on_card_scored 小丑 = 一个 PerCardRule 实体；retrigger = 一个 PerCardRetrigger 实体。
//   注入到 game-e 蓝图（与既有 PokerHand/PerCardScore/effect-apply 小丑同链）后 tick，验证涌现的最终分。
const addPerCardRule = (e: Engine, id: string, rule: Omit<PerCardRule, 'type'>): void => {
  e.world.createEntity(id);
  e.world.addComponent(id, { type: 'PerCardRule', ...rule } as PerCardRule);
};
const addRetrigger = (e: Engine, id: string, rt: Omit<PerCardRetrigger, 'type'>): void => {
  e.world.createEntity(id);
  e.world.addComponent(id, { type: 'PerCardRetrigger', ...rt } as PerCardRetrigger);
};
const DIAMONDS = 2;

describe('game-e · REQ-014 逐张小丑 + retrigger 真引擎涌现', () => {
  // 同花♦ 5 张：10/4 基础 → 逐张33c + Greedy(每♦+3m) → effect 链(+50c/+8c/+4m/×3) → 合并。
  it('Greedy Joker（每张♦+3 倍率）逐张涌现：5♦ → +15 mult → 126×69=8694', () => {
    const e = boot();
    addPerCardRule(e, 'greedy', { when: { kind: 'suit', suit: DIAMONDS }, op: 'add', targetResource: R_MULT, value: 3 });
    play(e, [card(DIAMONDS, 2), card(DIAMONDS, 5), card(DIAMONDS, 7), card(DIAMONDS, 9), card(DIAMONDS, 11)]);
    tick(e, 5);
    expect(handType(e)).toBe('flush');
    expect(res(e, R_CHIPS)).toBe(126); // 35 +逐张33 +50 +8
    expect(res(e, R_MULT)).toBe(69); // ((4 基础 +15 Greedy) +4 joker_base) ×3 Cavendish
    expect(res(e, R_HAND_SCORE)).toBe(8694); // 126 × 69
  });

  // ★核心：retrigger 与逐张小丑乘性耦合——Hanging Chad 让首张♦被 Greedy 触发 3 次。
  // 无 Chad：Greedy 5♦×3=+15；有 Chad（首张额外2次）：首♦×3 + 余4♦×1 = 7 次 → +21（非 +18）。
  it('Hanging Chad × Greedy 乘性耦合：首♦重触发 → Greedy 7 次 +21 mult（聚合表达不了）', () => {
    const e = boot();
    addPerCardRule(e, 'greedy', { when: { kind: 'suit', suit: DIAMONDS }, op: 'add', targetResource: R_MULT, value: 3 });
    addRetrigger(e, 'chad', { when: { kind: 'index', eq: 0 }, extra: 2 });
    play(e, [card(DIAMONDS, 2), card(DIAMONDS, 5), card(DIAMONDS, 7), card(DIAMONDS, 9), card(DIAMONDS, 11)]);
    tick(e, 5);
    // chips：首张♦2(2c) 计 3 次 → 逐张 33 +首张额外 2×2=4 = 37 → 35 +37 +50 +8 = 130。
    expect(res(e, R_CHIPS)).toBe(130);
    // mult：Greedy 7 次 = +21；((4 +21) +4) ×3 = 87。证明 retrigger×逐张耦合（count(♦)×3=15 表达不了）。
    expect(res(e, R_MULT)).toBe(87);
    expect(res(e, R_HAND_SCORE)).toBe(11310); // 130 × 87
  });
});

// ── 增量1：回合循环（round_score 累加 / hands_left 递减 / 胜负）—— 引擎驱动，视图零逻辑 ──
//   commit() 复刻 game-e.tsx 的出牌一拍：写 PlayedHand+scoring=true → tick → 清+scoring=false → tick(disarm)。
//   round_score/hands_left 走边沿信号 hand_committed（每出一手一次），与计分链的 level 解耦。
const commit = (e: Engine, cards: Card[]): void => {
  e.world.getComponent<PlayedHand>('table', 'PlayedHand')!.cards = cards;
  e.world.getComponent<Flag>('scoring', 'Flag')!.active = true;
  e.world.tick();
  e.world.getComponent<PlayedHand>('table', 'PlayedHand')!.cards = [];
  e.world.getComponent<Flag>('scoring', 'Flag')!.active = false;
  e.world.tick();
};

describe('game-e · 回合循环（边沿 commit：累加/递减一次）', () => {
  it('出一手：round_score += 本手分、hands_left 4→3', () => {
    const e = boot();
    expect(res(e, R_ROUND_SCORE)).toBe(0);
    expect(res(e, R_HANDS_LEFT)).toBe(4);
    commit(e, [card(1, 2), card(1, 5), card(1, 7), card(1, 9), card(1, 11)]); // flush → 本手 3024
    expect(res(e, R_HAND_SCORE)).toBe(3024);
    expect(res(e, R_ROUND_SCORE)).toBe(3024);
    expect(res(e, R_HANDS_LEFT)).toBe(3);
  });

  it('出两手：round_score 跨手累加、hands_left 递减两次', () => {
    const e = boot();
    commit(e, [card(1, 2), card(1, 5), card(1, 7), card(1, 9), card(1, 11)]); // flush 3024
    commit(e, [card(0, 13), card(3, 13), card(0, 2), card(1, 5), card(2, 9)]); // pair 3696（BUG-001 后）
    expect(res(e, R_ROUND_SCORE)).toBe(3024 + 3696);
    expect(res(e, R_HANDS_LEFT)).toBe(2);
  });

  it('★边沿幂等：持有 scoring 多 tick 也只累加/递减一次（与计分链 level 解耦）', () => {
    const e = boot();
    e.world.getComponent<PlayedHand>('table', 'PlayedHand')!.cards = [card(1, 2), card(1, 5), card(1, 7), card(1, 9), card(1, 11)];
    e.world.getComponent<Flag>('scoring', 'Flag')!.active = true;
    e.world.tick();
    e.world.tick();
    e.world.tick(); // 连 tick 3 次仍持有 scoring
    expect(res(e, R_HAND_SCORE)).toBe(3024); // 计分链幂等（level，每 tick 重算同值）
    expect(res(e, R_ROUND_SCORE)).toBe(3024); // 边沿只累加一次
    expect(res(e, R_HANDS_LEFT)).toBe(3); // 边沿只递减一次
  });

  it('达盲注线：累加过 blind_target（300）即视图判胜（这里验资源到位）', () => {
    const e = boot();
    expect(res(e, R_BLIND)).toBe(300);
    commit(e, [card(1, 2), card(1, 5), card(1, 7), card(1, 9), card(1, 11)]); // 3024 ≥ 300
    expect(res(e, R_ROUND_SCORE)).toBeGreaterThanOrEqual(res(e, R_BLIND));
  });
});

describe('game-e · 确定性洗牌（deck）', () => {
  it('同 seed 同牌序（可复现，为 lockstep 铺路）', () => {
    expect(shuffledDeck(42)).toEqual(shuffledDeck(42));
  });
  it('不同 seed 不同牌序', () => {
    expect(shuffledDeck(1)).not.toEqual(shuffledDeck(2));
  });
  it('洗牌是排列：52 张不增不减、元素同集合', () => {
    const s = shuffledDeck(7);
    expect(s.length).toBe(STANDARD_DECK.length);
    expect([...s].sort((a, b) => (a.suit + a.rank < b.suit + b.rank ? -1 : 1)))
      .toEqual([...STANDARD_DECK].sort((a, b) => (a.suit + a.rank < b.suit + b.rank ? -1 : 1)));
  });
  it('shuffle 不改原数组', () => {
    const orig = [1, 2, 3, 4, 5];
    const copy = [...orig];
    shuffle(orig, 99);
    expect(orig).toEqual(copy);
  });
});
