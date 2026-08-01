import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Card, PlayedHand, HeldHand, PokerHand, PerCardScore, PerCardRule, PerCardRetrigger, Resource, RandomSeed } from '@engine/protocol/components.js';
import { cardScoringCapability, matchPerCardWhen } from './card-scoring.js';
import { pokerHandCapability } from './poker-hand.js';

// 牌速记：c(suit, rank)。点数 A=14, K=13, Q=12, J=11；花色 0..3（♠♥♦♣）。
const c = (suit: number, rank: number): Card => ({ suit, rank });
const A = 14, K = 13, Q = 12, J = 11;
const DIAMONDS = 2, HEARTS = 1;
// Balatro 标准每牌基础筹码：2..10=点值，J/Q/K=10，A=11。纯数据，引擎不写死。
const BASE_CHIPS: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, '11': 10, '12': 10, '13': 10, '14': 11 };

// ── 纯逻辑：matchPerCardWhen 谓词 ────────────────────────────────
describe('card-scoring — matchPerCardWhen 谓词求值', () => {
  it('always 永真', () => expect(matchPerCardWhen({ kind: 'always' }, c(0, 5), 0)).toBe(true));
  it('suit 命中花色', () => {
    expect(matchPerCardWhen({ kind: 'suit', suit: DIAMONDS }, c(DIAMONDS, 5), 3)).toBe(true);
    expect(matchPerCardWhen({ kind: 'suit', suit: DIAMONDS }, c(HEARTS, 5), 3)).toBe(false);
  });
  it('rankIn：人头 = [11,12,13]（A=14 不含）', () => {
    const face = { kind: 'rankIn' as const, ranks: [J, Q, K] };
    expect(matchPerCardWhen(face, c(0, K), 0)).toBe(true);
    expect(matchPerCardWhen(face, c(0, A), 0)).toBe(false);
    expect(matchPerCardWhen(face, c(0, 10), 0)).toBe(false);
  });
  it('rankIn：偶(Even Steven)=[2,4,6,8,10]，A 不算偶（rank14 不在表 → 数据正确表达 Balatro 语义）', () => {
    const even = { kind: 'rankIn' as const, ranks: [2, 4, 6, 8, 10] };
    expect(matchPerCardWhen(even, c(0, 10), 0)).toBe(true);
    expect(matchPerCardWhen(even, c(0, A), 0)).toBe(false); // A=14 不在偶表（虽 14%2==0，靠数据而非取模）
    expect(matchPerCardWhen(even, c(0, 7), 0)).toBe(false);
  });
  it('index 命中序号（首张=0）', () => {
    expect(matchPerCardWhen({ kind: 'index', eq: 0 }, c(0, 5), 0)).toBe(true);
    expect(matchPerCardWhen({ kind: 'index', eq: 0 }, c(0, 5), 1)).toBe(false);
  });
  it('and/or/not 布尔组合', () => {
    const w = { kind: 'and' as const, of: [{ kind: 'suit' as const, suit: DIAMONDS }, { kind: 'rankIn' as const, ranks: [J, Q, K] }] };
    expect(matchPerCardWhen(w, c(DIAMONDS, K), 0)).toBe(true); // ♦ 且 人头
    expect(matchPerCardWhen(w, c(DIAMONDS, 5), 0)).toBe(false);
    expect(matchPerCardWhen({ kind: 'or', of: [{ kind: 'suit', suit: DIAMONDS }, { kind: 'suit', suit: HEARTS }] }, c(HEARTS, 5), 0)).toBe(true);
    expect(matchPerCardWhen({ kind: 'not', of: { kind: 'suit', suit: DIAMONDS } }, c(HEARTS, 5), 0)).toBe(true);
  });
});

