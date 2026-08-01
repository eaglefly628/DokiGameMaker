import * as THREE from 'three';
import type { IWorld } from '@engine/core/types.js';
import type { Billboard3D, Transform3D, Transform } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  three/BillboardSystem —— 世界空间贴图广告牌（Billboard3D·render-only·不进 hash·休闲通用）。
//  在实体世界位放一张**始终朝相机的贴图 quad**（THREE.Sprite）：金币/拾取物/浮空图标/emoji 反应/远景 impostor。
//  区别 WorldUI3D（DOM 叠层·永在最上·不被遮挡）——广告牌**在场景里·参与深度排序·会被 3D 物体遮挡**。
//  贴图走 asset key（异步就绪前显纯色·就绪自动挂上）；size/非等比/染色/不透明/混合皆参数。纯表现。
// ═══════════════════════════════════════════════════════════════

// 广告牌世界位：显式 x/y/z > Transform3D > 2D Transform(x→X,y→Z)+baseY（同 Vfx3D 先例）。
function billboardPos(world: IWorld, id: string, b: Billboard3D): { x: number; y: number; z: number } | null {
  if (b.x !== undefined && b.y !== undefined && b.z !== undefined) return { x: b.x, y: b.y, z: b.z };
  const t3 = world.getComponent<Transform3D>(id, 'Transform3D');
  if (t3) return { x: t3.x, y: t3.y, z: t3.z };
  const t = world.getComponent<Transform>(id, 'Transform');
  if (t) return { x: t.x, y: b.baseY ?? 0, z: t.y };
  return null;
}

export type ResolveTex = (key: string) => THREE.Texture | null;

interface BState { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; sig: string; texKey?: string; }

export class BillboardSystem {
  private readonly items = new Map<string, BState>();

  // 管理广告牌精灵 + 每帧定位/取贴图。返回本帧**有变化**的广告牌数（创建/移动/改参/贴图就绪/移除）→ >0 时持续重渲。
  sync(scene: THREE.Scene, world: IWorld, resolveTex: ResolveTex): number {
    const seen = new Set<string>();
    let changed = 0;
    for (const [id] of world.query('Billboard3D')) {
      const b = world.getComponent<Billboard3D>(id, 'Billboard3D')!;
      const p = billboardPos(world, id, b);
      if (!p) continue;
      seen.add(id);
      const w = b.width ?? b.size ?? 2, h = b.height ?? b.size ?? 2;
      const color = b.color ?? 0xffffff, opacity = b.opacity ?? 1, blend = b.blend ?? 'alpha';
      const sig = `${w}|${h}|${color}|${opacity}|${blend}`;
      let st = this.items.get(id);
      if (!st) { st = this.make(); this.items.set(id, st); scene.add(st.sprite); changed++; }
      if (st.sig !== sig) {
        st.mat.color.setHex(color & 0xffffff);
        st.mat.opacity = opacity;
        st.mat.blending = blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending;
        st.sprite.scale.set(w, h, 1);
        st.mat.needsUpdate = true;
        st.sig = sig;
        changed++;
      }
      // 贴图（异步就绪前 null·显纯色）：key 变或从未就绪→就绪 → 挂上。
      const tex = b.tex ? resolveTex(b.tex) : null;
      if (st.mat.map !== tex) { st.mat.map = tex; st.mat.needsUpdate = true; changed++; }
      if (st.sprite.position.x !== p.x || st.sprite.position.y !== p.y || st.sprite.position.z !== p.z) {
        st.sprite.position.set(p.x, p.y, p.z);
        changed++;
      }
    }
    for (const [id, st] of this.items) if (!seen.has(id)) { scene.remove(st.sprite); st.mat.dispose(); this.items.delete(id); changed++; }
    return changed;
  }

  private make(): BState {
    const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    return { sprite, mat, sig: '' };
  }

  dispose(scene: THREE.Scene): void {
    for (const [, st] of this.items) { scene.remove(st.sprite); st.mat.dispose(); }
    this.items.clear();
  }
}
