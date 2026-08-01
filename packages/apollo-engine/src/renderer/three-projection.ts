import type { Renderable } from './renderable.js';
import type { Transform3D } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  three-projection —— 2D Renderable → 3D 位姿的**纯函数**（无 three / 无 WebGL 依赖 → node 可测）。
//  把易错的几何（y 翻转、zOrder→深度、相机取景）抽出来单测，three-renderer 只剩薄 WebGL 胶水
//  （同 renderable.ts 把 chooseRenderMode 抽成纯函数的先例）。
// ═══════════════════════════════════════════════════════════════

// 约定：2D y 向下 → 3D y 向上（取负）；zOrder → z 微分层（深度）；旋转随 y 翻转取负以保观感一致。
export interface Pose3D {
  x: number;
  y: number;
  z: number;
  rotZ: number;
  sx: number;
  sy: number;
  rx?: number; // 绕 X 欧拉角（仅 Transform3D 真三维路径用；2D 投影路径缺省 0）
  ry?: number; // 绕 Y 欧拉角（同上）
  sz?: number; // Z 轴缩放（同上；2D 路径缺省 1）
  quat?: readonly [number, number, number, number]; // 四元数(x,y,z,w)·在场则覆盖欧拉角（物理翻滚·applyPose 用）
}

export function renderablePose(r: Renderable, zStep = 0.01): Pose3D {
  return { x: r.x, y: -r.y, z: r.zOrder * zStep, rotZ: -r.rotation, sx: r.scaleX, sy: r.scaleY };
}

// 真三维位姿（盒庭）：Transform3D → 完整 3D 位姿（地面=XZ、Y=高度）。等比 scale 落三轴·分轴 scaleX/Y/Z 覆盖对应轴
// （挤压拉伸 squash&stretch·缺省回退等比）。纯函数（node 可测）。
export function transform3dPose(t3: Transform3D): Pose3D {
  const s = t3.scale ?? 1;
  return { x: t3.x, y: t3.y, z: t3.z, rx: t3.rotX ?? 0, ry: t3.rotY ?? 0, rotZ: t3.rotZ ?? 0, sx: t3.scaleX ?? s, sy: t3.scaleY ?? s, sz: t3.scaleZ ?? s, ...(t3.quat ? { quat: t3.quat } : {}) };
}

// 盒庭模式下「把 2D sim 实体投到地面」：Transform(x,y) → 地面 XZ（x→X、2D y→Z 景深），Y=物高/2（下沿坐地 y=0）。
// 2D rotation → 绕 Y 的朝向。→ 让用现成 input/velocity/motion 能力驱动的 2D 实体（如可控角色）在盒庭里走来走去，
// 即「同一份 2D sim 数据，换 3D 后端当盒庭看」。纯函数（node 可测）。
export function groundPose(r: { x: number; y: number; rotation: number; scaleX: number; scaleY: number }, height: number): Pose3D {
  return { x: r.x, y: height / 2, z: r.y, rotZ: 0, rx: 0, ry: -r.rotation, sx: r.scaleX, sy: r.scaleY, sz: r.scaleX };
}

export interface Bounds2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// 所有位姿的包围盒（每实体含半尺寸 half 余量）。空 → 单位盒（避免退化）。
export function poseBounds(poses: readonly Pose3D[], half = 0.5): Bounds2D {
  if (poses.length === 0) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poses) {
    minX = Math.min(minX, p.x - half);
    maxX = Math.max(maxX, p.x + half);
    minY = Math.min(minY, p.y - half);
    maxY = Math.max(maxY, p.y + half);
  }
  return { minX, maxX, minY, maxY };
}

// 透视相机沿 +z 拉远到正好框住包围盒（含 pad 余量）。返回 lookAt 中心 (cx,cy) 与相机距离 dist。
// 纯表现（presentation）——用 tan/PI 不影响确定性（渲染层不进 hash）。
export function fitPerspective(b: Bounds2D, fovDeg: number, aspect: number, pad = 1.12): { cx: number; cy: number; dist: number } {
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const halfW = Math.max(0.5, (b.maxX - b.minX) / 2);
  const halfH = Math.max(0.5, (b.maxY - b.minY) / 2);
  const tanV = Math.tan((fovDeg * Math.PI) / 180 / 2);
  const dist = Math.max(halfH / tanV, halfW / (tanV * Math.max(aspect, 1e-6))) * pad + 1;
  return { cx, cy, dist };
}

