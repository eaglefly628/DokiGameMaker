import type { IWorld } from '@engine/core/types.js';
import type { Path3D, Transform3D } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  three/PathSystem —— 路径/样条跟随（Path3D·render-only·不进 hash·休闲通用）。
//  让实体的 Transform3D 沿一串控制点定义的路径按壁钟匀速走：移动平台/巡逻/金币抛物线/传送带物件/相机轨道 dolly。
//  linear=折线；smooth=Catmull-Rom 平滑曲线。loop=none(到头停)/loop(闭合环)/pingpong(往复)。faceDir=朝运动切线方向。
//  「按初值 + 绝对经过秒算」→ 帧率无关、无累积漂移。纯表现：只写 Transform3D（已 NON_DETERMINISTIC）·不进 sim/hash。
// ═══════════════════════════════════════════════════════════════

export interface Vec3 { x: number; y: number; z: number; }
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Catmull-Rom 单轴插值（P1→P2 段·t∈[0,1]·P0/P3 为邻点定切线）。
const catmull = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

// ── 纯函数：沿路径采样世界位（node 可测·无 GL）──────────────────────────────────────────────
//  t01∈[0,1] 覆盖全程。closed=首尾相接（loop 环）。<2 点 → 首点（退化保护）。
export function samplePath(points: ReadonlyArray<readonly [number, number, number]>, t01: number, mode: 'linear' | 'smooth', closed: boolean): Vec3 {
  const n = points.length;
  if (n === 0) return { x: 0, y: 0, z: 0 };
  if (n === 1) return { x: points[0]![0], y: points[0]![1], z: points[0]![2] };
  const segs = closed ? n : n - 1;
  const u = clamp01(t01) * segs;
  let seg = Math.floor(u);
  if (seg >= segs) seg = segs - 1; // t01=1 边界归入末段
  const lt = u - seg;
  const idx = (i: number): number => closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
  const P = (i: number): readonly [number, number, number] => points[idx(i)]!;
  const p1 = P(seg), p2 = P(seg + 1);
  if (mode === 'linear') return { x: lerp(p1[0], p2[0], lt), y: lerp(p1[1], p2[1], lt), z: lerp(p1[2], p2[2], lt) };
  const p0 = P(seg - 1), p3 = P(seg + 2);
  return { x: catmull(p0[0], p1[0], p2[0], p3[0], lt), y: catmull(p0[1], p1[1], p2[1], p3[1], lt), z: catmull(p0[2], p1[2], p2[2], p3[2], lt) };
}

// 全程参数 t01（据 loop 与经过秒·pingpong 往复）。返回 {t, active}（active=false → 到头停·可省帧）。
export function pathParam(elapsedSec: number, duration: number, loop: 'none' | 'loop' | 'pingpong'): { t: number; active: boolean } {
  const dur = duration > 0 ? duration : 1;
  const raw = elapsedSec / dur;
  if (loop === 'none') return { t: clamp01(raw), active: raw < 1 };
  if (loop === 'pingpong') { const m = ((raw % 2) + 2) % 2; return { t: m <= 1 ? m : 2 - m, active: true }; }
  return { t: raw - Math.floor(raw), active: true }; // loop
}

interface PState { start: number; }

export class PathSystem {
  private readonly state = new Map<string, PState>();

  // 逐帧沿路径写 Transform3D。返回**活跃**路径实体数（>0 → 渲染器持续重渲；loop:'none' 到头 → 不计活跃）。
  sync(world: IWorld, nowMs: number): number {
    const seen = new Set<string>();
    let live = 0;
    for (const [id] of world.query('Path3D')) {
      const p = world.getComponent<Path3D>(id, 'Path3D');
      const t3 = world.getComponent<Transform3D>(id, 'Transform3D');
      if (!p || !t3 || p.points.length < 2) continue;
      seen.add(id);
      let st = this.state.get(id);
      if (!st) { st = { start: nowMs }; this.state.set(id, st); }
      const elapsed = (nowMs - st.start) / 1000 - (p.delay ?? 0);
      const loop = p.loop ?? 'loop';
      const mode = p.mode ?? 'smooth';
      const closed = loop === 'loop';
      const { t, active } = elapsed <= 0 ? { t: 0, active: true } : pathParam(elapsed, p.duration, loop);
      const pos = samplePath(p.points, t, mode, closed);
      t3.x = pos.x; t3.y = pos.y; t3.z = pos.z;
      if (p.faceDir) { // 朝切线方向（XZ 平面 heading）
        const eps = 1e-3;
        const ahead = samplePath(p.points, clamp01(t + eps), mode, closed);
        const dx = ahead.x - pos.x, dz = ahead.z - pos.z;
        if (dx * dx + dz * dz > 1e-9) t3.rotY = Math.atan2(dx, dz);
      }
      if (active) live++;
    }
    for (const id of [...this.state.keys()]) if (!seen.has(id)) this.state.delete(id);
    return live;
  }

  dispose(): void { this.state.clear(); }
}
