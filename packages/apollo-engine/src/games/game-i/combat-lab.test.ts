// 战斗样例：弹道命中 → 扣血 → 死亡（销毁）。纯蓝图 + 现成战斗能力链。
import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import { combatBlueprint } from './combat-lab.js';
import type { Resource } from '@engine/protocol/components.js';

describe('Game I · 战斗结算样例', () => {
  it('蓝图纯数据：三敌 + 三弹道（无专属 system）', () => {
    const bp = combatBlueprint();
    expect(Object.keys(bp.entities)).toEqual(['foe-1', 'foe-2', 'foe-3', 'bolt-1', 'bolt-2', 'bolt-3']);
  });

  it('命中 → 扣血 → 死亡：弹道飞到敌人 → 敌人被销毁', () => {
    const e = new Engine();
    e.load(combatBlueprint());
    expect(e.world.getComponent<Resource>('foe-1', 'Resource')).toBeTruthy(); // 初始在场
    for (let i = 0; i < 220; i++) e.world.tick();
    // 三个敌人都应被打死（销毁后取不到组件）。
    expect(e.world.getComponent<Resource>('foe-1', 'Resource')).toBeUndefined();
    expect(e.world.getComponent<Resource>('foe-2', 'Resource')).toBeUndefined();
    expect(e.world.getComponent<Resource>('foe-3', 'Resource')).toBeUndefined();
  });

  it('DoT：灼烧目标的血在命中后逐拍下降（非一击）', () => {
    const e = new Engine();
    e.load(combatBlueprint());
    let prev = 60, sawGradual = false;
    for (let i = 0; i < 200; i++) {
      e.world.tick();
      const r = e.world.getComponent<Resource>('foe-3', 'Resource');
      if (!r) break;
      if (r.current < prev && r.current > 0) sawGradual = true; // 中途有 0<hp<60 的递减
      prev = r.current;
    }
    expect(sawGradual).toBe(true);
  });
});
