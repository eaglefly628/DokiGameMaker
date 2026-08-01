import { describe, it, expect } from 'vitest';
import { renderablePose, poseBounds, fitPerspective, mesh3dDepth, mesh3dBatchKey, flipEuler, faceDown, rayAabbT, type Pose3D } from './three-projection.js';
// 注：新图元几何本身（cylinder/cone/capsule/torus）走 three 内建，需 WebGL 无法 headless 测；此处测其纯函数派生（批签名/包围深度）。
import type { Renderable } from './renderable.js';

const R = (o: Partial<Renderable>): Renderable => ({
  entityId: 'e',
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  zOrder: 0,
  ...o,
});
const P = (o: Partial<Pose3D>): Pose3D => ({ x: 0, y: 0, z: 0, rotZ: 0, sx: 1, sy: 1, ...o });

describe('three-projection — 纯 2D→3D 映射（无 three / 无 WebGL）', () => {
  it('renderablePose：y 翻转、zOrder→z、旋转取负、缩放透传', () => {
    expect(renderablePose(R({ x: 10, y: 20, rotation: 0.5, zOrder: 3, scaleX: 2, scaleY: 3 }), 0.01)).toEqual({
      x: 10,
      y: -20,
      z: 0.03,
      rotZ: -0.5,
      sx: 2,
      sy: 3,
    });
  });

  it('poseBounds：空 → 单位盒；含半尺寸余量', () => {
    expect(poseBounds([])).toEqual({ minX: -1, maxX: 1, minY: -1, maxY: 1 });
    expect(poseBounds([P({ x: 0, y: 0 }), P({ x: 10, y: 4 })], 0.5)).toEqual({
      minX: -0.5,
      maxX: 10.5,
      minY: -0.5,
      maxY: 4.5,
    });
  });

  it('fitPerspective：中心居中、距离>0、盒越大距离越大', () => {
    const small = fitPerspective({ minX: -1, maxX: 1, minY: -1, maxY: 1 }, 50, 1.6);
    const big = fitPerspective({ minX: -10, maxX: 10, minY: -10, maxY: 10 }, 50, 1.6);
    expect(small.cx).toBe(0);
    expect(small.cy).toBe(0);
    expect(small.dist).toBeGreaterThan(0);
    expect(big.dist).toBeGreaterThan(small.dist);
  });

  it('fitPerspective：中心随包围盒平移', () => {
    const fit = fitPerspective({ minX: 4, maxX: 6, minY: 10, maxY: 14 }, 50, 1);
    expect(fit.cx).toBe(5);
    expect(fit.cy).toBe(12);
  });
});

describe('three-projection — Mesh3D（3D 物件即数据）几何/翻面纯函数', () => {
  it('mesh3dDepth：plane→0；box 缺省=短边*0.05（下限 1）；显式 depth 透传', () => {
    expect(mesh3dDepth('plane', 60, 90)).toBe(0);
    expect(mesh3dDepth('box', 60, 90)).toBeCloseTo(3); // min(60,90)*0.05
    expect(mesh3dDepth('box', 60, 90, 5)).toBe(5); // 显式优先
    expect(mesh3dDepth('box', 4, 4)).toBe(1); // 0.2 → 下限 1
    expect(mesh3dDepth('sphere', 5, 5)).toBe(5); // 球：直径=width
  });

  it('mesh3dBatchKey：球同直径同色归一批（shape 进签名→不与盒/片混批）', () => {
    const a = mesh3dBatchKey({ shape: 'sphere', width: 5, height: 5, frontTint: 0xffd991 });
    const b = mesh3dBatchKey({ shape: 'sphere', width: 5, height: 9, frontTint: 0xffd991 }); // height 不影响球批
    const c = mesh3dBatchKey({ shape: 'sphere', width: 6, height: 5, frontTint: 0xffd991 }); // 直径不同 → 不同批
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(mesh3dBatchKey({ shape: 'box', width: 5, height: 5, frontTint: 0xffd991 })); // 与盒不混
  });

  it('flipEuler：缺省绕 x（前后翻）、y 轴可选，另一轴恒 0', () => {
    expect(flipEuler(Math.PI)).toEqual({ x: Math.PI, y: 0 });
    expect(flipEuler(1.2, 'x')).toEqual({ x: 1.2, y: 0 });
    expect(flipEuler(1.2, 'y')).toEqual({ x: 0, y: 1.2 });
  });

  it('faceDown：0/2π=正面朝前(false)；π=反面朝前(true)；负角归一', () => {
    expect(faceDown(0)).toBe(false);
    expect(faceDown(Math.PI)).toBe(true);
    expect(faceDown(Math.PI * 2)).toBe(false);
    expect(faceDown(-Math.PI)).toBe(true); // 归一到 π
    expect(faceDown(0.3)).toBe(false);
  });
});

