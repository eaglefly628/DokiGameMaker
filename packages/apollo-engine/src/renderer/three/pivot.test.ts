// Pivot3D 父合成矩阵（绕 center 转/缩 + 平移）+ 缓动 + render-only 不进 hash。
import { describe, it, expect } from 'vitest';
import { pivotMatrix, applyPivot } from './pivot.js';
import { easeOutBack, easeCubicOut } from '../three-projection.js';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/index.js';
import type { Pivot3D } from '@engine/protocol/components.js';
import type { Pose3D } from '../three-projection.js';

const pose = (x: number, y: number, z: number, extra: Partial<Pose3D> = {}): Pose3D =>
  ({ x, y, z, rotZ: 0, sx: 1, sy: 1, sz: 1, ...extra });
const P0 = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1 };

describe('pivotMatrix / applyPivot（3D 父合成矩阵）', () => {
  it('恒等：pivot 无变换 → 子实体位姿不变', () => {
    const out = applyPivot(pivotMatrix(P0, 0, 0, 0), pose(3, 1, -2));
    expect(out.x).toBeCloseTo(3); expect(out.y).toBeCloseTo(1); expect(out.z).toBeCloseTo(-2);
    expect(out.sx).toBeCloseTo(1);
  });
  it('绕 Y 转 90°（中心原点）：子(1,0,0) → (0,0,-1)', () => {
    const out = applyPivot(pivotMatrix({ ...P0, rotY: Math.PI / 2 }, 0, 0, 0), pose(1, 0, 0));
    expect(out.x).toBeCloseTo(0); expect(out.z).toBeCloseTo(-1);
  });
  it('绕非原点 center 转 180°：中心(5,0,0)·子(6,0,0) → 镜像到 (4,0,0)', () => {
    const out = applyPivot(pivotMatrix({ ...P0, rotY: Math.PI }, 5, 0, 0), pose(6, 0, 0));
    expect(out.x).toBeCloseTo(4); expect(out.z).toBeCloseTo(0);
  });
  it('绕 center 缩放：scale 0.5·子(2,0,0) → (1,0,0)·尺度 0.5', () => {
    const out = applyPivot(pivotMatrix({ ...P0, scale: 0.5 }, 0, 0, 0), pose(2, 0, 0));
    expect(out.x).toBeCloseTo(1); expect(out.sx).toBeCloseTo(0.5);
  });
  it('pivot 平移 y+3 → 子上移 3（螺旋升走）', () => {
    const out = applyPivot(pivotMatrix({ ...P0, y: 3 }, 0, 0, 0), pose(0, 1, 0));
    expect(out.y).toBeCloseTo(4);
  });
});

describe('缓动 easeCubicOut / easeOutBack', () => {
  it('端点：0→0 · 1→1', () => {
    expect(easeCubicOut(0)).toBeCloseTo(0); expect(easeCubicOut(1)).toBeCloseTo(1);
    expect(easeOutBack(0)).toBeCloseTo(0); expect(easeOutBack(1)).toBeCloseTo(1);
  });
  it('eOutBack 中途过冲 >1（回弹特征）', () => {
    let over = false;
    for (let p = 0.6; p < 1; p += 0.05) if (easeOutBack(p) > 1.0) over = true;
    expect(over).toBe(true);
  });
  it('cubicOut 减速：中点 >0.5', () => { expect(easeCubicOut(0.5)).toBeGreaterThan(0.5); });
});

describe('Pivot3D 是 render-only（不进 hash）', () => {
  it('挂 Pivot3D 不改变快照哈希', () => {
    const w = new World(); w.createEntity('p');
    const h0 = hashSnapshot(w.snapshot());
    w.addComponent('p', { type: 'Pivot3D', children: ['a', 'b'] } as Pivot3D);
    expect(hashSnapshot(w.snapshot())).toBe(h0);
  });
});
