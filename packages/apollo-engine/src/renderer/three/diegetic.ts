import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import type { IWorld } from '@engine/core/types.js';
import type { Diegetic3D, Transform3D } from '@engine/protocol/components.js';
import { mountUI, ensureUiKeyframes, type MountHandle } from '@ui/components/index.js';

// ═══════════════════════════════════════════════════════════════
//  three/DiegeticLayer —— UI 贴进 3D 空间（Diegetic3D·render-only·不进 hash·消费方=contents 展示台）。
//  每个 Diegetic3D = 一个 **CSS3DObject（真 DOM 面片）**：经引擎 UI 库 mountUI 渲 LayoutNode → 定位在实体 Transform3D、
//  按其欧拉角朝向、按 worldWidth/pxWidth 缩放到世界尺度 → CSS3DRenderer 用**同一相机**投影（随相机转/透视）。
//  真 DOM → 文字锐利、Chromium 稳（区别贴图路线：foreignObject 栅格在 Chromium 渲空白）。代价：叠层不进 WebGL 深度（不被遮挡/不吃后处理）。
//  UI 铁律：仍是 LayoutNode 经真 UI 库渲染（不手写 DOM）。DOM 层覆在 canvas 上（pointer-events:none 不挡交互）。
// ═══════════════════════════════════════════════════════════════

interface Item { host: HTMLElement; ui: MountHandle; obj: CSS3DObject; sig: string; }

export class DiegeticLayer {
  private renderer: CSS3DRenderer | null = null;
  private readonly cssScene = new THREE.Scene(); // 装 CSS3DObject 的独立场景（CSS3DRenderer 遍历它）
  private readonly items = new Map<string, Item>();
  private doc: Document | null = null;

  init(container: HTMLElement, width: number, height: number): void {
    this.doc = container.ownerDocument;
    const r = new CSS3DRenderer();
    r.setSize(width, height);
    r.domElement.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;overflow:hidden';
    container.appendChild(r.domElement);
    this.renderer = r;
    ensureUiKeyframes(this.doc);
  }

  resize(width: number, height: number): void { this.renderer?.setSize(width, height); }

  // 内容签名（供渲染脏标·相机前调）：node/尺寸/底色变即变 → 折进 renderSig 触发重渲更新 DOM。相机移动另由 camSig 触发。
  contentSig(world: IWorld): string {
    let s = '';
    for (const [id] of world.query('Diegetic3D')) {
      const d = world.getComponent<Diegetic3D>(id, 'Diegetic3D');
      if (d) s += `${id}:${d.pxWidth ?? ''}x${d.pxHeight ?? ''}:${d.bg ?? ''}:${JSON.stringify(d.node)};`;
    }
    return s;
  }

  // 每帧（相机就绪后·渲染路径内调）：同步各 DOM 面片（node 变重挂·位姿从 Transform3D）+ 用相机渲染 CSS 层。
  sync(world: IWorld, camera: THREE.Camera): void {
    if (!this.renderer || !this.doc) return;
    const seen = new Set<string>();
    for (const [id] of world.query('Diegetic3D')) {
      const d = world.getComponent<Diegetic3D>(id, 'Diegetic3D');
      const t = world.getComponent<Transform3D>(id, 'Transform3D');
      if (!d || !t) continue;
      seen.add(id);
      const pxW = d.pxWidth ?? 512, pxH = d.pxHeight ?? 512;
      const worldW = d.worldWidth ?? 8, worldH = d.worldHeight ?? worldW * pxH / pxW;
      const sig = `${pxW}x${pxH}|${d.bg ?? ''}|${JSON.stringify(d.node)}`;
      let it = this.items.get(id);
      if (!it) { it = this.make(pxW, pxH, d); this.items.set(id, it); this.cssScene.add(it.obj); }
      if (it.sig !== sig) {
        it.host.style.cssText = hostCss(pxW, pxH, d.bg);
        it.ui.update(d.node);
        it.sig = sig;
      }
      // 位姿：世界位 + 欧拉朝向 + 缩放（px→world·各轴等比按宽；worldHeight 覆盖时按高另算 y 缩放）。
      it.obj.position.set(t.x, t.y, t.z);
      it.obj.rotation.set(t.rotX ?? 0, t.rotY ?? 0, t.rotZ ?? 0);
      it.obj.scale.set(worldW / pxW, worldH / pxH, 1);
    }
    for (const [id, it] of this.items) if (!seen.has(id)) { it.ui(); it.obj.parent?.remove(it.obj); it.host.remove(); this.items.delete(id); }
    this.renderer.render(this.cssScene, camera);
  }

  private make(pxW: number, pxH: number, d: Diegetic3D): Item {
    const host = this.doc!.createElement('div');
    host.style.cssText = hostCss(pxW, pxH, d.bg);
    const ui = mountUI(host, d.node);
    const obj = new CSS3DObject(host);
    return { host, ui, obj, sig: '' };
  }

  dispose(): void {
    for (const [, it] of this.items) { it.ui(); it.obj.parent?.remove(it.obj); it.host.remove(); }
    this.items.clear();
    this.renderer?.domElement.remove();
    this.renderer = null;
  }
}

const hostCss = (pxW: number, pxH: number, bg?: string): string => `width:${pxW}px;height:${pxH}px;overflow:hidden;background:${bg ?? 'transparent'}`;
