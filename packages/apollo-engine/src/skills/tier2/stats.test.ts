import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Stats, StatModifier } from '@engine/protocol/components.js';
import { statsCapability, computeEffective } from './stats.js';

describe('stats — computeEffective 纯折算', () => {
  it('无修正 → effective = base', () => {
    expect(computeEffective({ attack: 10, maxHp: 100 }, [])).toEqual({ attack: 10, maxHp: 100 });
  });

  it('加值：+50 maxHp', () => {
    const mods: StatModifier[] = [{ stat: 'maxHp', add: 50, source: 'ring1' }];
    expect(computeEffective({ maxHp: 100 }, mods).maxHp).toBe(150);
  });

  it('乘值：×1.2 移速', () => {
    expect(computeEffective({ moveSpeed: 10 }, [{ stat: 'moveSpeed', mul: 1.2, source: 'haste' }]).moveSpeed).toBeCloseTo(12);
  });

  it('加后乘：(base+Σadd)×Πmul', () => {
    const mods: StatModifier[] = [
      { stat: 'attack', add: 10, source: 'a' },
      { stat: 'attack', mul: 2, source: 'b' },
    ];
    expect(computeEffective({ attack: 5 }, mods).attack).toBe(30); // (5+10)*2
  });

  it('多来源同 stat 累加 / 多 stat 各算', () => {
    const mods: StatModifier[] = [
      { stat: 'attack', add: 3, source: 'r1' },
      { stat: 'attack', add: 4, source: 'r2' },
      { stat: 'maxHp', add: 20, source: 'r1' },
    ];
    const e = computeEffective({ attack: 10, maxHp: 100 }, mods);
    expect(e.attack).toBe(17);
    expect(e.maxHp).toBe(120);
  });

  it('mod 涉及 base 没有的 stat → 当 base 0 算', () => {
    expect(computeEffective({}, [{ stat: 'crit', add: 0.25, source: 'gem' }]).crit).toBeCloseTo(0.25);
  });
});

describe('stats — stat-apply 系统 + 来源增删', () => {
  function statWorld(): World {
    const w = new World();
    for (const s of statsCapability.systems) w.addSystem(s);
    w.createEntity('hero');
    w.addComponent('hero', { type: 'Stats', base: { maxHp: 100, attack: 10 }, mods: [], effective: {} } as Stats);
    return w;
  }
  const eff = (w: World): Record<string, number> => w.getComponent<Stats>('hero', 'Stats')!.effective;

  it('每帧重算 effective', () => {
    const w = statWorld();
    w.tick();
    expect(eff(w)).toEqual({ maxHp: 100, attack: 10 });
  });

  it('装备(push mod by source) → 次帧 effective 反映；卸下(按 source 滤) → 复原', () => {
    const w = statWorld();
    const s = w.getComponent<Stats>('hero', 'Stats')!;
    s.mods.push({ stat: 'maxHp', add: 50, source: 'ring_of_vigor' });
    s.mods.push({ stat: 'attack', mul: 1.5, source: 'ring_of_vigor' });
    w.tick();
    expect(eff(w).maxHp).toBe(150);
    expect(eff(w).attack).toBe(15);
    // 卸下戒指 = 按 source 滤除
    s.mods = s.mods.filter((m) => m.source !== 'ring_of_vigor');
    w.tick();
    expect(eff(w).maxHp).toBe(100); // 复原（幂等重算，无漂移）
    expect(eff(w).attack).toBe(10);
  });
});