// ── Mesh3D（3D 物件即数据）几何/翻面的纯推导（无 three / 无 WebGL → node 可测）──────────────

// box 厚度：plane 无厚度(0)；box 缺省=短边*ratio 的薄板（下限 1），显式 depth 则透传。
type MeshShape = 'box' | 'plane' | 'sphere' | 'cylinder' | 'cone' | 'capsule' | 'torus';
const ROUND_SHAPES: ReadonlySet<string> = new Set(['sphere', 'cylinder', 'cone', 'capsule', 'torus']); // 圆润单材质图元

export function mesh3dDepth(shape: MeshShape, width: number, height: number, depth?: number, ratio = 0.05): number {
  if (shape === 'plane') return 0;
  if (ROUND_SHAPES.has(shape)) return width; // 圆润图元：以直径作包围深度（批签名/相机取景用·非真厚度）
  return depth ?? Math.max(1, Math.min(width, height) * ratio);
}

// W1-A 实例化绘制：Mesh3D 的「视觉签名」——同签名的多实体可合进一个 InstancedMesh（1 draw call）。
// 含 shape + 尺寸 + 逐面色（色烤进几何 vertexColors，故色不同=不同几何=不同批）。纯函数（node 可测）。
export function mesh3dBatchKey(m: {
  shape: MeshShape; width: number; height: number; depth?: number;
  frontTint: number; backTint?: number; edgeTint?: number;
}): string {
  if (m.shape === 'plane') return `plane|${m.width}|${m.height}|${m.frontTint}`;
  if (m.shape === 'sphere') return `sphere|${m.width}|${m.frontTint}`; // 球：直径决定（height 忽略）→ 同直径同色一批
  if (ROUND_SHAPES.has(m.shape)) return `${m.shape}|${m.width}|${m.height}|${m.frontTint}`; // 柱/锥/胶囊/环：形+直径+高+色 → 一批
  const depth = mesh3dDepth('box', m.width, m.height, m.depth);
  return `box|${m.width}|${m.height}|${depth}|${m.frontTint}|${m.backTint ?? m.frontTint}|${m.edgeTint ?? 0x1f2937}`;
}

// 翻面：Transform.rotation 作为绕 flipAxis 的角度（0=正面朝镜头、π=反面）→ 欧拉角（另一轴恒 0）。
export function flipEuler(rotation: number, axis: 'x' | 'y' = 'x'): { x: number; y: number } {
  return axis === 'y' ? { x: 0, y: rotation } : { x: rotation, y: 0 };
}

// 翻面后哪面朝镜头：rotation 归一到 [0,2π)，落在 (π/2, 3π/2) → 反面朝前（看到 back）。WebGL 后端靠真几何自动
// 决定可见面，无需此函数；正交看帧（frame-svg 无真几何）则据此选正/反面色，保真翻面。
export function faceDown(rotation: number): boolean {
  const tau = Math.PI * 2;
  const a = ((rotation % tau) + tau) % tau;
  return a > Math.PI / 2 && a < (3 * Math.PI) / 2;
}

// ── Camera3D（盒庭轨道相机）几何的纯推导（无 three / 无 WebGL → node 可测）──────────────────

export interface Bounds3D { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }

// 一组 3D 位姿的包围盒（每物含 half 余量）。空 → 单位盒（避免退化）。
export function poseBounds3D(poses: readonly Pose3D[], half = 0.5): Bounds3D {
  if (poses.length === 0) return { minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: -1, maxZ: 1 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poses) {
    minX = Math.min(minX, p.x - half); maxX = Math.max(maxX, p.x + half);
    minY = Math.min(minY, p.y - half); maxY = Math.max(maxY, p.y + half);
    minZ = Math.min(minZ, p.z - half); maxZ = Math.max(maxZ, p.z + half);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

export function bounds3DCenter(b: Bounds3D): { x: number; y: number; z: number } {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: (b.minZ + b.maxZ) / 2 };
}

// 包围盒最大半边长（用于自适配相机距离 / 阴影相机视锥尺寸）。
export function bounds3DExtent(b: Bounds3D): number {
  return Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ) / 2;
}

