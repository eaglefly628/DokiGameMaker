// 3D 样例：蓝图装进真 ECS → tween 推进 Transform.rotation（翻面角）。WebGL 渲染由 ThreeRenderer 在浏览器做，
// 此处只验证「纯蓝图 + 现成能力」的逻辑面（rotation 被驱动）。
import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import { threeBlueprint } from './three-lab.js';
import type { Transform, Mesh3D } from '@engine/protocol/components.js';

describe('Game I · 3D 渲染样例（Mesh3D 蓝图）', () => {
  it('蓝图纯数据：三个 Mesh3D 物件（无专属 system）', () => {
    const bp = threeBlueprint();
    expect(bp.capabilities.length).toBeGreaterThan(0);
    expect(Object.keys(bp.entities)).toEqual(['card-flip', 'cube-roll', 'plane-tilt']);
  });

  it('每个物件都带 Mesh3D 描述（shape/尺寸/正反色）', () => {
    const e = new Engine();
    e.load(threeBlueprint());
    const m = e.world.getComponent<Mesh3D>('card-flip', 'Mesh3D')!;
    expect(m.shape).toBe('box');
    expect(m.frontTint).not.toBe(m.backTint); // 正反分色
  });

  it('tick → tween 推进 Transform.rotation（翻面角动起来）', () => {
    const e = new Engine();
    e.load(threeBlueprint());
    const r0 = e.world.getComponent<Transform>('card-flip', 'Transform')!.rotation;
    for (let i = 0; i < 20; i++) e.world.tick();
    expect(e.world.getComponent<Transform>('card-flip', 'Transform')!.rotation).toBeGreaterThan(r0);
  });
});