// ── 系统 card-score-pass：手搭 World 跑逐张 pass ──────────────────
interface SetupOpts {
  rules?: Array<{ id: string; rule: Omit<PerCardRule, 'type'> }>;
  retriggers?: Array<{ id: string; rt: Omit<PerCardRetrigger, 'type'> }>;
  max?: number;
}
function loadPass(cards: Card[], opts: SetupOpts = {}): World {
  const w = new World();
  for (const s of cardScoringCapability.systems) w.addSystem(s);
  w.createEntity('table');
  w.addComponent('table', { type: 'PerCardScore', chipsResource: 'chips', baseChipsByRank: BASE_CHIPS } as PerCardScore);
  w.addComponent('table', { type: 'PlayedHand', cards } as PlayedHand);
  const max = opts.max ?? 1_000_000;
  for (const id of ['chips', 'mult']) {
    w.createEntity(`res:${id}`);
    w.addComponent(`res:${id}`, { type: 'Resource', id, current: 0, min: 0, max } as Resource);
  }
  for (const { id, rule } of opts.rules ?? []) {
    w.createEntity(id);
    w.addComponent(id, { type: 'PerCardRule', ...rule } as PerCardRule);
  }
  for (const { id, rt } of opts.retriggers ?? []) {
    w.createEntity(id);
    w.addComponent(id, { type: 'PerCardRetrigger', ...rt } as PerCardRetrigger);
  }
  return w;
}
const res = (w: World, id: string): number => w.getComponent<Resource>(`res:${id}`, 'Resource')!.current;

describe('card-score-pass — 牌内禀修正 mods / retrigger（REQ-E-021 附魔）', () => {
  it('foil 牌 mods 加 chips：只该牌得加成（异质，非全局规则）', () => {
    const w = loadPass([{ suit: 0, rank: 5, mods: [{ op: 'add', target: 'chips', value: 50 }] }, c(1, 5)]);
    w.tick();
    expect(res(w, 'chips')).toBe(5 + 50 + 5); // 60：foil 5♠(base5 + mods50) + 5♥(base5)
  });
  it('无 mods → 行为不变（仅 baseChips）', () => {
    const w = loadPass([c(0, 5), c(1, 5)]);
    w.tick();
    expect(res(w, 'chips')).toBe(10);
  });
  it('mods 同一张牌内按序套用（add 先于 mul）', () => {
    const w = loadPass([{ suit: 0, rank: 5, mods: [{ op: 'add', target: 'mult', value: 4 }, { op: 'mul', target: 'mult', value: 2 }] }, c(1, 5)]);
    w.tick();
    expect(res(w, 'mult')).toBe((0 + 4) * 2); // 8：先 +4 再 ×2（数组序）
  });
  it('retrigger（红蜡封）：该牌连同其 mods 重复结算', () => {
    const w = loadPass([{ suit: 0, rank: 5, mods: [{ op: 'add', target: 'chips', value: 50 }], retrigger: 1 }, c(1, 5)]);
    w.tick();
    expect(res(w, 'chips')).toBe((5 + 50) * 2 + 5); // 115：5♠(base5+50)×2 + 5♥(base5)
  });
});

describe('card-score-pass — PerCardRule.chance 概率门（REQ-E-023②，确定性种子 PRNG）', () => {
  const withSeed = (w: World): World => { w.createEntity('rng'); w.addComponent('rng', { type: 'RandomSeed', seed: 999, sequence: 0 } as RandomSeed); return w; };
  // 对子两张 5 都计分；规则 when:always +4 mult，逐张独立 roll。
  it('chance 1/1 → 必中（两张计分牌各 +4 → 8）', () => {
    const w = withSeed(loadPass([c(0, 5), c(1, 5)], { rules: [{ id: 'bs', rule: { when: { kind: 'always' }, op: 'add', targetResource: 'mult', value: 4, chance: { num: 1, den: 1 } } }] }));
    w.tick();
    expect(res(w, 'mult')).toBe(8);
  });
  it('chance 0/1 → 必不中（规则全跳过 → 0）', () => {
    const w = withSeed(loadPass([c(0, 5), c(1, 5)], { rules: [{ id: 'bs', rule: { when: { kind: 'always' }, op: 'add', targetResource: 'mult', value: 4, chance: { num: 0, den: 1 } } }] }));
    w.tick();
    expect(res(w, 'mult')).toBe(0);
  });
});

