// TA Phase 0/1：曲线/渐变采样 + Vfx3D render-only（不进 hash）。
import { describe, it, expect } from 'vitest';
import { sampleCurve, sampleGradient } from './curve.js';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/index.js';
import type { Curve, Gradient, Vfx3D } from '@engine/protocol/components.js';

describe('curve/gradient 采样（TA 地基）', () => {
  const c: Curve = { keys: [{ t: 0, v: 0 }, { t: 0.5, v: 1 }, { t: 1, v: 0 }] };
  it('线性插值 + 端点夹取', () => {
    expect(sampleCurve(c, 0)).toBe(0);
    expect(sampleCurve(c, 0.25)).toBeCloseTo(0.5);
    expect(sampleCurve(c, 0.5)).toBe(1);
    expect(sampleCurve(c, 0.75)).toBeCloseTo(0.5);
    expect(sampleCurve(c, -1)).toBe(0); // 夹左
    expect(sampleCurve(c, 2)).toBe(0); // 夹右
    expect(sampleCurve(undefined, 0.5, 0.42)).toBe(0.42); // 无曲线→def
  });
  it('step / smooth 模式', () => {
    expect(sampleCurve({ keys: c.keys, mode: 'step' }, 0.25)).toBe(0); // 取左关键点
    expect(sampleCurve({ keys: c.keys, mode: 'smooth' }, 0.25)).toBeGreaterThan(0); // smoothstep 非线性
  });
  it('渐变：颜色 + alpha 插值', () => {
    const g: Gradient = { stops: [{ t: 0, color: 0x000000, alpha: 1 }, { t: 1, color: 0xffffff, alpha: 0 }] };
    const mid = sampleGradient(g, 0.5);
    expect(mid.r).toBeCloseTo(0.5);
    expect(mid.a).toBeCloseTo(0.5);
    expect(sampleGradient(undefined, 0.5, 0xff0000)).toEqual({ r: 1, g: 0, b: 0, a: 1 }); // 无渐变→fallback 单色
  });
});

describe('Vfx3D = render-only（不进 hash·改它不致 desync）', () => {
  it('加/改 Vfx3D 不改变 world hash', () => {
    const w = new World();
    w.createEntity('fx');
    const h0 = hashSnapshot(w.snapshot());
    w.addComponent('fx', { type: 'Vfx3D', lifetime: 1, rate: 50, color: 0xff0000 } as Vfx3D);
    expect(hashSnapshot(w.snapshot())).toBe(h0); // Vfx3D 被 NON_DETERMINISTIC 排除
  });
});
