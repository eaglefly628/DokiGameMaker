// 精灵动画样例：蓝图装进真 ECS（Engine.load）→ world.tick 跑 tween 系统 → 表现字段被推进。
// 验证「纯蓝图数据 + 现成能力」即出动画，无专属 system。
import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import { animBlueprint } from './anim-lab.js';
import type { Transform, Color } from '@engine/protocol/components.js';

describe('Game I · 精灵动画样例（tween 蓝图）', () => {
  it('蓝图纯数据：capabilities + entities（无专属 system）', () => {
    const bp = animBlueprint();
    expect(bp.capabilities.length).toBeGreaterThan(0);
    expect(Object.keys(bp.entities)).toEqual(['anim-patrol', 'anim-breathe', 'anim-spin', 'anim-fade']);
  });

  it('装进真 ECS·tick → tween 推进各表现字段（移动/缩放/旋转/淡入）', () => {
    const e = new Engine();
    e.load(animBlueprint());
    const x0 = e.world.getComponent<Transform>('anim-patrol', 'Transform')!.x;
    const sx0 = e.world.getComponent<Transform>('anim-breathe', 'Transform')!.scaleX;
    for (let i = 0; i < 30; i++) e.world.tick();
    expect(e.world.getComponent<Transform>('anim-patrol', 'Transform')!.x).toBeGreaterThan(x0);       // 巡逻右移
    expect(e.world.getComponent<Transform>('anim-breathe', 'Transform')!.scaleX).not.toBe(sx0);        // 呼吸缩放
    expect(e.world.getComponent<Transform>('anim-spin', 'Transform')!.rotation).toBeGreaterThan(0);    // 自转
    expect(e.world.getComponent<Color>('anim-fade', 'Color')!.alpha).toBeGreaterThan(0.12);            // 淡入
  });

  it('pingpong 巡逻：跑完一程后回折（不越界）', () => {
    const e = new Engine();
    e.load(animBlueprint());
    for (let i = 0; i < 240; i++) e.world.tick(); // 两程
    const x = e.world.getComponent<Transform>('anim-patrol', 'Transform')!.x;
    expect(x).toBeGreaterThanOrEqual(80);
    expect(x).toBeLessThanOrEqual(560);
  });
});