describe('held-card-score — 留手牌结算 pass（REQ-E-023③）', () => {
  function loadHeld(held: Card[], rules: Array<{ id: string; rule: Omit<PerCardRule, 'type'> }> = []): World {
    const w = new World();
    for (const s of cardScoringCapability.systems) w.addSystem(s);
    w.createEntity('table');
    w.addComponent('table', { type: 'PerCardScore', chipsResource: 'chips', baseChipsByRank: BASE_CHIPS } as PerCardScore);
    w.addComponent('table', { type: 'PlayedHand', cards: [] } as PlayedHand); // 出牌空：held pass 独立入口
    w.addComponent('table', { type: 'HeldHand', cards: held } as HeldHand);
    for (const id of ['chips', 'mult']) { w.createEntity(`res:${id}`); w.addComponent(`res:${id}`, { type: 'Resource', id, current: 0, min: 0, max: 1e9 } as Resource); }
    for (const { id, rule } of rules) { w.createEntity(id); w.addComponent(id, { type: 'PerCardRule', ...rule } as PerCardRule); }
    return w;
  }
  it('held PerCardRule 对留手牌生效（Baron：留手 K +4 mult）', () => {
    const w = loadHeld([c(0, K), c(1, 5)], [{ id: 'baron', rule: { when: { kind: 'rankIn', ranks: [K] }, op: 'add', targetResource: 'mult', value: 4, held: true } }]);
    w.tick();
    expect(res(w, 'mult')).toBe(4); // 只留手 K 命中
  });
  it('held Card.mod 对留手牌生效（Steel：held mod +50 chips）', () => {
    const w = loadHeld([{ suit: 0, rank: 5, mods: [{ op: 'add', target: 'chips', value: 50, held: true }] }]);
    w.tick();
    expect(res(w, 'chips')).toBe(50);
  });
  it('出牌 pass 跳过 held 标记的 mod（不双算）', () => {
    const w = loadPass([{ suit: 0, rank: 5, mods: [{ op: 'add', target: 'chips', value: 50, held: true }] }, c(1, 5)]);
    w.tick();
    expect(res(w, 'chips')).toBe(10); // 仅 baseChips 5+5；held mod 不在出牌 pass 生效
  });
});

describe('card-score-pass — 逐张 baseChips 累加', () => {
  it('5 张牌 baseChips 累加：2+5+7+9+(K=10)=33', () => {
    const w = loadPass([c(0, 2), c(0, 5), c(0, 7), c(0, 9), c(0, K)]);
    w.tick();
    expect(res(w, 'chips')).toBe(33);
  });
  it('A=11、人头=10：A+K+Q+J+10 = 11+10+10+10+10 = 51', () => {
    const w = loadPass([c(0, A), c(0, K), c(0, Q), c(0, J), c(0, 10)]);
    w.tick();
    expect(res(w, 'chips')).toBe(51);
  });
  it('空手牌 → 不结算（chips 保持原值）', () => {
    const w = loadPass([]);
    w.getComponent<Resource>('res:chips', 'Resource')!.current = 77;
    w.tick();
    expect(res(w, 'chips')).toBe(77);
  });
  it('BUG-001：高牌只计最高单张（垫牌不计分）—— [2,3] → 只加 3', () => {
    // 高牌 = 只有最高单张是计分牌（Balatro），2 是垫牌不加 baseChips。
    const w = loadPass([c(0, 2), c(0, 3)]);
    w.tick();
    expect(res(w, 'chips')).toBe(3);
  });
  it('BUG-001：对子只计成对的两张（垫牌不计分）—— [5,5,2,9,K] 只加 5+5=10', () => {
    const w = loadPass([c(0, 5), c(1, 5), c(2, 2), c(3, 9), c(0, K)]); // 注：非同花，对子 5
    w.tick();
    expect(res(w, 'chips')).toBe(10); // 仅两张 5（垫牌 2/9/K 不计）
  });
});

