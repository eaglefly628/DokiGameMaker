import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import type { Resource, PlayedHand, Flag, Card as EngineCard } from '@engine/protocol/components.js';
import {
  buildGameEBlueprint, buildJokerEntities, jokerToEntities,
  R_CHIPS, R_MULT, R_HAND_SCORE,
} from './blueprint.js';
import { JOKER_BY_ID, STARTER_JOKERS } from './jokers.js';

// 小丑 = catalog 数据 → 蓝图实体（buildJokerEntities）。本测分两层：
//   ① 结构映射：每类 JokerCard → 期望实体形状（确定性、不算分，安全）。
//   ② 真引擎集成：单张小丑装进真蓝图跑一手，手工推导最终分（证派生在引擎里真生效）。

const J = (id: string) => JOKER_BY_ID.get(id)!;
const card = (suit: number, rank: number): EngineCard => ({ suit, rank });

// ── ① 结构映射 ───────────────────────────────────────────────
describe('joker-wiring · jokerToEntities 结构映射', () => {
  it('无条件加（Joker +4 mult）→ Effect(onSignal=score, op=add)', () => {
    const e = jokerToEntities(J('joker'), 0) as Record<string, { Effect: Record<string, unknown> }>;
    expect(e.j_joker.Effect).toMatchObject({ onSignal: 'score', kind: 'modify-resource', targetId: 'mult', op: 'add', value: 4 });
  });
  it('乘法（Cavendish ×3 mult）→ op=mul，order≥100（乘在加之后）', () => {
    const e = jokerToEntities(J('cavendish'), 2) as Record<string, { Effect: Record<string, unknown> }>;
    expect(e.j_cavendish.Effect).toMatchObject({ op: 'mul', value: 3 });
    expect(e.j_cavendish.Effect.order as number).toBeGreaterThanOrEqual(100);
  });
  it('量纲动态值（Bull 每$1+2c）→ valueFrom 映射 money 资源', () => {
    const e = jokerToEntities(J('bull'), 0) as Record<string, { Effect: Record<string, unknown> }>;
    expect(e.j_bull.Effect).toMatchObject({ targetId: 'chips', op: 'add', valueFrom: { resourceId: 'money', coeff: 2 } });
    expect(e.j_bull.Effect.value).toBeUndefined(); // 用 valueFrom 时不带静态 value
  });
  it('Banner 每剩 1 弃牌 +30c → valueFrom 映射 discards_left 资源', () => {
    const e = jokerToEntities(J('banner'), 0) as Record<string, { Effect: Record<string, unknown> }>;
    expect((e.j_banner.Effect.valueFrom as { resourceId: string }).resourceId).toBe('discards_left');
  });
  it('条件·含对子（Jolly）→ 门 EventWhen(and(scoring, rankMaxCount≥2)) + Effect 监听门信号', () => {
    const e = jokerToEntities(J('jolly_joker'), 0) as Record<string, { EventWhen?: Record<string, unknown>; Effect?: Record<string, unknown> }>;
    const gate = e.gate_jolly_joker.EventWhen as { signal: string; when: { of: unknown[] } };
    expect(gate.signal).toBe('js_jolly_joker');
    expect(gate.when.of).toContainEqual({ kind: 'resource', id: 'rank_max_count', cmp: 'gte', value: 2 });
    expect(e.j_jolly_joker.Effect).toMatchObject({ onSignal: 'js_jolly_joker', targetId: 'mult', value: 8 });
  });
  it('条件·含三条（Zany）→ rankMaxCount≥3', () => {
    const e = jokerToEntities(J('zany_joker'), 0) as Record<string, { EventWhen: { when: { of: unknown[] } } }>;
    expect(e.gate_zany_joker.EventWhen.when.of).toContainEqual({ kind: 'resource', id: 'rank_max_count', cmp: 'gte', value: 3 });
  });
  it('条件·出牌≤3（Half Joker）→ hand_size lte 3', () => {
    const e = jokerToEntities(J('half_joker'), 0) as Record<string, { EventWhen: { when: { of: unknown[] } } }>;
    expect(e.gate_half_joker.EventWhen.when.of).toContainEqual({ kind: 'resource', id: 'hand_size', cmp: 'lte', value: 3 });
  });
  it('逐张·花色（Greedy 每♦+3m）→ PerCardRule{when:suit}', () => {
    const e = jokerToEntities(J('greedy_joker'), 0) as Record<string, { PerCardRule: Record<string, unknown> }>;
    expect(e.j_greedy_joker.PerCardRule).toMatchObject({ when: { kind: 'suit', suit: 2 }, op: 'add', targetResource: 'mult', value: 3 });
  });
  it('逐张·人头（Scary Face）→ PerCardRule{when:rankIn[11,12,13]}', () => {
    const e = jokerToEntities(J('scary_face'), 0) as Record<string, { PerCardRule: { when: { ranks: number[] } } }>;
    expect(e.j_scary_face.PerCardRule.when.ranks).toEqual([11, 12, 13]);
  });
  it('逐张·偶数（Even Steven）→ PerCardRule{when:rankIn[2,4,6,8,10]}（A=14 不含，靠数据非取模）', () => {
    const e = jokerToEntities(J('even_steven'), 0) as Record<string, { PerCardRule: { when: { ranks: number[] } } }>;
    expect(e.j_even_steven.PerCardRule.when.ranks).toEqual([2, 4, 6, 8, 10]);
  });
  it('重触发（Hanging Chad）→ PerCardRetrigger{when:index0, extra:2}', () => {
    const e = jokerToEntities(J('hanging_chad'), 0) as Record<string, { PerCardRetrigger: Record<string, unknown> }>;
    expect(e.j_hanging_chad.PerCardRetrigger).toMatchObject({ when: { kind: 'index', eq: 0 }, extra: 2 });
  });
  it('on_round_end（Golden Joker）→ tag-only 实体（效果由游戏侧解释，仅占 tag 供 countOf）', () => {
    const ent = jokerToEntities(J('golden_joker'), 0);
    expect(Object.keys(ent)).toEqual(['j_golden_joker']);
    const e = ent.j_golden_joker as unknown as Record<string, unknown>;
    expect(e.Tag).toBeDefined(); // 计入 countOf
    expect(e.Effect).toBeUndefined(); // 无计分效果（钱由 roundEndPayout 解释）
  });
  it('buildJokerEntities：计分小丑产计分实体，经济/被动小丑产 tag-only', () => {
    const all = buildJokerEntities(STARTER_JOKERS);
    expect(all.j_joker).toBeDefined();
    expect(all.j_golden_joker).toBeDefined(); // 现为 tag-only（不再 undefined）
    expect((all.j_golden_joker as unknown as Record<string, unknown>).Effect).toBeUndefined();
    expect(all.j_hanging_chad).toBeDefined();
  });
});

