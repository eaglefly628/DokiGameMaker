import * as THREE from 'three';
import type { IWorld } from '@engine/core/types.js';
import type { Material3D } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  three/UvAnimSystem —— 材质 UV 动画（Material3D.uvAnim·render-only·不进 hash·休闲通用）。
//  据壁钟逐帧改材质贴图的 offset/repeat：scroll=匀速滚动（水/岩浆/传送带/瀑布）；flipbook=序列帧（sprite-sheet 逐格播）。
//  每个用 uvAnim 的实体：把其材质各贴图槽**克隆一份独立贴图**（offset/repeat 是 uniform·克隆共享图字节·不重传 GPU），
//  只动克隆的变换 → 不影响共享同一张缓存图的其他物件。撤掉 uvAnim / mesh 重建 → 还原并释放克隆。纯表现。
// ═══════════════════════════════════════════════════════════════

// 可动画的贴图槽（标准/toon/basic 材质的子集·按存在与否择取）。
const SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const;
type Slot = typeof SLOTS[number];
type MatWithMaps = THREE.Material & Partial<Record<Slot, THREE.Texture | null>>;

interface Clone { slot: Slot; source: THREE.Texture; clone: THREE.Texture; repX: number; repY: number; offX: number; offY: number; }
interface Reg { mesh: THREE.Mesh; clones: Clone[]; t0: number; }

const frac = (x: number): number => x - Math.floor(x);

export class UvAnimSystem {
  private readonly regs = new Map<string, Reg>();

  // 逐帧推进（须在 mesh 建好后·renderSig 前）。返回**活跃 uvAnim 实体数**（>0 → 渲染器持续重渲·动画在跑）。
  sync(world: IWorld, meshes: ReadonlyMap<string, THREE.Mesh>, nowMs: number): number {
    const seen = new Set<string>();
    let live = 0;
    for (const [id] of world.query('Material3D')) {
      const mat3 = world.getComponent<Material3D>(id, 'Material3D');
      const ua = mat3?.uvAnim;
      if (!ua) continue;
      const mesh = meshes.get(id);
      if (!mesh) continue;
      seen.add(id);
      let reg = this.regs.get(id);
      if (!reg || reg.mesh !== mesh) { // 首见 or mesh 重建 → 重新克隆
        if (reg) this.unregister(reg);
        reg = this.register(mesh, nowMs);
        this.regs.set(id, reg);
      }
      const elapsed = (nowMs - reg.t0) / 1000;
      const flip = (ua.fps ?? 0) > 0 && (ua.cols ?? 0) >= 1 && (ua.rows ?? 0) >= 1;
      for (const c of reg.clones) {
        if (flip) {
          const cols = ua.cols!, rows = ua.rows!, total = cols * rows;
          const f = ((Math.floor(elapsed * ua.fps!) % total) + total) % total;
          const col = f % cols, row = Math.floor(f / cols);
          c.clone.repeat.set(1 / cols, 1 / rows);
          c.clone.offset.set(col / cols, 1 - (row + 1) / rows); // 行 0 在顶（V 上下翻）
        } else {
          c.clone.repeat.set(c.repX, c.repY);
          c.clone.offset.set(frac(c.offX + (ua.scrollX ?? 0) * elapsed), frac(c.offY + (ua.scrollY ?? 0) * elapsed));
        }
      }
      if (reg.clones.length > 0) live++;
    }
    // 撤掉 uvAnim / 实体消失 → 还原基底贴图并释放克隆。
    for (const [id, reg] of this.regs) if (!seen.has(id)) { this.unregister(reg); this.regs.delete(id); }
    return live;
  }

  private register(mesh: THREE.Mesh, nowMs: number): Reg {
    const mat = mesh.material as MatWithMaps;
    const clones: Clone[] = [];
    for (const slot of SLOTS) {
      const src = mat[slot];
      if (!src) continue;
      const clone = src.clone();
      clone.wrapS = clone.wrapT = THREE.RepeatWrapping; // 滚动/序列帧需环绕采样
      clone.needsUpdate = true;
      mat[slot] = clone;
      clones.push({ slot, source: src, clone, repX: src.repeat.x, repY: src.repeat.y, offX: src.offset.x, offY: src.offset.y });
    }
    if (clones.length > 0) mat.needsUpdate = true;
    return { mesh, clones, t0: nowMs };
  }

  private unregister(reg: Reg): void {
    const mat = reg.mesh.material as MatWithMaps;
    for (const c of reg.clones) {
      if (mat[c.slot] === c.clone) mat[c.slot] = c.source; // 还原基底（mesh 未被销毁时）
      c.clone.dispose();
    }
    if (reg.clones.length > 0) mat.needsUpdate = true;
  }

  dispose(): void {
    for (const [, reg] of this.regs) for (const c of reg.clones) c.clone.dispose();
    this.regs.clear();
  }
}
