import * as THREE from 'three';
import type { IWorld } from '@engine/core/types.js';
import type { Decal3D, Transform3D, Transform } from '@engine/protocol/components.js';
import type { ResolveTex } from './billboard.js';

// ═══════════════════════════════════════════════════════════════
//  three/DecalSystem —— 地面贴花（Decal3D·render-only·不进 hash·休闲通用）。
//  在实体的**地面投影处**铺一张**水平朝上的贴片**：blob=软阴影(便宜的接触阴影·真阴影关了也有)、
//  ring=空心环(选中/目标标记)、disc=实心圆(高亮/落点 splat)。贴片随实体 XZ 每帧跟随。
//  形状 = 程序化 alpha 遮罩贴图（按 kind 生成·缓存复用·零美术文件）；颜色/不透明度/半径走材质/几何参数（改这些不重建贴图）。
//  纯表现：绝不进 sim/hash。
// ═══════════════════════════════════════════════════════════════

const MASK_RES = 128;
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (e0: number, e1: number, x: number): number => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// ── 纯函数：按 kind 生成 RGBA alpha 遮罩（rgb=白·由材质 color 染色；alpha=形状）。node 可测·无 GL ──────────
//  半径归一：中心 r=0 → 边缘 r=1（贴片半宽）。blob=二次软径向；disc=实心带软边；ring=环带。
export function decalMask(kind: Decal3D['kind'], size = MASK_RES): Uint8Array {
  const k = kind ?? 'blob';
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c, dy = (y - c) / c;
      const r = Math.hypot(dx, dy);
      let a: number;
      if (k === 'disc') a = 1 - smoothstep(0.82, 1.0, r);            // 实心圆·软边淡出
      else if (k === 'ring') a = 1 - smoothstep(0, 0.14, Math.abs(r - 0.8)) * (r <= 1 ? 1 : 1); // 环带（r≈0.8·带宽 0.14）
      else { const f = clamp01(1 - r); a = f * f; }                   // blob：二次软径向（中心实·边缘 0）
      if (r > 1) a = 0;                                               // 出圆一律透明
      const i = (y * size + x) * 4;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = Math.round(clamp01(a) * 255);
    }
  }
  return data;
}

// 遮罩贴图缓存（按 kind·一次生成复用）。
const maskCache = new Map<string, THREE.DataTexture>();
function maskTexture(kind: Decal3D['kind']): THREE.DataTexture {
  const key = kind ?? 'blob';
  let tex = maskCache.get(key);
  if (tex) return tex;
  tex = new THREE.DataTexture(decalMask(kind, MASK_RES), MASK_RES, MASK_RES, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace; // 作 albedo 遮罩·随色染 → sRGB
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  maskCache.set(key, tex);
  return tex;
}

// 贴花地面位：Transform3D(x,z) 优先，否则 2D Transform(x→X,y→Z)。
function groundPos(world: IWorld, id: string): { x: number; z: number } | null {
  const t3 = world.getComponent<Transform3D>(id, 'Transform3D');
  if (t3) return { x: t3.x, z: t3.z };
  const t = world.getComponent<Transform>(id, 'Transform');
  if (t) return { x: t.x, z: t.y };
  return null;
}

const DEF_COLOR = (d: Decal3D): number => (d.tex ? 0xffffff : (d.kind === 'blob' || d.kind === undefined ? 0x000000 : 0xffffff)); // tex 缺省不染色（白=显原色）
const DEF_OPACITY = (d: Decal3D): number => (d.tex ? 1 : (d.kind === 'blob' || d.kind === undefined ? 0.35 : 0.7)); // tex 缺省全不透（alpha 走贴图通道）

interface DState { mesh: THREE.Mesh; geom: THREE.PlaneGeometry; mat: THREE.MeshBasicMaterial; sig: string; }

export class DecalSystem {
  private readonly decals = new Map<string, DState>();

  // 管理贴片网格 + 每帧跟随实体地面位。返回本帧**有变化**的贴片数（创建/移动/改参/贴图就绪/移除）→ >0 时渲染器持续重渲。
  // resolveTex：贴图 key→THREE.Texture（异步就绪前 null·同 Billboard 先例）；仅 tex 路用。
  sync(scene: THREE.Scene, world: IWorld, resolveTex: ResolveTex): number {
    const seen = new Set<string>();
    let changed = 0;
    for (const [id] of world.query('Decal3D')) {
      const d = world.getComponent<Decal3D>(id, 'Decal3D')!;
      const p = groundPos(world, id);
      if (!p) continue;
      seen.add(id);
      const w = d.width ?? (d.radius ?? 3) * 2, h = d.height ?? (d.radius ?? 3) * 2; // 非等比覆盖 radius（长条下注线）
      const color = d.color ?? DEF_COLOR(d), opacity = d.opacity ?? DEF_OPACITY(d), y = d.y ?? 0.05, rot = d.rotation ?? 0;
      // 贴图：tex 路取真图（异步就绪前 null → 暂隐不显白块）；否则程序化遮罩。
      const tex = d.tex ? resolveTex(d.tex) : maskTexture(d.kind);
      const sig = `${d.tex ?? d.kind ?? 'blob'}|${w}|${h}|${color}|${opacity}|${y}|${rot}|${tex ? 1 : 0}`;
      let st = this.decals.get(id);
      if (!st) { st = this.make(); this.decals.set(id, st); scene.add(st.mesh); changed++; }
      if (st.sig !== sig) {
        st.mat.map = tex;
        st.mat.color.setHex(color & 0xffffff);
        st.mat.opacity = opacity;
        st.mat.needsUpdate = true;
        st.mesh.visible = !!tex; // tex 未就绪（null）→ 暂隐
        st.mesh.scale.set(w, h, 1);
        st.mesh.rotation.set(-Math.PI / 2, 0, rot); // 贴地朝上 + 地面内 Y 朝向（rot 绕贴片法线转）
        st.sig = sig;
        changed++;
      }
      if (st.mesh.position.x !== p.x || st.mesh.position.z !== p.z || st.mesh.position.y !== y) {
        st.mesh.position.set(p.x, y, p.z);
        changed++;
      }
    }
    for (const [id, st] of this.decals) if (!seen.has(id)) { scene.remove(st.mesh); st.geom.dispose(); st.mat.dispose(); this.decals.delete(id); changed++; }
    return changed;
  }

  private make(): DState {
    const geom = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, // 压过地面防 z-fighting（配 y 抬升双保险）
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2; // 平面默认朝 +Z → 转成朝上（贴地）
    mesh.renderOrder = 1; // 贴片在不透明体之后画（透明排序）
    return { mesh, geom, mat, sig: '' };
  }

  dispose(scene: THREE.Scene): void {
    for (const [, st] of this.decals) { scene.remove(st.mesh); st.geom.dispose(); st.mat.dispose(); }
    this.decals.clear();
  }
}