describe('card-score-pass — 逐张小丑规则（PerCardRule，仅计分牌触发）', () => {
  it('Greedy：每张计分♦ +3 mult（同花♦ 全计分 → 5×3=+15）', () => {
    // 用♦同花使 5 张全是计分牌（BUG-001 后逐张小丑只在计分牌触发）。
    const w = loadPass([c(DIAMONDS, 2), c(DIAMONDS, 5), c(DIAMONDS, 7), c(DIAMONDS, 9), c(DIAMONDS, K)], {
      rules: [{ id: 'greedy', rule: { when: { kind: 'suit', suit: DIAMONDS }, op: 'add', targetResource: 'mult', value: 3 } }],
    });
    w.tick();
    expect(res(w, 'mult')).toBe(15);
  });
  it('Scary Face：每张计分人头 +30 chips（同花含 K,Q → +60）', () => {
    const w = loadPass([c(0, K), c(0, Q), c(0, 2), c(0, 5), c(0, 9)], { // 同花，全计分
      rules: [{ id: 'scary', rule: { when: { kind: 'rankIn', ranks: [J, Q, K] }, op: 'add', targetResource: 'chips', value: 30 } }],
    });
    w.tick();
    // baseChips K10+Q10+2+5+9=36；Scary K,Q 两人头 ×30=60 → 96
    expect(res(w, 'chips')).toBe(96);
  });
  it('Even Steven：每张计分偶 +4 mult（同花含 2,4 → +8）', () => {
    const w = loadPass([c(0, 2), c(0, 4), c(0, 7), c(0, 9), c(0, J)], { // 同花，全计分
      rules: [{ id: 'even', rule: { when: { kind: 'rankIn', ranks: [2, 4, 6, 8, 10] }, op: 'add', targetResource: 'mult', value: 4 } }],
    });
    w.tick();
    expect(res(w, 'mult')).toBe(8); // 2 张偶(2,4) ×4
  });
  it('钳上下限：mult 超 max 钳住（♦同花 5×3=15 钳到 5）', () => {
    const w = loadPass([c(DIAMONDS, 2), c(DIAMONDS, 5), c(DIAMONDS, 7), c(DIAMONDS, 9), c(DIAMONDS, J)], {
      rules: [{ id: 'greedy', rule: { when: { kind: 'suit', suit: DIAMONDS }, op: 'add', targetResource: 'mult', value: 3 } }],
      max: 5,
    });
    w.tick();
    expect(res(w, 'mult')).toBe(5); // 15 钳到 5
  });
  it('BUG-001：垫牌上的逐张小丑不触发 —— ♦垫牌在高牌里不算（Greedy +0）', () => {
    // [♦2,♦5,♦9,♥7,♠K] 是高牌 → 只有最高单张 K(♠) 计分；♦ 都是垫牌 → Greedy 不触发。
    const w = loadPass([c(DIAMONDS, 2), c(DIAMONDS, 5), c(DIAMONDS, 9), c(HEARTS, 7), c(0, K)], {
      rules: [{ id: 'greedy', rule: { when: { kind: 'suit', suit: DIAMONDS }, op: 'add', targetResource: 'mult', value: 3 } }],
    });
    w.tick();
    expect(res(w, 'mult')).toBe(0); // 计分牌只有 K(♠)，无♦计分
  });
});

