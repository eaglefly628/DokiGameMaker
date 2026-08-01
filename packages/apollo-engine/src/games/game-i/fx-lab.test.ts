// 战场特效样例（特效库 B）：定时引爆「爆炸环」prefab——实体数随引爆增长、火花到期自毁、总量有界。
import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import { fxBlueprint } from './fx-lab.js';

function entityCount(e: Engine): number {
  // 火花/核/引爆器都带 Transform；library 不带。
  return e.world.query('Transform').length;
}

describe('Game I · 战场特效样例（库 B）', () => {
  it('蓝图纯数据：库 + 三引爆器（无专属 system·新特效=一份 prefab）', () => {
    const bp = fxBlueprint();
    expect(Object.keys(bp.entities)).toEqual(['library', 'det-l', 'det-m', 'det-r']);
  });

  it('引爆：tick 一阵后实体数增长（caster→爆炸环 prefab 一次展开整圈火花）', () => {
    const e = new Engine();
    e.load(fxBlueprint());
    const n0 = entityCount(e); // 3 引爆器
    for (let i = 0; i < 60; i++) e.world.tick();
    expect(entityCount(e)).toBeGreaterThan(n0); // 多出来的就是火花 + 冲击核
  });

  it('寿命：长跑后总量稳定不无限膨胀（火花到期 lifetime 自毁）', () => {
    const e = new Engine();
    e.load(fxBlueprint());
    for (let i = 0; i < 200; i++) e.world.tick();
    const a = entityCount(e);
    for (let i = 0; i < 200; i++) e.world.tick();
    const b = entityCount(e);
    expect(b).toBeLessThan(a + 40);
  });
});
