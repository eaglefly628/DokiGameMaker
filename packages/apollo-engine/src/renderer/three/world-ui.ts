import * as THREE from 'three';
import type { IWorld } from '@engine/core/types.js';
import type { WorldUI3D, Transform3D, Transform } from '@engine/protocol/components.js';
import type { LayoutNode } from '@ui/components/index.js';
import { mountUI, type MountHandle } from '@ui/components/index.js';

// ═══════════════════════════════════════════════════════════════
//  three/WorldUiLayer —— 世界空间 UI（TA Phase 3·render-only·头顶飘字）。
//  读 `WorldUI3D`（锚自身实体）→ 锚点世界位投影到屏幕 → 在该处用引擎 UI 库 `mountUI` 挂 **LayoutNode**（UI 铁律）。
//  渲染线只做「世界锚 + 投影 + 定位 DOM 宿主」；控件渲染全走主程 UI 库（不手写 DOM/React）。纯表现·不进 hash。
//  DOM 叠层覆在 canvas 上（pointer-events:none 不挡交互）；每个实体一个宿主·池管理·按相机/实体移动每帧重定位。
// ═══════════════════════════════════════════════════════════════

// 世界点 → 屏幕像素（相对 canvas 左上）+ 是否在相机前方且在视口内。纯函数（便于单测·相机为纯 JS）。
export function projectPoint(camera: THREE.Camera, x: number, y: number, z: number, width: number, height: number): { sx: number; sy: number; visible: boolean } {
  const v = new THREE.Vector3(x, y, z).project(camera);
  const sx = (v.x * 0.5 + 0.5) * width;
  const sy = (-v.y * 0.5 + 0.5) * height;
  const visible = v.z < 1 && v.x >= -1.05 && v.x <= 1.05 && v.y >= -1.05 && v.y <= 1.05; // 前方 + 视口内（留点边）
  return { sx, sy, visible };
}

interface Item { host: HTMLElement; ui: MountHandle; sig: string; }

export class WorldUiLayer {
  private overlay: HTMLElement | null = null;
  private readonly items = new Map<string, Item>();

  init(container: HTMLElement): void {
    const o = container.ownerDocument.createElement('div');
    o.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none';
    container.appendChild(o);
    this.overlay = o;
  }

  sync(world: IWorld, camera: THREE.Camera, width: number, height: number): void {
    if (!this.overlay) return;
    const seen = new Set<string>();
    for (const [id] of world.query('WorldUI3D')) {
      const ui = world.getComponent<WorldUI3D>(id, 'WorldUI3D')!;
      const p = anchorPos(world, id, ui.offsetY ?? 6);
      if (!p) continue;
      const proj = projectPoint(camera, p.x, p.y, p.z, width, height);
      seen.add(id);
      let it = this.items.get(id);
      if (!it) {
        const host = this.overlay.ownerDocument.createElement('div');
        host.style.cssText = 'position:absolute;transform:translate(-50%,-100%);will-change:left,top';
        this.overlay.appendChild(host);
        it = { host, ui: mountUI(host, treeOf(ui)), sig: sigOf(ui) };
        this.items.set(id, it);
      } else {
        const sg = sigOf(ui);
        if (sg !== it.sig) { it.ui.update(treeOf(ui)); it.sig = sg; }
      }
      // 定位 + 可见性（背对相机/出屏 → 隐藏）。
      it.host.style.display = proj.visible ? 'block' : 'none';
      if (proj.visible) { it.host.style.left = `${proj.sx}px`; it.host.style.top = `${proj.sy}px`; }
    }
    for (const [id, it] of this.items) if (!seen.has(id)) { it.ui(); it.host.remove(); this.items.delete(id); }
  }

  dispose(): void {
    for (const [, it] of this.items) { it.ui(); it.host.remove(); }
    this.items.clear();
    this.overlay?.remove();
    this.overlay = null;
  }
}

// 锚点世界位：自身 Transform3D(x,y,z) 或 2D Transform(x→X,y→Z)，再抬 offsetY。
function anchorPos(world: IWorld, id: string, offsetY: number): { x: number; y: number; z: number } | null {
  const t3 = world.getComponent<Transform3D>(id, 'Transform3D');
  if (t3) return { x: t3.x, y: t3.y + offsetY, z: t3.z };
  const t = world.getComponent<Transform>(id, 'Transform');
  if (t) return { x: t.x, y: offsetY, z: t.y };
  return null;
}

// 变更签名：node 在场 → 序列化富内容（血条更新即变→重挂）；否则 text 简写各字段。
const sigOf = (ui: WorldUI3D): string => ui.node ? `n:${JSON.stringify(ui.node)}` : `${ui.text ?? ''}|${ui.size ?? ''}|${ui.color ?? ''}|${ui.glow ? 1 : 0}`;

// 头顶 LayoutNode：node 在场直接用（富面板/血条/名牌·UI 铁律仍走 UI 库渲染）；否则 bare Panel 裹居中 Label（text 简写）。
export function treeOf(ui: WorldUI3D): LayoutNode {
  if (ui.node) return ui.node;
  return {
    type: 'Panel', id: 'wui', props: { bare: true },
    children: [{ type: 'Label', id: 'wui-l', props: { text: ui.text ?? '', size: ui.size ?? 'sm', glow: ui.glow ?? false, ...(ui.color ? { color: ui.color } : {}) } }],
  };
}
