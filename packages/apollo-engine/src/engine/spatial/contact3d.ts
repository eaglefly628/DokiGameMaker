import type { Transform, Collider3D } from '@engine/protocol/components.js';
import { boxToPoly, satPolyPoly3, satPolySphere3, type Poly, type V3 } from './sat3d.js';

// ═══════════════════════════════════════════════════════════════
//  3D 逻辑碰撞 · 接触几何（REQ-3D-Collision · P1 + P2·hull）。
//  镜像 2D `contact.ts`：纯函数、确定性（**只用 +−×÷/sqrt/min/max·无 sin/cos/hypot** → 跨机逐位一致）。
//
//  **确定性位置模型**：碰撞读 **2D `Transform`(进 hash·x→X、y→Z 地面) + `Collider3D` 数据(进 hash·3D 形状 + Y)**——
//  **不碰 render-only 的 Transform3D**（那不进 hash）。胶囊限定**竖直(Y 轴)**（角色标准）→ 各测试退化为
//  「XZ 平面距离 + Y 区间」全解析。四档图元：sphere / box(AABB) / capsule(竖直) / **hull(凸多面体·P2)**，
//  覆盖角色 vs 关卡 + 触发区 + 斜坡/斜墙。hull 走 SAT（`sat3d.ts`），其余走解析最近距离（保持 P1 逐位不变）。
// ═══════════════════════════════════════════════════════════════

