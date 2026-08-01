// 生成与寿命样例：发射器周期性生成粒子（实体数增长），粒子到期自毁（数量见顶回落/稳定）。
import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import { spawnBlueprint } from './spawn-lab.js';

function entityCount(e: Engine): number {
  // 用 Transform query 数活实体（粒子/发射器都带 Transform；library 不带）。
  return e.world.query('Transform').length;
}

describe('Game I · 生成与寿命样例', () => {
  it('蓝图纯数据：库 + 三发射器（无专属 system）', () => {
    const bp = spawnBlueprint();
    expect(Object.keys(bp.entities)).toEqual(['library', 'emit-l', 'emit-m', 'emit-r']);
  });

  it('生成：tick 一阵后实体数增长（粒子被 caster→prefab 生出来）', () => {
    const e = new Engine();
    e.load(spawnBlueprint());
    const n0 = entityCount(e); // 3 发射器
    for (let i = 0; i < 40; i++) e.world.tick();
    expect(entityCount(e)).toBeGreaterThan(n0); // 多出来的就是粒子
  });

  it('寿命：长跑后粒子数稳定不无限膨胀（到期自毁）', () => {
    const e = new Engine();
    e.load(spawnBlueprint());
    for (let i = 0; i < 200; i++) e.world.tick();
    const a = entityCount(e);
    for (let i = 0; i < 200; i++) e.world.tick();
    const b = entityCount(e);
    // 稳态：生成≈销毁，总量有界（不随时间线性爆炸）。给宽松上界。
    expect(b).toBeLessThan(a + 30);
  });
});
