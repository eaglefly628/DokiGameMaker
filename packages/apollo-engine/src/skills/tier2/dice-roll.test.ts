import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { DicePool, RolledDice, RandomSeed, Signal, DieSpec } from '@engine/protocol/components.js';
import { diceRollCapability } from './dice-roll.js';

// dice-roll 系统级测试：信号触发 / 确定性 / 锁定重掷 / 结算前禁骰 / fail-closed。
const d6 = (el?: number): DieSpec => ({ faces: [1, 2, 3, 4, 5, 6].map((v) => (el === undefined ? { value: v } : { value: v, element: el })) });
const fixed = (v: number): DieSpec => ({ faces: [{ value: v }] }); // 单面骰：掷必得 v（去随机，钉死禁骰次序）

function loadDice(pool: Partial<DicePool> & { dice: DieSpec[] }, seedVal = 12345, withSignal = true): World {
  const w = new World();
  for (const s of diceRollCapability.systems) w.addSystem(s);
  w.createEntity('rng');
  w.addComponent('rng', { type: 'RandomSeed', seed: seedVal, sequence: 0 } as RandomSeed);
  w.createEntity('cup');
  w.addComponent('cup', { type: 'DicePool', rollOnSignal: 'roll', ...pool } as DicePool);
  if (withSignal) {
    w.createEntity('sig');
    w.addComponent('sig', { type: 'Signal', name: 'roll', source: 'test' } as Signal);
  }
  return w;
}
const rolled = (w: World): RolledDice | undefined => w.getComponent<RolledDice>('cup', 'RolledDice');

describe('dice-roll system — 掷骰池', () => {
  it('收到 rollOnSignal → 写 RolledDice（长度=骰数、faceIndex 合法）', () => {
    const w = loadDice({ dice: [d6(), d6(), d6()] });
    w.tick();
    const r = rolled(w)!;
    expect(r.results).toHaveLength(3);
    for (const d of r.results) {
      expect(d.faceIndex).toBeGreaterThanOrEqual(0);
      expect(d.faceIndex).toBeLessThan(6);
      expect(d.value).toBe(d.faceIndex + 1);
    }
  });

  it('无信号 → 不掷（无 RolledDice）', () => {
    const w = loadDice({ dice: [d6()] }, 12345, false);
    w.tick();
    expect(rolled(w)).toBeUndefined();
  });

  it('无 RandomSeed → fail-closed 不掷', () => {
    const w = new World();
    for (const s of diceRollCapability.systems) w.addSystem(s);
    w.createEntity('cup');
    w.addComponent('cup', { type: 'DicePool', dice: [d6()], rollOnSignal: 'roll' } as DicePool);
    w.createEntity('sig');
    w.addComponent('sig', { type: 'Signal', name: 'roll', source: 't' } as Signal);
    w.tick();
    expect(rolled(w)).toBeUndefined();
  });

  it('确定性：同种子两世界 → 同结果', () => {
    const a = loadDice({ dice: [d6(1), d6(2), d6(3)] }, 777);
    a.tick();
    const b = loadDice({ dice: [d6(1), d6(2), d6(3)] }, 777);
    b.tick();
    expect(rolled(a)!.results).toEqual(rolled(b)!.results);
  });

  it('element 透传', () => {
    const w = loadDice({ dice: [d6(5)] });
    w.tick();
    expect(rolled(w)!.results[0].element).toBe(5);
  });

  it('锁定重掷：locked 位跨两拍保留、未锁位重掷', () => {
    const w = loadDice({ dice: [d6(), d6(), d6(), d6()] }, 55);
    w.tick();
    const r1 = rolled(w)!.results.map((d) => ({ ...d }));
    w.getComponent<DicePool>('cup', 'DicePool')!.locked = [0, 2];
    w.tick();
    const r2 = rolled(w)!.results;
    expect(r2[0].value).toBe(r1[0].value);
    expect(r2[0].faceIndex).toBe(r1[0].faceIndex);
    expect(r2[2].value).toBe(r1[2].value);
    expect(r2[2].faceIndex).toBe(r1[2].faceIndex);
  });

  it('结算前禁最高 2 颗 → banned 标记且保留在 results', () => {
    const w = loadDice({ dice: [fixed(3), fixed(1), fixed(5), fixed(2)], ban: { kind: 'banHighest', n: 2 } });
    w.tick();
    const r = rolled(w)!.results;
    expect(r.map((d) => !!d.banned)).toEqual([true, false, true, false]); // 5、3 被禁
    expect(r).toHaveLength(4); // 不移出
  });

  it('禁最低 1 颗（foe 数据驱动）', () => {
    const w = loadDice({ dice: [fixed(3), fixed(1), fixed(5)], ban: { kind: 'banLowest', n: 1 } });
    w.tick();
    expect(rolled(w)!.results.map((d) => !!d.banned)).toEqual([false, true, false]); // 1 被禁
  });
});
