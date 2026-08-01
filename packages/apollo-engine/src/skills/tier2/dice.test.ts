import { describe, it, expect } from 'vitest';
import type { RandomSeed, DieSpec, RolledDie } from '@engine/protocol/components.js';
import { rollDicePool, applyBanFilter, opposedRoll, OPPOSED_MAX_REROLL } from './dice.js';

// 骰能力族纯函数测试（对齐 skills 1:1 测试文化）。种子化、确定性、无 Math.random。
const seed = (s: number): RandomSeed => ({ type: 'RandomSeed', seed: s, sequence: 0 });
const d6 = (el?: number): DieSpec => ({ faces: [1, 2, 3, 4, 5, 6].map((v) => (el === undefined ? { value: v } : { value: v, element: el })) });

describe('dice.rollDicePool — 掷骰池 / 锁定重掷', () => {
  it('同种子 → 同结果（确定性）', () => {
    const pool = [d6(), d6(), d6()];
    expect(rollDicePool(pool, new Set(), undefined, seed(12345))).toEqual(rollDicePool(pool, new Set(), undefined, seed(12345)));
  });
  it('faceIndex/value 合法、element 透传', () => {
    const a = rollDicePool([d6(3)], new Set(), undefined, seed(7));
    expect(a[0].faceIndex).toBeGreaterThanOrEqual(0);
    expect(a[0].faceIndex).toBeLessThan(6);
    expect(a[0].value).toBe(a[0].faceIndex + 1);
    expect(a[0].element).toBe(3);
  });
  it('锁定位保留、只重掷未锁（rng 仅推进 #未锁）', () => {
    const pool = [d6(), d6(), d6(), d6()];
    const rng = seed(999);
    const r1 = rollDicePool(pool, new Set(), undefined, rng);
    expect(rng.sequence).toBe(4);
    const before = rng.sequence;
    const r2 = rollDicePool(pool, new Set([0, 2]), r1, rng);
    expect(rng.sequence - before).toBe(2); // 仅下标 1、3 重掷
    expect(r2[0].value).toBe(r1[0].value);
    expect(r2[0].faceIndex).toBe(r1[0].faceIndex);
    expect(r2[2].value).toBe(r1[2].value);
    expect(r2[2].faceIndex).toBe(r1[2].faceIndex);
  });
  it('锁定下标但无前值（首掷）→ 照常掷', () => {
    const rng = seed(3);
    const r = rollDicePool([d6(), d6()], new Set([0, 1]), undefined, rng);
    expect(r).toHaveLength(2);
    expect(rng.sequence).toBe(2); // 两颗都掷了（无前值可保留）
  });
});

describe('dice.applyBanFilter — 结算前禁骰边界', () => {
  const mk = (vals: number[]): RolledDie[] => vals.map((v, i) => ({ value: v, faceIndex: i }));
  it('banHighest n=2 → 最高两颗 banned（保留在 results）', () => {
    const r = mk([3, 1, 5, 2]);
    applyBanFilter(r, { kind: 'banHighest', n: 2 });
    expect(r.map((x) => !!x.banned)).toEqual([true, false, true, false]);
    expect(r).toHaveLength(4);
  });
  it('banLowest n=2 → 最低两颗 banned', () => {
    const r = mk([3, 1, 5, 2]);
    applyBanFilter(r, { kind: 'banLowest', n: 2 });
    expect(r.map((x) => !!x.banned)).toEqual([false, true, false, true]);
  });
  it('n=0 → 全不禁', () => {
    const r = mk([3, 1, 5, 2]);
    applyBanFilter(r, { kind: 'banHighest', n: 0 });
    expect(r.some((x) => x.banned)).toBe(false);
  });
  it('n≥骰数 → 全禁', () => {
    const r = mk([3, 1, 5]);
    applyBanFilter(r, { kind: 'banLowest', n: 9 });
    expect(r.every((x) => x.banned)).toBe(true);
  });
  it('undefined ban → 清空既有 banned（幂等重算）', () => {
    const r = mk([3, 1]);
    r[0].banned = true;
    applyBanFilter(r, undefined);
    expect(r.some((x) => x.banned)).toBe(false);
  });
  it('同值 tie-break 按下标升序', () => {
    const r = mk([4, 4, 2]);
    applyBanFilter(r, { kind: 'banHighest', n: 1 });
    expect(r.map((x) => !!x.banned)).toEqual([true, false, false]);
  });
});

describe('dice.opposedRoll — 对掷平局阶梯', () => {
  it('确定性：同种子同结果', () => {
    expect(opposedRoll(seed(42), 6, 4, 'reroll')).toEqual(opposedRoll(seed(42), 6, 4, 'reroll'));
  });
  it('rollerWins：强制平局(1v1) → A 胜、rerolls 0', () => {
    expect(opposedRoll(seed(1), 1, 1, 'rollerWins')).toEqual({ winner: 'A', rollA: 1, rollB: 1, rerolls: 0 });
  });
  it('defenderWins：强制平局(1v1) → B 胜', () => {
    expect(opposedRoll(seed(1), 1, 1, 'defenderWins').winner).toBe('B');
  });
  it('reroll：强制平局(1v1) → 触安全阀终结于 A（rerolls=上限+1）', () => {
    const r = opposedRoll(seed(1), 1, 1, 'reroll');
    expect(r.winner).toBe('A');
    expect(r.rerolls).toBe(OPPOSED_MAX_REROLL + 1);
  });
  it('reroll：守方 pB=1 恒掷 1 → 掷者必胜且 rollA>rollB', () => {
    const r = opposedRoll(seed(5), 6, 1, 'reroll');
    expect(r.winner).toBe('A');
    expect(r.rollA).toBeGreaterThan(r.rollB);
  });
  it('战力越高地板越高：pA=20 vs pB=1，掷者胜', () => {
    expect(opposedRoll(seed(11), 20, 1, 'rollerWins').winner).toBe('A');
  });
});
