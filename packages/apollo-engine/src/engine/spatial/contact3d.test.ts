// 3D 逻辑碰撞接触几何（REQ-3D-Collision · P1）。纯函数·确定性。
// 坐标约定：2D Transform.x→世界 X、Transform.y→世界 Z（地面）；垂直/形状全在 Collider3D。
import { describe, it, expect } from 'vitest';
import { contact3d, aabb3dOf, aabb3Overlap } from './contact3d.js';
import type { Transform, Collider3D } from '@engine/protocol/components.js';

const T = (x: number, z: number): Transform => ({ type: 'Transform', x, y: z, rotation: 0, scaleX: 1, scaleY: 1 });
const sphere = (radius: number, baseY = 0): Collider3D => ({ type: 'Collider3D', kind: 'sphere', radius, baseY });
const capsule = (radius: number, height: number, baseY = 0): Collider3D => ({ type: 'Collider3D', kind: 'capsule', radius, height, baseY });
const box = (hx: number, hy: number, hz: number, baseY = 0): Collider3D => ({ type: 'Collider3D', kind: 'box', halfX: hx, halfY: hy, halfZ: hz, baseY });

describe('contact3d · 解析 3D 接触', () => {
  it('球-球：XZ 接近重叠、法线 A→B', () => {
    const hit = contact3d(T(0, 0), sphere(2), T(0, 3), sphere(2)); // 中心相距 3（沿 Z）·r+r=4
    expect(hit).not.toBeNull();
    expect(hit!.depth).toBeCloseTo(1);
    expect(hit!.nz).toBeCloseTo(1); // A→B 沿 +Z
  });

  it('球-球：Y 分离（不同高度）→ 不重叠（真 3D·非 2D 退化）', () => {
    // 同 XZ，A 坐地(center y=2)、B 抬到 baseY=10(center y=12)·相距 10 > r+r=4
    expect(contact3d(T(0, 0), sphere(2, 0), T(0, 0), sphere(2, 10))).toBeNull();
  });

  it('竖直胶囊 vs 盒（角色 vs 墙）：贴近重叠、Y 区间相交', () => {
    const hero = capsule(2, 7, 0); // 角色·XZ 点(0,0)·段 [2,5]
    // 墙盒中心在 Z=2（z 范围 [1,3]）→ XZ 最近 z=1·距 1 < r=2 → 重叠
    const near = contact3d(T(0, 0), hero, T(0, 2), box(3, 3, 1, 0));
    expect(near).not.toBeNull();
    expect(near!.depth).toBeCloseTo(1);
    // 墙盒拉远到 Z=6（z 范围 [5,7]）→ XZ 距 5 > 2 → 不重叠
    expect(contact3d(T(0, 0), hero, T(0, 6), box(3, 3, 1, 0))).toBeNull();
  });

  it('胶囊 vs 盒：盒抬高到角色头顶之上 → Y 分离不重叠', () => {
    const hero = capsule(2, 7, 0); // 段 [2,5]·帽顶 7
    // 盒 baseY=20（远高于角色）·同 XZ → Y 分离
    expect(contact3d(T(0, 0), hero, T(0, 0), box(3, 3, 1, 20))).toBeNull();
  });

  it('盒-盒：3 轴 SAT·最小穿透轴法线', () => {
    const hit = contact3d(T(0, 0), box(3, 3, 3, 0), T(0, 4), box(3, 3, 3, 0)); // Z 向相距 4·半和 6 → 穿透 2
    expect(hit).not.toBeNull();
    expect(hit!.nz).toBe(1);
    expect(hit!.depth).toBeCloseTo(2);
  });

  it('aabb3dOf + aabb3Overlap：宽相位剔除', () => {
    const a = aabb3dOf(T(0, 0), sphere(2));
    const b = aabb3dOf(T(0, 3), sphere(2));
    const far = aabb3dOf(T(100, 100), sphere(2));
    expect(aabb3Overlap(a, b)).toBe(true);
    expect(aabb3Overlap(a, far)).toBe(false);
  });

  it('确定性：同输入逐位同输出（跨端一致基石）', () => {
    const h1 = contact3d(T(1, 2), capsule(2, 7), T(1.5, 3.2), box(3, 3, 1));
    const h2 = contact3d(T(1, 2), capsule(2, 7), T(1.5, 3.2), box(3, 3, 1));
    expect(JSON.stringify(h1)).toBe(JSON.stringify(h2));
  });
});