describe('card-score-pass — retrigger（核心：聚合表达不了的乘性耦合；index=计分序）', () => {
  it('Hanging Chad：首张计分牌 +2 重触发 → 该牌 baseChips 计 3 次（对子5,5 → 5×3+5=20）', () => {
    const w = loadPass([c(0, 5), c(1, 5)], { // 对子 5，两张都计分；pos0=首张5
      retriggers: [{ id: 'chad', rt: { when: { kind: 'index', eq: 0 }, extra: 2 } }],
    });
    w.tick();
    expect(res(w, 'chips')).toBe(20); // 首5 ×3=15 + 次5 ×1=5
  });
  it('★retrigger × 逐张小丑 乘性耦合：首张计分♦被 Greedy 命中且重触发 → +3 ×3 = +9', () => {
    const w = loadPass([c(DIAMONDS, 5), c(HEARTS, 5)], { // 对子5，pos0=♦5（计分），pos1=♥5
      rules: [{ id: 'greedy', rule: { when: { kind: 'suit', suit: DIAMONDS }, op: 'add', targetResource: 'mult', value: 3 } }],
      retriggers: [{ id: 'chad', rt: { when: { kind: 'index', eq: 0 }, extra: 2 } }],
    });
    w.tick();
    // pos0=♦5 被 Greedy 命中 + Chad 重触发 → 3 次 = +9 mult。聚合 count(♦)×3=3 表达不了。
    expect(res(w, 'mult')).toBe(9);
  });
  it('retrigger 只重触发首张计分牌：♦ 在计分序 pos1（非首）→ Greedy 只 1 次 = +3', () => {
    const w = loadPass([c(HEARTS, 5), c(DIAMONDS, 5)], { // 对子5，pos0=♥5（被Chad重触发但非♦），pos1=♦5
      rules: [{ id: 'greedy', rule: { when: { kind: 'suit', suit: DIAMONDS }, op: 'add', targetResource: 'mult', value: 3 } }],
      retriggers: [{ id: 'chad', rt: { when: { kind: 'index', eq: 0 }, extra: 2 } }],
    });
    w.tick();
    // ♦5 在 pos1（非首）→ Greedy 只 1 次 = +3（首张♥5 重触发但非♦，不加 mult）。
    expect(res(w, 'mult')).toBe(3);
  });
});

// ── 集成：poker-eval(set 牌型基础) + card-score-pass(add 逐张) 同 tick 幂等 ──
describe('card-score-pass + poker-eval 集成（幂等：多 tick 持平）', () => {
  function loadChain(cards: Card[]): World {
    const w = new World();
    for (const s of pokerHandCapability.systems) w.addSystem(s);
    for (const s of cardScoringCapability.systems) w.addSystem(s);
    w.createEntity('table');
    w.addComponent('table', {
      type: 'PokerHand', rankingTable: { 'flush': { chips: 35, mult: 4 } }, chipsResource: 'chips', multResource: 'mult',
    } as PokerHand);
    w.addComponent('table', { type: 'PerCardScore', chipsResource: 'chips', baseChipsByRank: BASE_CHIPS } as PerCardScore);
    w.addComponent('table', { type: 'PlayedHand', cards } as PlayedHand);
    for (const id of ['chips', 'mult']) {
      w.createEntity(`res:${id}`);
      w.addComponent(`res:${id}`, { type: 'Resource', id, current: 0, min: 0, max: 1_000_000 } as Resource);
    }
    return w;
  }
  it('同花 5 张：poker set chips=35 → 逐张 add baseChips → 35 + (2+5+7+9+K10)=33 → 68；多 tick 持平', () => {
    const w = loadChain([c(1, 2), c(1, 5), c(1, 7), c(1, 9), c(1, K)]);
    w.tick();
    expect(res(w, 'chips')).toBe(68); // 35 牌型基础 + 33 逐张
    expect(res(w, 'mult')).toBe(4); // 牌型基础 mult（无逐张 mult 小丑）
    w.tick();
    w.tick();
    expect(res(w, 'chips')).toBe(68); // ★幂等：poker-eval 每 tick 重 set 35，逐张重 add 33 → 持平不漂移
  });
});