// 透视相机框住半径 radius 的球所需距离（fov 度）。纯表现，用 tan 不影响确定性。
export function fitDistance3D(radius: number, fovDeg: number, pad = 1.4): number {
  const tanV = Math.tan((fovDeg * Math.PI) / 180 / 2);
  return (radius / Math.max(tanV, 1e-6)) * pad + radius;
}

// REQ-3D-Camera：俯仰夹角（行为层运镜 + 解释器都用·缺省不夹）。纯函数。
export function clampPitch(pitch: number, min?: number, max?: number): number {
  let p = pitch;
  if (min !== undefined) p = Math.max(min, p);
  if (max !== undefined) p = Math.min(max, p);
  return p;
}

// REQ-3D-Camera：正交相机视锥（按半高 + 宽高比）。纯函数（无 three）→ node 单测正交取景。
export function orthoFrustum(orthoSize: number, aspect: number): { left: number; right: number; top: number; bottom: number } {
  const halfH = Math.max(orthoSize, 1e-3);
  const halfW = halfH * Math.max(aspect, 1e-6);
  return { left: -halfW, right: halfW, top: halfH, bottom: -halfH };
}

// 轨道相机位置：绕 center 的球面坐标（y 上）。yaw=方位(绕Y)，pitch=俯仰(正=俯视)，dist=半径。
// 纯函数（无 three）→ node 单测相机定位，three-renderer 只剩 set/lookAt 薄胶水。
export function orbitCamera(
  center: { x: number; y: number; z: number },
  dist: number,
  yaw: number,
  pitch: number,
): { x: number; y: number; z: number } {
  const horiz = dist * Math.cos(pitch);
  return {
    x: center.x + horiz * Math.sin(yaw),
    y: center.y + dist * Math.sin(pitch),
    z: center.z + horiz * Math.cos(yaw),
  };
}

// ── 程序化动画方法·通道求值（纯函数·render-only·壁钟驱动·帧率无关·不累积漂移）─────────────────────
// loop（绕初值 base·t=经过秒）：spin=初值+rate·t / bob=初值+amp·sin / osc=初值+amp·wave / noise=初值+amp·噪声。
// once（绝对值·不绕初值）：ease=from→to 经 dur 秒（delay 后起·curve 缓动）·播完保持 to。
// base = 该分量作者初值（系统首见捕获）。**ease 返回绝对值**（系统按 delta=返回值−base 叠加·故 ease 独占时 = 覆写）。
type AnimChReduced =
  | { kind: 'spin'; rate: number }
  | { kind: 'bob'; amp: number; freq: number; phase?: number }
  | { kind: 'osc'; wave: 'sine' | 'triangle' | 'saw' | 'square'; amp: number; freq: number; phase?: number }
  | { kind: 'noise'; amp: number; freq: number; seed?: number }
  | { kind: 'ease'; from: number; to: number; dur: number; curve?: 'linear' | 'cubicOut' | 'outBack'; delay?: number }
  | { kind: 'spring'; to: number; from?: number; freq?: number; damping?: number };

export function anim3dField(ch: AnimChReduced, tSec: number, base: number): number {
  switch (ch.kind) {
    case 'spin': return base + ch.rate * tSec;
    case 'bob': return base + ch.amp * Math.sin(tSec * ch.freq + (ch.phase ?? 0));
    case 'osc': return base + ch.amp * animWave(ch.wave, tSec * ch.freq + (ch.phase ?? 0));
    case 'noise': return base + ch.amp * (noise1(tSec * ch.freq + (ch.seed ?? 0)) * 2 - 1);
    case 'ease': {
      const p = clamp01((tSec - (ch.delay ?? 0)) / Math.max(1e-6, ch.dur), 1); // 归一进度 0..1（delay 前=0·超 dur=1 保持）
      const c = ch.curve === 'linear' ? p : ch.curve === 'outBack' ? easeOutBack(p) : easeCubicOut(p);
      return ch.from + (ch.to - ch.from) * c;
    }
    case 'spring': return springValue(ch, tSec, base);
  }
}