// ── hull（凸多面体·P2·3D SAT）── 顶点/面法线预烘焙·运行时只平移不旋转（无 sin/cos·确定）。
const C = 0.7071067811865476; // cos45=sin45（绕 Y 转 45°·测试数据·非引擎运行时三角）
// 局部盒（绕原点）：3 单位轴 a0/a1/a2·半尺寸 hx/hy/hz → 8 顶点 ±hx a0 ±hy a1 ±hz a2。axes=面法线。
const hullBox = (hx: number, hy: number, hz: number, axes: number[][], baseY = 0): Collider3D => {
  const [a0, a1, a2] = axes as [number[], number[], number[]];
  const verts: number[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    verts.push(sx * hx * a0[0]! + sy * hy * a1[0]! + sz * hz * a2[0]!);
    verts.push(sx * hx * a0[1]! + sy * hy * a1[1]! + sz * hz * a2[1]!);
    verts.push(sx * hx * a0[2]! + sy * hy * a1[2]! + sz * hz * a2[2]!);
  }
  return { type: 'Collider3D', kind: 'hull', verts, axes: axes.flat(), baseY };
};
const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const YAW45 = [[C, 0, -C], [0, 1, 0], [C, 0, C]]; // 绕 Y 转 45°：XZ 足迹成菱形

describe('contact3d · hull(凸多面体·P2)', () => {
  it('轴对齐 hull 盒 vs 球：贴面重叠、法线 hull→球 沿 +Z、深度可预测', () => {
    const h = hullBox(3, 3, 3, IDENTITY, 0); // 世界 [-3,3]³
    const hit = contact3d(T(0, 0), h, T(0, 4), sphere(2, -2)); // 球心(0,0,4)·面 z=3·距 1 < r=2
    expect(hit).not.toBeNull();
    expect(hit!.depth).toBeCloseTo(1);
    expect(hit!.nz).toBeCloseTo(1);
  });

  it('转过 45° 的 hull（真旋转·非 AABB）：球落在世界 AABB 内但盒外 → SAT 正确判分离', () => {
    const tilted = hullBox(4, 1, 4, YAW45, 0); // XZ 菱形·世界 AABB 半宽≈5.66·真盒面 x+z=5.66
    // 球在 (5,5)：在 AABB 内，但 x+z=10 ≫ 5.66 → 真盒外 → 分离（朴素 AABB 会误判重叠）
    expect(contact3d(T(0, 0), tilted, T(5, 5), sphere(1, -1))).toBeNull();
    // 球在 (2,2)：x+z=4 < 5.66 → 盒内 → 重叠
    expect(contact3d(T(0, 0), tilted, T(2, 2), sphere(1, -1))).not.toBeNull();
  });

  it('hull vs hull：15 轴 SAT·最小穿透轴（轴对齐两盒沿 Z 叠 → +Z 深 2）', () => {
    const a = hullBox(3, 3, 3, IDENTITY, 0);
    const b = hullBox(3, 3, 3, IDENTITY, 0);
    const hit = contact3d(T(0, 0), a, T(0, 4), b); // Z 相距 4·半和 6 → 穿透 2
    expect(hit).not.toBeNull();
    expect(hit!.nz).toBeCloseTo(1);
    expect(hit!.depth).toBeCloseTo(2);
  });

  it('hull vs 竖直胶囊（角色站斜台）：相交则有接触·离开则 null', () => {
    const tilted = hullBox(5, 1, 5, YAW45, 0);
    expect(contact3d(T(0, 0), tilted, T(1, 1), capsule(2, 7, -1))).not.toBeNull(); // 角色压在台上
    expect(contact3d(T(0, 0), tilted, T(40, 40), capsule(2, 7, -1))).toBeNull(); // 走远
  });

  it('确定性：hull 同输入逐位同输出', () => {
    const t = hullBox(4, 1, 4, YAW45, 0);
    const h1 = contact3d(T(0, 0), t, T(2.3, 1.7), sphere(1.5, -1));
    const h2 = contact3d(T(0, 0), t, T(2.3, 1.7), sphere(1.5, -1));
    expect(JSON.stringify(h1)).toBe(JSON.stringify(h2));
  });
});
