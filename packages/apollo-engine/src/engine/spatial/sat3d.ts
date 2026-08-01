// ═══════════════════════════════════════════════════════════════
//  3D 分离轴定理（SAT）· 凸多面体接触（REQ-3D-Collision · P2·hull）。
//  镜像 2D `contact.ts` 的 satPolyPoly / satPolyCircle，升到 3D：
//   · 多面体 vs 多面体：分离轴 = A 面法线 ∪ B 面法线 ∪ **边×边叉积轴**（盒/OBB/斜坡的精确 15 轴判定）。
//   · 多面体 vs 球：分离轴 = 多面体面法线 ∪ (最近顶点→球心)（同 2D satPolyCircle）。
//  **确定性**：只用 +−×÷/sqrt/min/max + 叉积（×−）——**无 sin/cos/hypot** → 跨机逐位一致。
//  顶点/面法线是**预烘焙数据**（运行时只投影、不旋转），旋转难题在数据层就解决了。
// ═══════════════════════════════════════════════════════════════

export interface V3 { x: number; y: number; z: number; }
export interface Poly { verts: readonly V3[]; axes: readonly V3[]; c: V3; } // c=质心（定向用）
export interface Sep { nx: number; ny: number; nz: number; depth: number; } // 分离法线 + 穿透深度

const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;

// 轴对齐盒 → 多面体（8 顶点 + 3 面法线）。供 hull 与 box 走同一 SAT 路。
export function boxToPoly(min: V3, max: V3): Poly {
  const verts: V3[] = [
    { x: min.x, y: min.y, z: min.z }, { x: max.x, y: min.y, z: min.z },
    { x: min.x, y: max.y, z: min.z }, { x: max.x, y: max.y, z: min.z },
    { x: min.x, y: min.y, z: max.z }, { x: max.x, y: min.y, z: max.z },
    { x: min.x, y: max.y, z: max.z }, { x: max.x, y: max.y, z: max.z },
  ];
  const axes: V3[] = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }];
  const c: V3 = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
  return { verts, axes, c };
}

// 顶点集在轴 ax 上的投影区间。
function project(verts: readonly V3[], ax: V3): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (const v of verts) {
    const d = dot(v, ax);
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

// 边×边叉积轴（A、B 各面法线两两叉积·归一化·跳退化平行）。盒/OBB 的面法线方向 = 其唯一边方向 → 够精确。
function crossAxes(a: readonly V3[], b: readonly V3[]): V3[] {
  const out: V3[] = [];
  for (const u of a) for (const w of b) {
    const cx = u.y * w.z - u.z * w.y, cy = u.z * w.x - u.x * w.z, cz = u.x * w.y - u.y * w.x;
    const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (len > 1e-9) out.push({ x: cx / len, y: cy / len, z: cz / len }); // 平行(len≈0)→无新轴·确定性阈值
  }
  return out;
}

// 多面体 vs 多面体：15 轴 SAT。重叠 → 最小穿透轴法线（定向 A→B）+ 深度；存在分离轴 → null。
export function satPolyPoly3(A: Poly, B: Poly): Sep | null {
  const axes = [...A.axes, ...B.axes, ...crossAxes(A.axes, B.axes)];
  let minOv = Infinity, n: V3 = { x: 0, y: 1, z: 0 };
  for (const ax of axes) {
    const pa = project(A.verts, ax), pb = project(B.verts, ax);
    const ov = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min);
    if (ov <= 0) return null; // 分离轴
    if (ov < minOv) { minOv = ov; n = ax; }
  }
  // 定向 A→B（让法线指向 B 心）。
  if (dot(n, { x: B.c.x - A.c.x, y: B.c.y - A.c.y, z: B.c.z - A.c.z }) < 0) n = { x: -n.x, y: -n.y, z: -n.z };
  return { nx: n.x, ny: n.y, nz: n.z, depth: minOv };
}

// 多面体 vs 球：面法线 ∪ (最近顶点→球心) 轴 SAT。返回法线 **多面体→球** + 深度。
export function satPolySphere3(P: Poly, c: V3, r: number): Sep | null {
  const axes: V3[] = [...P.axes];
  // 最近顶点→球心 轴（球的圆角靠多面体角时的分离方向·同 2D satPolyCircle）。
  let best = P.verts[0]!, bestD2 = Infinity;
  for (const v of P.verts) {
    const dx = c.x - v.x, dy = c.y - v.y, dz = c.z - v.z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = v; }
  }
  const ax = best, ex = c.x - ax.x, ey = c.y - ax.y, ez = c.z - ax.z;
  const elen = Math.sqrt(ex * ex + ey * ey + ez * ez);
  if (elen > 1e-9) axes.push({ x: ex / elen, y: ey / elen, z: ez / elen });

  let minOv = Infinity, n: V3 = { x: 0, y: 1, z: 0 };
  for (const a of axes) {
    const pp = project(P.verts, a), cp = dot(c, a);
    const ov = Math.min(pp.max, cp + r) - Math.max(pp.min, cp - r);
    if (ov <= 0) return null;
    if (ov < minOv) { minOv = ov; n = a; }
  }
  if (dot(n, { x: c.x - P.c.x, y: c.y - P.c.y, z: c.z - P.c.z }) < 0) n = { x: -n.x, y: -n.y, z: -n.z };
  return { nx: n.x, ny: n.y, nz: n.z, depth: minOv };
}
