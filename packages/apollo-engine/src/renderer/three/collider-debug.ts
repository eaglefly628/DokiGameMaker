import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { IWorld } from '@engine/core/types.js';
import type { Transform, Collider3D } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  three/ColliderDebug —— 碰撞体调试可视化（render-only·我的渲染线域）。
//  读 sim 的 `Collider3D`(+2D `Transform`) 画线框（box/sphere/竖直胶囊/凸多面体 hull）。位置映射同 contact3d：
//  planar 取 Transform(x→X、y→Z)、垂直取 Collider3D(baseY/height)。trigger=绿、实心=黄。池管理·开关即增删。
//  纯表现：只读 world、画线框，不写 sim、不进碰撞逻辑。
// ═══════════════════════════════════════════════════════════════

const COL_TRIGGER = 0x33d17a; // 触发区=绿
const COL_SOLID = 0xffd54f; // 实心=黄

export class ColliderDebug {
  private readonly meshes = new Map<string, { mesh: THREE.Mesh; sig: string }>();

  // enabled=false → 清空全部线框。enabled=true → 为每个 Collider3D 实体建/更新线框（形状变才重建几何·每帧更新位姿）。
  sync(scene: THREE.Scene, world: IWorld, enabled: boolean): void {
    if (!enabled) {
      for (const [, e] of this.meshes) { scene.remove(e.mesh); disposeWire(e.mesh); }
      this.meshes.clear();
      return;
    }
    const seen = new Set<string>();
    for (const [id] of world.query('Transform', 'Collider3D')) {
      const t = world.getComponent<Transform>(id, 'Transform')!;
      const c = world.getComponent<Collider3D>(id, 'Collider3D')!;
      seen.add(id);
      const sig = colliderSig(c);
      let e = this.meshes.get(id);
      if (!e || e.sig !== sig) {
        if (e) { scene.remove(e.mesh); disposeWire(e.mesh); }
        const mesh = buildWire(c);
        scene.add(mesh);
        e = { mesh, sig };
        this.meshes.set(id, e);
      }
      // 位姿：planar 取 Transform、垂直取 Collider3D（同 contact3d 映射）。
      const cx = t.x + (c.offsetX ?? 0);
      const cz = t.y + (c.offsetZ ?? 0);
      e.mesh.position.set(cx, centerY(c), cz);
    }
    // 移除消失的。
    for (const [id, e] of this.meshes) {
      if (!seen.has(id)) { scene.remove(e.mesh); disposeWire(e.mesh); this.meshes.delete(id); }
    }
  }

  dispose(scene: THREE.Scene): void {
    for (const [, e] of this.meshes) { scene.remove(e.mesh); disposeWire(e.mesh); }
    this.meshes.clear();
  }
}

// 碰撞体几何签名（形状/尺寸/trigger 变才重建线框）。hull 含顶点数 + 首末顶点（够侦测换形）。
function colliderSig(c: Collider3D): string {
  const vf = c.verts ?? [];
  const hull = c.kind === 'hull' ? `|${vf.length}|${vf[0] ?? 0}|${vf[vf.length - 1] ?? 0}` : '';
  return `${c.kind}|${c.radius ?? 0}|${c.halfX ?? 0}|${c.halfY ?? 0}|${c.halfZ ?? 0}|${c.height ?? 0}|${c.trigger ? 1 : 0}${hull}`;
}

// 碰撞体中心 Y（同 contact3d：box=baseY+halfY·sphere=baseY+radius·capsule=baseY+height/2·hull=baseY[顶点已含局部 Y]）。
function centerY(c: Collider3D): number {
  const baseY = c.baseY ?? 0;
  if (c.kind === 'box') return baseY + (c.halfY ?? 0);
  if (c.kind === 'sphere') return baseY + (c.radius ?? 0);
  if (c.kind === 'hull') return baseY; // hull 局部顶点已绕原点(baseY)·此处只平移原点
  return baseY + (c.height ?? 2 * (c.radius ?? 0)) / 2; // capsule
}

function buildWire(c: Collider3D): THREE.Mesh {
  const color = c.trigger ? COL_TRIGGER : COL_SOLID;
  const mat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.9, depthTest: true, toneMapped: false });
  let geo: THREE.BufferGeometry;
  if (c.kind === 'box') {
    geo = new THREE.BoxGeometry(2 * (c.halfX ?? 0), 2 * (c.halfY ?? 0), 2 * (c.halfZ ?? 0));
  } else if (c.kind === 'sphere') {
    geo = new THREE.SphereGeometry(c.radius ?? 0, 12, 8);
  } else if (c.kind === 'hull') {
    const vf = c.verts ?? [];
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i + 2 < vf.length; i += 3) pts.push(new THREE.Vector3(vf[i], vf[i + 1], vf[i + 2]));
    geo = pts.length >= 4 ? new ConvexGeometry(pts) : new THREE.BufferGeometry(); // <4 点无体积·空几何
  } else {
    const r = c.radius ?? 0;
    const len = Math.max(0, (c.height ?? 2 * r) - 2 * r); // 圆柱段 = 总高 - 两半球帽
    geo = new THREE.CapsuleGeometry(r, len, 4, 10); // Y 轴对齐（竖直胶囊）
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 999; // 浮在物体上
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function disposeWire(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
}
