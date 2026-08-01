import * as THREE from 'three';
import type { IWorld } from '@engine/core/types.js';
import type { Line3D } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  three/LineSystem —— 世界折线（Line3D·render-only·不进 hash·休闲通用）。
//  把给定世界点连成**朝相机的带状线**（有宽度）：瞄准弹道预览/牵引绳/路径指示/画线预览。区别 Trail3D（运动残影·自动记轨迹）。
//  实线=连续带；虚线(dash>0)=按弧长采样·只在"实段"区间发带（dash 实·gap 空）。每帧据相机重建带（朝相机·同 Trail3D 先例）。
// ═══════════════════════════════════════════════════════════════

// ── 纯函数：给定世界点 → 朝相机带状线的顶点/颜色/索引（node 可测·无 GL）───────────────────────────
//  实线：原始点逐段发带。虚线：沿折线按 step 重采样·弧长落在实段(period=dash+gap·mod<dash)才发该小段。每小段独立四边形。
export interface LineBuffers { positions: Float32Array; colors: Float32Array; indices: number[]; }
export function lineRibbon(
  pts: ReadonlyArray<readonly [number, number, number]>,
  cam: { x: number; y: number; z: number },
  halfWidth: number,
  color: { r: number; g: number; b: number },
  opacity: number,
  dash: number,
  gap: number,
  closed: boolean,
): LineBuffers {
  const src = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  if (closed && src.length >= 2) src.push(src[0]!.clone());
  if (src.length < 2) return { positions: new Float32Array(0), colors: new Float32Array(0), indices: [] };

  // 采样点序列（实线=原点；虚线=按 step 重采样并标记 on/off）。
  const samples: { p: THREE.Vector3; on: boolean }[] = [];
  if (dash > 0) {
    const period = dash + (gap > 0 ? gap : dash);
    const step = Math.max(0.05, Math.min(dash, gap > 0 ? gap : dash) / 2);
    let acc = 0;
    samples.push({ p: src[0]!.clone(), on: (acc % period) < dash });
    for (let i = 1; i < src.length; i++) {
      const a = src[i - 1]!, b = src[i]!;
      const segLen = a.distanceTo(b);
      const n = Math.max(1, Math.ceil(segLen / step));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        acc += segLen / n;
        samples.push({ p: a.clone().lerp(b, t), on: (acc % period) < dash });
      }
    }
  } else {
    for (const p of src) samples.push({ p, on: true });
  }

  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const tan = new THREE.Vector3(), view = new THREE.Vector3(), side = new THREE.Vector3();
  // 逐"实段"(相邻两采样都 on 才连)发带四边形：a/b 各朝 side=normalize(tangent×view) 偏 ±halfWidth → 4 顶点 aL,aR,bL,bR + 2 三角。
  for (let i = 0; i < samples.length - 1; i++) {
    if (!samples[i]!.on || !samples[i + 1]!.on) continue;
    const a = samples[i]!.p, b = samples[i + 1]!.p;
    tan.subVectors(b, a);
    const base = pos.length / 3;
    for (const cur of [a, b]) {
      view.set(cam.x - cur.x, cam.y - cur.y, cam.z - cur.z);
      side.crossVectors(tan, view);
      if (side.lengthSq() < 1e-9) side.set(1, 0, 0); else side.normalize();
      pos.push(cur.x + side.x * halfWidth, cur.y + side.y * halfWidth, cur.z + side.z * halfWidth);
      pos.push(cur.x - side.x * halfWidth, cur.y - side.y * halfWidth, cur.z - side.z * halfWidth);
      col.push(color.r, color.g, color.b, opacity, color.r, color.g, color.b, opacity);
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2); // (aL,aR,bL),(aR,bR,bL)
  }
  return { positions: new Float32Array(pos), colors: new Float32Array(col), indices: idx };
}

interface LState { mesh: THREE.Mesh; geom: THREE.BufferGeometry; mat: THREE.MeshBasicMaterial; }

export class LineSystem {
  private readonly lines = new Map<string, LState>();

  // 内容签名（相机前调·折进 renderSig）：points/参数变即变。相机移动另由 camSig 触发重渲。
  contentSig(world: IWorld): string {
    let s = '';
    for (const [id] of world.query('Line3D')) {
      const l = world.getComponent<Line3D>(id, 'Line3D');
      if (l) s += `${id}:${l.width ?? ''}:${l.color ?? ''}:${l.opacity ?? ''}:${l.dash ?? ''}:${l.gap ?? ''}:${l.closed ? 1 : 0}:${l.blend ?? ''}:${l.points.length}:${l.points.flat().join(',')};`;
    }
    return s;
  }

  // 据相机重建带几何（相机后调·渲染前）。返回场上折线数（>0 → 存在）。
  build(scene: THREE.Scene, world: IWorld, camera: THREE.Camera): number {
    const seen = new Set<string>();
    const cp = camera.position;
    for (const [id] of world.query('Line3D')) {
      const l = world.getComponent<Line3D>(id, 'Line3D');
      if (!l || l.points.length < 2) continue;
      seen.add(id);
      let st = this.lines.get(id);
      if (!st) { st = this.make(); this.lines.set(id, st); scene.add(st.mesh); }
      st.mat.blending = (l.blend ?? 'alpha') === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending;
      const rb = lineRibbon(l.points, { x: cp.x, y: cp.y, z: cp.z }, (l.width ?? 0.3) / 2, new THREE.Color(l.color ?? 0xffffff), l.opacity ?? 1, l.dash ?? 0, l.gap ?? l.dash ?? 0, l.closed ?? false);
      st.geom.setAttribute('position', new THREE.BufferAttribute(rb.positions, 3));
      st.geom.setAttribute('color', new THREE.BufferAttribute(rb.colors, 4));
      st.geom.setIndex(rb.indices);
      st.geom.attributes.position.needsUpdate = true;
      st.mesh.visible = rb.indices.length > 0;
    }
    for (const [id, st] of this.lines) if (!seen.has(id)) { scene.remove(st.mesh); st.geom.dispose(); st.mat.dispose(); this.lines.delete(id); }
    return this.lines.size;
  }

  private make(): LState {
    const geom = new THREE.BufferGeometry();
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return { mesh, geom, mat };
  }

  dispose(scene: THREE.Scene): void {
    for (const [, st] of this.lines) { scene.remove(st.mesh); st.geom.dispose(); st.mat.dispose(); }
    this.lines.clear();
  }
}