// ── ② 真引擎集成（单张小丑，手工推导）─────────────────────────
const res = (e: Engine, id: string): number => {
  for (const [eid] of e.world.query('Resource')) {
    const r = e.world.getComponent<Resource>(eid, 'Resource');
    if (r && r.id === id) return r.current;
  }
  return 0;
};
function playOne(jokerIds: string[], cards: EngineCard[]): Engine {
  const jokers = jokerIds.map((id) => J(id));
  const e = new Engine({ tickRate: 60 });
  e.load(buildGameEBlueprint(buildJokerEntities(jokers)));
  e.world.getComponent<PlayedHand>('table', 'PlayedHand')!.cards = cards;
  e.world.getComponent<Flag>('scoring', 'Flag')!.active = true;
  e.world.tick();
  return e;
}
const D = 2; // diamonds

describe('joker-wiring · 真引擎单小丑涌现（手工推导）', () => {
  it('Greedy 单张：同花♦ → chips 35+33=68, mult 4+5×3=19 → 1292', () => {
    const e = playOne(['greedy_joker'], [card(D, 2), card(D, 5), card(D, 7), card(D, 9), card(D, 11)]);
    expect(res(e, R_CHIPS)).toBe(68);
    expect(res(e, R_MULT)).toBe(19);
    expect(res(e, R_HAND_SCORE)).toBe(1292);
  });

  it('Jolly 含对子触发：对子只计两张K chips 10+20=30, mult 2+8=10 → 300（BUG-001：垫牌不计）', () => {
    const e = playOne(['jolly_joker'], [card(0, 13), card(3, 13), card(0, 2), card(1, 5), card(2, 9)]);
    expect(res(e, R_CHIPS)).toBe(30); // 牌型基础10 + 计分牌两张K(10+10=20)；垫牌2/5/9 不计
    expect(res(e, R_MULT)).toBe(10);
    expect(res(e, R_HAND_SCORE)).toBe(300);
  });

  it('Jolly 高牌不触发：高牌 mult 仍 1（rankMaxCount=1<2，门不开）', () => {
    const e = playOne(['jolly_joker'], [card(0, 2), card(1, 5), card(2, 7), card(3, 9), card(0, 13)]);
    expect(res(e, R_MULT)).toBe(1);
  });

  it('Half Joker 出 3 张触发：高牌只计最高单张 chips 5+7=12, mult 1+20=21 → 252（BUG-001）', () => {
    const e = playOne(['half_joker'], [card(0, 2), card(1, 5), card(2, 7)]);
    expect(res(e, R_CHIPS)).toBe(12); // 高牌基础5 + 计分牌仅最高单张7；垫牌2/5 不计
    expect(res(e, R_MULT)).toBe(21);
    expect(res(e, R_HAND_SCORE)).toBe(252);
  });

  it('Half Joker 出 5 张不触发：mult 仍 1（hand_size=5>3）', () => {
    const e = playOne(['half_joker'], [card(0, 2), card(1, 5), card(2, 7), card(3, 9), card(0, 13)]);
    expect(res(e, R_MULT)).toBe(1);
  });

  it('Hanging Chad 单张：高牌只计最高单张7，重触发×3 → chips 5+(7×3)=26（BUG-001）', () => {
    const e = playOne(['hanging_chad'], [card(0, 5), card(1, 7)]);
    expect(res(e, R_CHIPS)).toBe(26); // 高牌基础5 + 计分牌仅7，Chad 重触发×3=21；垫牌5 不计
    expect(res(e, R_MULT)).toBe(1);
    expect(res(e, R_HAND_SCORE)).toBe(26);
  });
});