// 解析阻尼弹簧（纯时间函数·帧率无关）：从 from（缺省 base 初值）弹性追赶到 to，欠阻尼(damping<1)带过冲回弹、临界(=1)不过冲。
// freq=固有频率(Hz·越大越快·缺省 2)·damping=阻尼比 0.05..1(越小弹得越久·缺省 0.35=弹跳感)。t=0 → from·t→∞ → to。
export function springValue(ch: { to: number; from?: number; freq?: number; damping?: number }, tSec: number, base: number): number {
  const from = ch.from ?? base;
  const zeta = ch.damping === undefined ? 0.35 : (ch.damping < 0.05 ? 0.05 : ch.damping > 1 ? 1 : ch.damping);
  const w = 2 * Math.PI * (ch.freq ?? 2);
  const dx = from - ch.to;
  let env: number;
  if (zeta < 1) { const wd = w * Math.sqrt(1 - zeta * zeta); env = Math.exp(-zeta * w * tSec) * (Math.cos(wd * tSec) + (zeta * w / wd) * Math.sin(wd * tSec)); }
  else env = Math.exp(-w * tSec) * (1 + w * tSec); // 临界阻尼
  return ch.to + dx * env;
}

// 弹簧沉降时间（~4 时间常数·98% 到位）：供活跃判定（弹簧是 once 类·settle 后不再计活跃）。
export function springSettle(ch: { freq?: number; damping?: number }): number {
  const zeta = ch.damping === undefined ? 0.35 : (ch.damping < 0.05 ? 0.05 : ch.damping > 1 ? 1 : ch.damping);
  const w = 2 * Math.PI * (ch.freq ?? 2);
  return 4 / (zeta * w);
}

// 周期波形（归一 [-1,1]·输入 x 视作弧度·**与 sine 同相**：x=0 过零上升·x=π/2 达峰·三角/方波峰对齐 sine）。
function animWave(wave: 'sine' | 'triangle' | 'saw' | 'square', x: number): number {
  if (wave === 'sine') return Math.sin(x);
  if (wave === 'square') return Math.sin(x) >= 0 ? 1 : -1;
  if (wave === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(x)); // asin(sin) = 与 sine 同相三角波
  return 2 * ((x / (2 * Math.PI) + 0.5) - Math.floor(x / (2 * Math.PI) + 0.5)) - 1; // saw：x=0→0 上升·x=π 跳变·[-1,1)
}
// 1D 确定性平滑值噪声 [0,1]（hash 格点 + smoothstep·帧率无关·同 t 同值）。
function noise1(x: number): number {
  const xi = Math.floor(x), f = x - xi;
  const u = f * f * (3 - 2 * f);
  const h = (i: number): number => { let n = Math.imul(i | 0, 374761393) >>> 0; n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  return h(xi) * (1 - u) + h(xi + 1) * u;
}
// clamp 到 [0,hi]（复用给 ease 进度；hi 默认 1）。
function clamp01(v: number, hi = 1): number { return v < 0 ? 0 : v > hi ? hi : v; }

// ── 缓动（纯函数·Cloud Design 3d-motion-spec 只用这两个）──────────────────────────────────────
// cubic-out：`1-(1-p)³`（落场/减速·§E 掷骰弧）。eOutBack：带回弹过冲（§F 骰壳 grow-in / 新场展开）。
export function easeCubicOut(p: number): number { const q = 1 - p; return 1 - q * q * q; }
export function easeOutBack(p: number): number { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); }

// ── 射线-AABB 求交（纯函数·slab 法·3D 对象拾取 Pickable3D 用）──────────────────────────────────
// 射线：原点 o(ox,oy,oz) + 方向 d(dx,dy,dz·无需归一)；轴对齐盒：中心 c + 各轴半尺寸 h。
// 返回**最近命中距离 t**（≥0·沿 d 的参数·越小越近相机）；未命中 / 盒整体在射线反向 → null。
// 原点在盒外 → 返回入口距离 tmin；原点已在盒内 → 返回 0（贴脸命中）。纯函数 → node 可测（拾取自证的可测部分）。
export function rayAabbT(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  cx: number, cy: number, cz: number,
  hx: number, hy: number, hz: number,
): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  const axes: Array<[number, number, number, number]> = [[ox, dx, cx, hx], [oy, dy, cy, hy], [oz, dz, cz, hz]];
  for (const [o, d, c, h] of axes) {
    const lo = c - h, hi = c + h;
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; } // 平行该轴：原点须在板内否则不可能命中
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null; // 盒整体在射线反向（相机后）
  return tmin >= 0 ? tmin : 0; // 盒外→入口距离；盒内→贴脸(0)
}
