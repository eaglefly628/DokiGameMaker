import { describe, it, expect } from 'vitest';
import { rollOffer, applyPick, isEligible, type DraftCandidate, type DraftState } from './draft-offer.js';

// draft-offer 纯函数测试（REQ-SURVIVOR编排 E1·对齐 skills 1:1 测试文化）。
// 种子化、确定性、过滤/不重复/槽满/空池边角，无 Math.random。

const state = (owned: Record<string, number> = {}, slots: DraftState['slots'] = {}): DraftState => ({ owned, slots });

const POOL: DraftCandidate[] = [
  { id: 'whip', weight: 10, slot: 'weapon', maxLevel: 5 },
  { id: 'garlic', weight: 10, slot: 'weapon', maxLevel: 5 },
  { id: 'bible', weight: 10, slot: 'weapon', maxLevel: 5 },
  { id: 'armor', weight: 5, slot: 'passive', maxLevel: 5 },
  { id: 'wings', weight: 5, slot: 'passive', maxLevel: 5, requires: ['armor'] },
];

describe('draft-offer.isEligible — 过滤资格', () => {
  it('新项要有空槽：槽满 → 不合格', () => {
    const s = state({}, { weapon: { used: 2, cap: 2 }, passive: { used: 0, cap: 6 } });
    expect(isEligible(POOL[0], s)).toBe(false); // whip=weapon 满
    expect(isEligible(POOL[3], s)).toBe(true); // armor=passive 有位
  });
  it('已满级 → 不合格；已持有未满级 → 合格（可升级·不看槽）', () => {
    const s = state({ whip: 5, garlic: 3 }, { weapon: { used: 2, cap: 2 } });
    expect(isEligible(POOL[0], s)).toBe(false); // whip 满级 5
    expect(isEligible(POOL[1], s)).toBe(true); // garlic 3<5 可升（已持有不占新槽）
  });
  it('前置未满足 → 不合格', () => {
    expect(isEligible(POOL[4], state({}, { passive: { used: 0, cap: 6 } }))).toBe(false); // wings 需 armor
    expect(isEligible(POOL[4], state({ armor: 1 }, { passive: { used: 1, cap: 6 } }))).toBe(true);
  });
  it('weight≤0 → 不合格', () => {
    expect(isEligible({ id: 'x', weight: 0 }, state())).toBe(false);
  });
});

describe('draft-offer.rollOffer — 加权抽 N 不重复', () => {
  it('返回 N 个不重复候选', () => {
    const offer = rollOffer(POOL, state({}, { weapon: { used: 0, cap: 6 }, passive: { used: 0, cap: 6 } }), { n: 3, seed: 42 });
    expect(offer).toHaveLength(3);
    expect(new Set(offer.map((c) => c.id)).size).toBe(3); // 不重复
  });
  it('同种子 → 同 offer（确定性）', () => {
    const s = state({}, { weapon: { used: 0, cap: 6 }, passive: { used: 0, cap: 6 } });
    const a = rollOffer(POOL, s, { n: 3, seed: 7 }).map((c) => c.id);
    const b = rollOffer(POOL, s, { n: 3, seed: 7 }).map((c) => c.id);
    expect(a).toEqual(b);
  });
  it('不同种子 → 通常不同 offer（抽样有效）', () => {
    const s = state({}, { weapon: { used: 0, cap: 6 }, passive: { used: 0, cap: 6 } });
    const a = rollOffer(POOL, s, { n: 2, seed: 1 }).map((c) => c.id).join(',');
    const b = rollOffer(POOL, s, { n: 2, seed: 99999 }).map((c) => c.id).join(',');
    expect(a === b).toBe(false);
  });
  it('槽满排除后只从合格池抽（whip/garlic/bible 满级 → 只剩 passive）', () => {
    const s = state({ whip: 5, garlic: 5, bible: 5, armor: 1 }, { weapon: { used: 3, cap: 3 }, passive: { used: 1, cap: 6 } });
    const offer = rollOffer(POOL, s, { n: 3, seed: 3 });
    expect(offer.map((c) => c.id).sort()).toEqual(['armor', 'wings']); // 只这两合格（<n 返回全部合格）
  });
  it('空池 / n=0 → []', () => {
    expect(rollOffer([], state(), { n: 3, seed: 1 })).toEqual([]);
    expect(rollOffer(POOL, state(), { n: 0, seed: 1 })).toEqual([]);
  });
  it('全不合格 → []', () => {
    const s = state({ whip: 5, garlic: 5, bible: 5, armor: 5 }, { weapon: { used: 3, cap: 3 }, passive: { used: 1, cap: 1 } });
    // wings 需 armor（已满级但持有）→ 但 passive 满且 wings 是新项 → 不合格
    expect(rollOffer(POOL, s, { n: 3, seed: 1 })).toEqual([]);
  });
});

describe('draft-offer.applyPick — 回填', () => {
  it('新项 → 等级置 1 且占其槽（不改入参）', () => {
    const s = state({}, { weapon: { used: 1, cap: 6 } });
    const next = applyPick('whip', POOL[0], s);
    expect(next.owned.whip).toBe(1);
    expect(next.slots.weapon.used).toBe(2);
    expect(s.slots.weapon.used).toBe(1); // 入参不变（纯函数）
  });
  it('已持有 → 升级 +1 且不占新槽', () => {
    const s = state({ whip: 2 }, { weapon: { used: 3, cap: 6 } });
    const next = applyPick('whip', POOL[0], s);
    expect(next.owned.whip).toBe(3);
    expect(next.slots.weapon.used).toBe(3); // 升级不占新格
  });
});
