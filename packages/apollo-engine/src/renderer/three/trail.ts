import * as THREE from 'three';
import type { IWorld } from '@engine/core/types.js';
import type { Trail3D, Transform3D, Transform } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  three/TrailSystem —— 运动拖尾（Trail3D·render-only·不进 hash·超休闲残影）。
//  两段式：① sample(相机前)——按实体世界位采样各拖尾位置历史（位移超 minDist 才落点）·返回本帧有位移的拖尾数（折进 renderSig）；
//         ② build(相机后)——据历史 + 相机方位重建「朝相机的带状」几何（头端满宽满不透明·尾端按 fade 收窄淡出）。
//  纯表现：位置历史随壁钟演化·绝不进 sim/hash。预算：每拖尾 segments 上限。
// ═══════════════════════════════════════════════════════════════

// 拖尾采样点世界位：Transform3D 优先，否则 2D Transform(x→X,y→Z·y=0)。
function trailPos(world: IWorld, id: string): { x: number; y: number; z: number } | null {
  const t3 = world.getComponent<Transform3D>(id, 'Transform3D');
  if (t3) return { x: t3.x, y: t3.y, z: t3.z };
  const t = world.getComponent<Transform>(id, 'Transform');
  if (t) return { x: t.x, y: 0, z: t.y };
  return null;
}

// ── 纯函数：据位置历史 + 相机位算「朝相机带状」的顶点/颜色/索引（node 可测·无 GL）──────────────
//  pts[0]=最旧(尾)·pts[n-1]=最新(头)。每点向 side = normalize(tangent × viewDir) 偏移 ±halfWidth·
//  头端满宽满不透明→尾端宽/透明按 t 线性收（尾端不透明度 = fade）。<2 点 → 空（无带）。
export interface RibbonBuffers { positions: Float32Array; colors: Float32Array; indices: number[]; }
export function ribbonBuffers(
  pts: ReadonlyArray<{ x: number; y: number; z: number }>,
  cam: { x: number; y: number; z: number },
  halfWidth: number,
  color: { r: number; g: number; b: number },
  fade: number,
): RibbonBuffers {
  const n = pts.length;
  if (n < 2) return { positions: new Float32Array(0), colors: new Float32Array(0), indices: [] };
  const positions = new Float32Array(n * 2 * 3);
  const colors = new Float32Array(n * 2 * 4);
  const tan = new THREE.Vector3(), view = new THREE.Vector3(), side = new THREE.Vector3();
  const cur = new THREE.Vector3(), prev = new THREE.Vector3(), next = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    cur.set(pts[i].x, pts[i].y, pts[i].z);
    prev.set(pts[Math.max(0, i - 1)].x, pts[Math.max(0, i - 1)].y, pts[Math.max(0, i - 1)].z);
    next.set(pts[Math.min(n - 1, i + 1)].x, pts[Math.min(n - 1, i + 1)].y, pts[Math.min(n - 1, i + 1)].z);
    tan.subVectors(next, prev);
    view.set(cam.x - cur.x, cam.y - cur.y, cam.z - cur.z);
    side.crossVectors(tan, view);
    if (side.lengthSq() < 1e-9) side.set(1, 0, 0); else side.normalize();
    const t = n > 1 ? i / (n - 1) : 1;         // 0=尾 → 1=头
    const w = halfWidth * (0.15 + 0.85 * t);   // 尾端收窄（不全为 0·留一丝）
    const a = fade + (1 - fade) * t;           // 尾端不透明度=fade → 头端=1
    const bi = i * 2;
    positions[bi * 3 + 0] = cur.x + side.x * w; positions[bi * 3 + 1] = cur.y + side.y * w; positions[bi * 3 + 2] = cur.z + side.z * w;
    positions[(bi + 1) * 3 + 0] = cur.x - side.x * w; positions[(bi + 1) * 3 + 1] = cur.y - side.y * w; positions[(bi + 1) * 3 + 2] = cur.z - side.z * w;
    for (const v of [bi, bi + 1]) { colors[v * 4 + 0] = color.r; colors[v * 4 + 1] = color.g; colors[v * 4 + 2] = color.b; colors[v * 4 + 3] = a; }
  }
  const indices: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, b, c, b, d, c); // 两三角构成一节带
  }
  return { positions, colors, indices };
}

interface TrailState { pts: THREE.Vector3[]; mesh: THREE.Mesh; geom: THREE.BufferGeometry; mat: THREE.MeshBasicMaterial; }

export class TrailSystem {
  private readonly trails = new Map<string, TrailState>();

  // ① 采样（相机前）：更新位置历史·返回本帧有位移的拖尾数（>0 → 渲染器持续重渲）。
  sample(world: IWorld): number {
    const seen = new Set<string>();
    let live = 0;
    for (const [id] of world.query('Trail3D')) {
      const tr = world.getComponent<Trail3D>(id, 'Trail3D')!;
      const p = trailPos(world, id);
      if (!p) continue;
      seen.add(id);
      let st = this.trails.get(id);
      if (!st) { st = this.make(tr); this.trails.set(id, st); }
      const seg = Math.max(2, tr.segments ?? 20);
      const md = tr.minDist ?? 0.05;
      const head = st.pts[st.pts.length - 1];
      if (!head || head.distanceToSquared(new THREE.Vector3(p.x, p.y, p.z)) > md * md) {
        st.pts.push(new THREE.Vector3(p.x, p.y, p.z));
        while (st.pts.length > seg) st.pts.shift();
        live++;
      }
    }
    for (const [id, st] of this.trails) if (!seen.has(id)) { this.disposeState(st); this.trails.delete(id); }
    return live;
  }

  // ② 构建（相机后）：据历史 + 相机重建带几何并挂场景。
  build(scene: THREE.Scene, world: IWorld, camera: THREE.Camera): void {
    const cp = camera.position;
    for (const [id, st] of this.trails) {
      const tr = world.getComponent<Trail3D>(id, 'Trail3D');
      if (!tr) continue;
      if (!st.mesh.parent) scene.add(st.mesh);
      st.mat.blending = (tr.blend ?? 'alpha') === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending;
      const col = new THREE.Color(tr.color ?? 0xffffff);
      const rb = ribbonBuffers(st.pts, { x: cp.x, y: cp.y, z: cp.z }, (tr.width ?? 0.3) / 2, col, tr.fade ?? 0);
      st.geom.setAttribute('position', new THREE.BufferAttribute(rb.positions, 3));
      st.geom.setAttribute('color', new THREE.BufferAttribute(rb.colors, 4));
      st.geom.setIndex(rb.indices);
      st.geom.attributes.position.needsUpdate = true;
      st.mesh.visible = rb.indices.length > 0;
    }
  }

  private make(_tr: Trail3D): TrailState {
    const geom = new THREE.BufferGeometry();
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.frustumCulled = false;
    return { pts: [], mesh, geom, mat };
  }

  private disposeState(st: TrailState): void { st.mesh.parent?.remove(st.mesh); st.geom.dispose(); st.mat.dispose(); }

  dispose(scene: THREE.Scene): void {
    for (const [, st] of this.trails) { scene.remove(st.mesh); st.geom.dispose(); st.mat.dispose(); }
    this.trails.clear();
  }
}
