import type { Camera3D, Post3D } from '@engine/protocol/components.js';
import type { Pose3D } from '../three-projection.js';

// ═══════════════════════════════════════════════════════════════
//  three/stats —— profiler 快照类型 + W1-C 脏标签名的纯函数（无 three / 无状态 → node 可测）。
// ═══════════════════════════════════════════════════════════════

// profiler 快照（像虚幻 stat）：每帧 draw/三角/CPU 耗时 + 实例化批/实体计数。游戏层 readStats() 读 → LayoutNode HUD 显示。
export interface RenderStats {
  rendered: boolean; // 本帧真渲染 / 脏标跳渲
  cpuMs: number; // sync CPU 耗时（平滑·ms）
  drawCalls: number; // 每帧 draw call（跨 scene+post 全 pass）
  triangles: number;
  programs: number; // 已编译 shader program 数
  geometries: number; // GPU 常驻几何 / 纹理（显存代理）
  textures: number;
  batches: number; // InstancedMesh 批数
  instances: number; // 实例化绘制的实体总数
  fallbackMeshes: number; // 走单 mesh fallback 的数（透明盒 + 2D）
  models: number; // 导入模型实例数
}

// W1-C 脏标：把所有渲染位姿折成一个数（FNV-1a·量化到 milli-unit）。变了→重渲。
export function hashPoses(poses: readonly Pose3D[]): number {
  let h = 2166136261;
  const f = (n: number): void => { h = Math.imul(h ^ ((n * 1000) | 0), 16777619); };
  for (const p of poses) { f(p.x); f(p.y); f(p.z); f(p.rotZ); f(p.sx); f(p.sy); f(p.rx ?? 0); f(p.ry ?? 0); f(p.sz ?? 1); }
  return h >>> 0;
}

// 相机签名（参与渲染脏标·含 REQ-3D-Camera 全部语义参数 → 改投影/fov/模式即重渲）。
export function camSig(c: Camera3D | null): string {
  if (!c) return '';
  return [
    c.yaw.toFixed(4), c.pitch.toFixed(4), c.distance ?? -1, c.pivotX ?? 0, c.pivotY ?? 0, c.pivotZ ?? 0,
    c.projection ?? 'p', c.fov ?? -1, c.orthoSize ?? -1, c.near ?? -1, c.far ?? -1,
    c.mode ?? 'o', c.target ?? '', c.pitchMin ?? -9, c.pitchMax ?? -9,
    c.shake?.trigger ?? -1, // 震屏触发（bump 即算相机数据变→捕获触发帧；衰减帧由渲染器 shake token 持续重渲）
    c.tween?.trigger ?? -1, // 运镜过渡触发（bump 即捕获过渡起帧；过渡帧由渲染器 tween token 持续重渲）
  ].join(',');
}

// 后处理签名（参与渲染脏标）。
export function postSig(p: Post3D | null): string {
  if (!p) return '';
  const t = p.tiltShift, b = p.bloom, v = p.vignette;
  return `${t?.focus ?? -1},${t?.intensity ?? -1},${b?.strength ?? -1},${b?.radius ?? -1},${b?.threshold ?? -1}` +
    `,${v?.intensity ?? -1},${v?.smoothness ?? -1},${v?.color ?? -1},${p.flash?.trigger ?? -1}`; // 暗角(静态)+闪白触发帧

}