export interface Contact3 {
  nx: number; // 分离法线（A→B·单位向量）
  ny: number;
  nz: number;
  depth: number; // 穿透深度
}
export interface Aabb3 {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

// 归一化碰撞体（世界空间）：点(sphere)/竖直段(capsule)/盒(AABB)/凸多面体(hull)。半径 r 对 box/hull=0。
type C3 =
  | { t: 'pt'; x: number; y: number; z: number; r: number }
  | { t: 'seg'; x: number; z: number; y0: number; y1: number; r: number } // 竖直胶囊：XZ 固定一点、Y 段 [y0,y1]
  | { t: 'box'; min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
  | { t: 'hull'; poly: Poly }; // 凸多面体（预烘焙世界顶点 + 面法线·P2）
// 解析路径（P1）只见这三档；hull 单独走 SAT。
type CoreC3 = Extract<C3, { t: 'pt' | 'seg' | 'box' }>;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// 碰撞体世界位置：planar 取 2D Transform（x→X、y→Z），垂直全取 Collider3D（baseY/height/radius·进 hash）。
function toC3(t: Transform, c: Collider3D): C3 {
  const x = t.x + (c.offsetX ?? 0);
  const z = t.y + (c.offsetZ ?? 0); // 2D Transform.y = 地面 Z
  const baseY = c.baseY ?? 0;
  if (c.kind === 'sphere') {
    const r = c.radius ?? 0;
    return { t: 'pt', x, y: baseY + r, z, r };
  }
  if (c.kind === 'capsule') {
    const r = c.radius ?? 0;
    const h = c.height ?? 2 * r;
    const y0 = baseY + r;
    const y1 = Math.max(y0, baseY + h - r); // 段端点（不含半球帽）；h<2r 退化成球
    return { t: 'seg', x, z, y0, y1, r };
  }
  if (c.kind === 'hull') {
    // 局部顶点 + 世界原点(x, baseY, z) → 世界顶点（只平移·不旋转·朝向已烘进顶点数据）。面法线轴随数据（朝向无关平移）。
    const vf = c.verts ?? [], af = c.axes ?? [];
    const verts: V3[] = [];
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i + 2 < vf.length; i += 3) {
      const wx = x + vf[i]!, wy = baseY + vf[i + 1]!, wz = z + vf[i + 2]!;
      verts.push({ x: wx, y: wy, z: wz }); sx += wx; sy += wy; sz += wz;
    }
    const axes: V3[] = [];
    for (let i = 0; i + 2 < af.length; i += 3) axes.push({ x: af[i]!, y: af[i + 1]!, z: af[i + 2]! });
    const n = Math.max(1, verts.length);
    return { t: 'hull', poly: { verts, axes, c: { x: sx / n, y: sy / n, z: sz / n } } };
  }
  // box：center Y = baseY + halfY（下沿坐 baseY）
  const hx = c.halfX ?? 0, hy = c.halfY ?? 0, hz = c.halfZ ?? 0;
  const cy = baseY + hy;
  return { t: 'box', min: { x: x - hx, y: cy - hy, z: z - hz }, max: { x: x + hx, y: cy + hy, z: z + hz } };
}

// 实体世界 AABB（宽相位用·含半径膨胀）。
export function aabb3dOf(t: Transform, c: Collider3D): Aabb3 {
  const s = toC3(t, c);
  if (s.t === 'pt') return { minX: s.x - s.r, minY: s.y - s.r, minZ: s.z - s.r, maxX: s.x + s.r, maxY: s.y + s.r, maxZ: s.z + s.r };
  if (s.t === 'seg') return { minX: s.x - s.r, minY: s.y0 - s.r, minZ: s.z - s.r, maxX: s.x + s.r, maxY: s.y1 + s.r, maxZ: s.z + s.r };
  if (s.t === 'hull') {
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (const v of s.poly.verts) {
      if (v.x < mnx) mnx = v.x; if (v.y < mny) mny = v.y; if (v.z < mnz) mnz = v.z;
      if (v.x > mxx) mxx = v.x; if (v.y > mxy) mxy = v.y; if (v.z > mxz) mxz = v.z;
    }
    return { minX: mnx, minY: mny, minZ: mnz, maxX: mxx, maxY: mxy, maxZ: mxz };
  }
  return { minX: s.min.x, minY: s.min.y, minZ: s.min.z, maxX: s.max.x, maxY: s.max.y, maxZ: s.max.z };
}

export function aabb3Overlap(a: Aabb3, b: Aabb3): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

// 核心：把每对图元归约为「核心形状最近距离 + (rA+rB)」。核心=点/竖直段/盒。重叠→法线(A→B)+深度，否则 null。
export function contact3d(at: Transform, ac: Collider3D, bt: Transform, bc: Collider3D): Contact3 | null {
  const a = toC3(at, ac);
  const b = toC3(bt, bc);
  // hull 介入 → SAT 路（`sat3d.ts`）；否则保持 P1 解析最近距离（逐位不变）。
  if (a.t === 'hull' || b.t === 'hull') return contactHull(a, b);
  if (a.t === 'box' && b.t === 'box') return boxBox(a, b);
  // 至少一方有半径：核心最近向量（A→B）+ 合并半径。
  const cd = coreDist(a, b);
  if (!cd) return null;
  const rsum = radiusOf(a) + radiusOf(b);
  const depth = rsum - cd.dist;
  if (depth <= 0) return null;
  // 法线：核心间方向（A→B）。dist=0（核心重合）退化给 +Y（竖直分离·稳定）。
  if (cd.dist === 0) return { nx: 0, ny: 1, nz: 0, depth };
  return { nx: cd.dx / cd.dist, ny: cd.dy / cd.dist, nz: cd.dz / cd.dist, depth };
}

// hull 参与的接触：把对方也化成多面体/球，走 3D SAT。返回法线统一 A→B。
function contactHull(a: C3, b: C3): Contact3 | null {
  const aP = asPoly(a), bP = asPoly(b);
  if (aP && bP) return satPolyPoly3(aP, bP); // 多面体 vs 多面体（含 box 转多面体）
  // 恰一方是多面体，另一方是 球/竖直段（胶囊）。
  const poly = aP ?? bP!;
  // 非多面体的那个 = pt 或 seg（box/hull 已被 asPoly 吸收·此处必为球/段）。
  const small = (aP ? b : a) as Extract<C3, { t: 'pt' | 'seg' }>;
  // 段（胶囊）→ 取段上离多面体心最近的 Y 的单球（轻量·够角色站台/撞墙·保守）。
  const cy = small.t === 'seg' ? clamp(poly.c.y, small.y0, small.y1) : small.y;
  const sep = satPolySphere3(poly, { x: small.x, y: cy, z: small.z }, small.r); // 法线 = 多面体→球
  if (!sep) return null;
  // satPolySphere3 给的是 poly→球。poly 就是 a → 已是 A→B；否则 poly 是 b → 取反成 A→B。
  return aP ? sep : { nx: -sep.nx, ny: -sep.ny, nz: -sep.nz, depth: sep.depth };
}

// C3 → 多面体（hull 直取；box 转 8 顶点 + 3 轴）；pt/seg 返回 null（走球路）。
function asPoly(s: C3): Poly | null {
  if (s.t === 'hull') return s.poly;
  if (s.t === 'box') return boxToPoly(s.min, s.max);
  return null;
}

const radiusOf = (s: CoreC3): number => (s.t === 'box' ? 0 : s.r);

// 核心形状最近向量（A→B）+ 距离。box 当核心盒（r=0）。
function coreDist(a: CoreC3, b: CoreC3): { dist: number; dx: number; dy: number; dz: number } | null {
  // 取 A、B 的「最近点对」近似：对 pt/seg/box 组合分别求 A 上离 B 最近的点 与 B 上离 A 最近的点。
  // 因竖直段 + 轴对齐盒，最近向量可解析求得。
  const pa = nearestPointTo(a, centerish(b));
  const pb = nearestPointTo(b, pa);
  const pa2 = nearestPointTo(a, pb); // 一次回代精炼（段/盒足够）
  const dx = pb.x - pa2.x, dy = pb.y - pa2.y, dz = pb.z - pa2.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return { dist, dx, dy, dz };
}

// 形状上离给定点 p 最近的点（pt=自身；seg=竖直段上 clamp；box=AABB clamp）。
function nearestPointTo(s: CoreC3, p: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  if (s.t === 'pt') return { x: s.x, y: s.y, z: s.z };
  if (s.t === 'seg') return { x: s.x, y: clamp(p.y, s.y0, s.y1), z: s.z };
  return { x: clamp(p.x, s.min.x, s.max.x), y: clamp(p.y, s.min.y, s.max.y), z: clamp(p.z, s.min.z, s.max.z) };
}

// 形状的代表点（迭代起点）：pt=点·seg=段中点·box=盒心。
function centerish(s: CoreC3): { x: number; y: number; z: number } {
  if (s.t === 'pt') return { x: s.x, y: s.y, z: s.z };
  if (s.t === 'seg') return { x: s.x, y: (s.y0 + s.y1) / 2, z: s.z };
  return { x: (s.min.x + s.max.x) / 2, y: (s.min.y + s.max.y) / 2, z: (s.min.z + s.max.z) / 2 };
}

// 盒-盒：3 轴 SAT，返回最小穿透轴法线（A→B）+ 深度。
function boxBox(a: Extract<C3, { t: 'box' }>, b: Extract<C3, { t: 'box' }>): Contact3 | null {
  const ox = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const oy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  const oz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  if (ox <= 0 || oy <= 0 || oz <= 0) return null;
  const acx = (a.min.x + a.max.x) / 2, bcx = (b.min.x + b.max.x) / 2;
  const acy = (a.min.y + a.max.y) / 2, bcy = (b.min.y + b.max.y) / 2;
  const acz = (a.min.z + a.max.z) / 2, bcz = (b.min.z + b.max.z) / 2;
  if (ox <= oy && ox <= oz) return { nx: bcx < acx ? -1 : 1, ny: 0, nz: 0, depth: ox };
  if (oy <= ox && oy <= oz) return { nx: 0, ny: bcy < acy ? -1 : 1, nz: 0, depth: oy };
  return { nx: 0, ny: 0, nz: bcz < acz ? -1 : 1, depth: oz };
}
