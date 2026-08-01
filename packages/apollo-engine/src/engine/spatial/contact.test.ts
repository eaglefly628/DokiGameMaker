import { describe, it, expect } from 'vitest';
import { contactBetween, aabbOf } from './contact.js';
import type { Transform, Shape } from '@engine/protocol/components.js';

const at = (x: number, y: number): Transform => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const square = (half: number): Shape => ({ type: 'Shape', kind: 'polygon', vertices: [-half, -half, half, -half, half, half, -half, half] });
const box = (w: number, h: number): Shape => ({ type: 'Shape', kind: 'box', width: w, height: h });
const circle = (r: number): Shape => ({ type: 'Shape', kind: 'circle', radius: r });

describe('contact SAT — 凸多边形', () => {
  it('两轴对齐方形多边形重叠 → 法线 +x、深度 5（与 AABB 同解）', () => {
    const c = contactBetween(at(0, 0), square(10), at(15, 0), square(10))!;
    expect(c).not.toBeNull();
    expect(c.nx).toBeCloseTo(1);
    expect(c.ny).toBeCloseTo(0);
    expect(c.depth).toBeCloseTo(5);
  });

  it('分离 → null', () => {
    expect(contactBetween(at(0, 0), square(10), at(25, 0), square(10))).toBeNull();
  });

  it('box（盒）当多边形走 SAT，与方形多边形结果一致', () => {
    const c = contactBetween(at(0, 0), box(20, 20), at(15, 0), square(10))!;
    expect(c.nx).toBeCloseTo(1);
    expect(c.depth).toBeCloseTo(5);
  });

  it('多边形 vs 圆：法线 polygon→circle、深度 3（与 box-circle 同解）', () => {
    const c = contactBetween(at(0, 0), square(10), at(15, 0), circle(8))!;
    expect(c.nx).toBeCloseTo(1);
    expect(c.ny).toBeCloseTo(0);
    expect(c.depth).toBeCloseTo(3);
  });

  it('圆 vs 多边形：法线取反为 A→B（circle→polygon = -x）', () => {
    const c = contactBetween(at(15, 0), circle(8), at(0, 0), square(10))!;
    expect(c.nx).toBeCloseTo(-1);
    expect(c.depth).toBeCloseTo(3);
  });

  it('非轴对齐（菱形）重叠：返回 MTV，且按 MTV 推开后不再重叠（自洽）', () => {
    const diamond: Shape = { type: 'Shape', kind: 'polygon', vertices: [0, -14, 14, 0, 0, 14, -14, 0] };
    const c = contactBetween(at(0, 0), box(20, 20), at(15, 0), diamond)!;
    expect(c).not.toBeNull();
    expect(c.depth).toBeGreaterThan(0);
    // 把盒沿 -MTV 推出穿透深度后，应分离
    const pushed = contactBetween(at(-c.nx * c.depth, -c.ny * c.depth), box(20, 20), at(15, 0), diamond);
    expect(pushed === null || pushed.depth < 1e-6).toBe(true);
  });

  it('aabbOf(多边形) = 顶点包围盒（宽相位树用，形状无关）', () => {
    expect(aabbOf(at(100, 50), square(10))).toEqual({ minX: 90, minY: 40, maxX: 110, maxY: 60 });
  });
});
