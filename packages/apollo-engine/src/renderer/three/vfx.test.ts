// Vfx3D 点吸引力场（attractor·粒子跟随鼠标聚集）：弹簧力 + drag = 先加速后减速的自然收拢；render-only 不进 hash。
import { describe, it, expect } from 'vitest';
import { integrateParticle } from './vfx.js';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/index.js';
import type { Vfx3D } from '@engine/protocol/components.js';

const at5 = { x: 10, y: 0, z: 0, strength: 5 };
const runToTarget = (): { p: { x: number; vx: number; y: number; z: number }; speeds: number[] } => {
  const p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  const speeds: number[] = [];
  for (let i = 0; i < 600; i++) { integrateParticle(p, 0.03, 0, 3, at5); speeds.push(Math.abs(p.vx)); }
  return { p, speeds };
};

describe('Vfx3D 点吸引力场（attractor·粒子跟随鼠标）', () => {
  it('弹簧力把粒子从原点收拢到吸引点（只沿指向轴被拉·收拢到位）', () => {
    const { p } = runToTarget();
    expect(p.x).toBeGreaterThan(8);           // 收拢到目标(10)附近
    expect(p.x).toBeLessThan(11);             // 阻尼够·不大幅越过后失控
    expect(Math.abs(p.y)).toBeLessThan(0.01); // 吸引点在 y0/z0 → 只在 x 轴被拉
    expect(Math.abs(p.z)).toBeLessThan(0.01);
  });

  it('先加速后减速（自然·不夸张）：速度先升到峰、再降回近 0', () => {
    const { speeds } = runToTarget();
    const peak = Math.max(...speeds);
    const peakIdx = speeds.indexOf(peak);
    expect(peakIdx).toBeGreaterThan(0);                          // 起步是加速（速度峰不在第一帧）
    expect(peakIdx).toBeLessThan(speeds.length - 1);             // 之后减速（峰不在末帧）
    expect(speeds[speeds.length - 1]!).toBeLessThan(peak * 0.25); // 末尾基本停住 = 收拢到位（非无限冲）
  });

  it('无 attractor：不施吸引力（仅 drag 衰减初速·向后兼容）', () => {
    const p = { x: 0, y: 0, z: 0, vx: 4, vy: 0, vz: 0 };
    for (let i = 0; i < 200; i++) integrateParticle(p, 0.05, 0, 2, undefined);
    expect(p.vx).toBeLessThan(0.01); // drag 把初速衰减掉
    expect(p.x).toBeGreaterThan(0);  // 只顺初速飘了一小段·没被拉去别处
    expect(p.x).toBeLessThan(4);
  });

  it('Vfx3D.attractor 是 render-only（不进 determinism hash）', () => {
    const w = new World();
    w.createEntity('dust');
    const h0 = hashSnapshot(w.snapshot());
    w.addComponent('dust', { type: 'Vfx3D', lifetime: 6, attractor: { x: 1, y: 2, z: 3, strength: 5 } } as Vfx3D);
    expect(hashSnapshot(w.snapshot())).toBe(h0); // Vfx3D 整体不进 hash（含 attractor）
  });
});
