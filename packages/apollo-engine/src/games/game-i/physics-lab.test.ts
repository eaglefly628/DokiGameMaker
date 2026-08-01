// 运动与碰撞样例：motion-apply 推进位移 + overlap-detect 产出 Overlap 对。纯蓝图 + 现成能力。
import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import { physicsBlueprint } from './physics-lab.js';
import type { Transform } from '@engine/protocol/components.js';

describe('Game I · 运动与碰撞样例', () => {
  it('蓝图纯数据：四物体（无专属 system）', () => {
    const bp = physicsBlueprint();
    expect(bp.capabilities.length).toBeGreaterThan(0);
    expect(Object.keys(bp.entities)).toEqual(['body-nw', 'body-ne', 'body-sw', 'body-se']);
  });

  it('motion-apply：tick → Velocity 累加进 Transform（位移）', () => {
    const e = new Engine();
    e.load(physicsBlueprint());
    const x0 = e.world.getComponent<Transform>('body-nw', 'Transform')!.x;
    e.world.tick();
    expect(e.world.getComponent<Transform>('body-nw', 'Transform')!.x).toBeCloseTo(x0 + 1.4, 5);
  });

  it('overlap-detect：交汇后产出 Overlap 对（碰撞检测）', () => {
    const e = new Engine();
    e.load(physicsBlueprint());
    let sawOverlap = false;
    for (let i = 0; i < 220; i++) {
      e.world.tick();
      if (e.world.query('Overlap').length > 0) { sawOverlap = true; break; }
    }
    expect(sawOverlap).toBe(true);
  });
});