describe('圆润图元（cylinder/cone/capsule/torus）批签名 + 包围深度', () => {
  const K = (shape: 'cylinder' | 'cone' | 'capsule' | 'torus') => mesh3dBatchKey({ shape, width: 6, height: 8, frontTint: 0x66bb6a });
  it('各图元批签名含 shape+尺寸+色（同款同批·异款分批）', () => {
    expect(K('cylinder')).toBe('cylinder|6|8|6732650');
    expect(K('cone')).toBe('cone|6|8|6732650');
    expect(K('cylinder')).not.toBe(K('cone')); // 形不同 → 分批
    expect(K('capsule')).not.toBe(K('torus'));
    // 同款同尺寸同色 → 同批（可实例化 1 draw call）
    expect(mesh3dBatchKey({ shape: 'cone', width: 6, height: 8, frontTint: 0x66bb6a })).toBe(K('cone'));
  });
  it('包围深度以直径(width)计（相机取景/包围用）', () => {
    for (const s of ['cylinder', 'cone', 'capsule', 'torus'] as const) expect(mesh3dDepth(s, 6, 8)).toBe(6);
  });
});

describe('rayAabbT — 射线-AABB 求交（对象拾取 Pickable3D）', () => {
  // 单位盒在原点 (h=1)。相机在 -Z 沿 +Z 看进去。
  it('正对盒心 → 命中·t=入口距离', () => {
    const t = rayAabbT(0, 0, -5, 0, 0, 1, 0, 0, 0, 1, 1, 1);
    expect(t).toBeCloseTo(4); // -5 → 盒近面 z=-1，距离 4
  });
  it('偏出盒外 → 未命中 null', () => {
    expect(rayAabbT(3, 0, -5, 0, 0, 1, 0, 0, 0, 1, 1, 1)).toBeNull(); // x=3 错过 h=1 的盒
  });
  it('盒在射线反向（相机后）→ null', () => {
    expect(rayAabbT(0, 0, 5, 0, 0, 1, 0, 0, 0, 1, 1, 1)).toBeNull(); // 原点在 +Z、朝 +Z 看，盒在后
  });
  it('原点在盒内 → 贴脸命中 t=0', () => {
    expect(rayAabbT(0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1)).toBe(0);
  });
  it('取最近盒：两盒都命中时 t 更小者更近', () => {
    const near = rayAabbT(0, 0, -5, 0, 0, 1, 0, 0, -2, 1, 1, 1); // 盒心 z=-2
    const far = rayAabbT(0, 0, -5, 0, 0, 1, 0, 0, 3, 1, 1, 1); // 盒心 z=3
    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    expect(near!).toBeLessThan(far!); // 近盒 t 更小 → 拾取选它
  });
  it('斜射线命中偏置盒', () => {
    const t = rayAabbT(0, 0, -5, 0.3, 0, 1, 1.5, 0, 0, 1, 1, 1); // 朝 +x 微偏 → 命中 x∈[0.5,2.5] 的盒
    expect(t).not.toBeNull();
  });
});
