import type * as THREE from 'three';
import type { IWorld } from '@engine/core/types.js';
import type { Transform3D, Transform } from '@engine/protocol/components.js';
import { projectPoint } from './world-ui.js';

// ═══════════════════════════════════════════════════════════════
//  three/IndexDebug —— 实体编号 debug 覆盖层（render-only·同 ColliderDebug/NavDebug 家族·开关 setDebugIndices）。
//  给每个「带锚实体」（有 Transform3D 或 2D Transform 的效果/实例）一个**稳定编号**——按实体 id 排序取 1-based 序号
//  （确定性·跨帧/跨会话一致·可用 `IndexDebug.indexMap` 随时复现 #N↔id 映射）→ 投影到屏幕挂一枚 `#N` + id 的徽标，
//  供开发/owner 指名反馈「游戏里某个东西 = 效果编号 N」。纯 debug 工具（非出货 UI·同 collider-debug 用裸 DOM·不走
//  LayoutNode）；DOM 叠层覆于 canvas 上（pointer-events:none 不挡交互）；相机/实体移动每帧重定位、出屏/背相机自隐。
// ═══════════════════════════════════════════════════════════════

export class IndexDebug {
  private overlay: HTMLElement | null = null;
  private readonly items = new Map<string, { el: HTMLElement; num: HTMLElement; sub: HTMLElement }>();

  init(container: HTMLElement): void {
    const o = container.ownerDocument.createElement('div');
    o.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;font-family:monospace';
    container.appendChild(o);
    this.overlay = o;
  }

  // 稳定编号映射：全体带锚实体 id 排序 → 1-based 序号。纯函数（供徽标定位 + 外部复现/导出 #N↔id）。
  static indexMap(world: IWorld): Map<string, number> {
    const ids = new Set<string>();
    for (const [id] of world.query('Transform3D')) ids.add(id);
    for (const [id] of world.query('Transform')) ids.add(id);
    const m = new Map<string, number>();
    [...ids].sort().forEach((id, i) => m.set(id, i + 1));
    return m;
  }

  sync(world: IWorld, camera: THREE.Camera, width: number, height: number, on: boolean): void {
    if (!this.overlay) return;
    if (!on) { for (const [, it] of this.items) it.el.remove(); this.items.clear(); return; } // 关 → 清空徽标
    const doc = this.overlay.ownerDocument;
    const seen = new Set<string>();
    for (const [id, n] of IndexDebug.indexMap(world)) {
      const p = anchorPos(world, id);
      if (!p) continue;
      const proj = projectPoint(camera, p.x, p.y, p.z, width, height);
      seen.add(id);
      let it = this.items.get(id);
      if (!it) {
        const el = doc.createElement('div');
        el.style.cssText = 'position:absolute;transform:translate(-50%,-50%);background:rgba(9,13,22,0.82);border:1px solid #2af;border-radius:4px;padding:1px 4px;text-align:center;white-space:nowrap';
        const num = doc.createElement('div'); num.style.cssText = 'font-weight:700;font-size:11px;color:#9df';
        const sub = doc.createElement('div'); sub.style.cssText = 'font-size:9px;color:#7a90a8';
        el.appendChild(num); el.appendChild(sub);
        this.overlay.appendChild(el);
        it = { el, num, sub };
        this.items.set(id, it);
      }
      it.num.textContent = `#${n}`;
      it.sub.textContent = id;
      it.el.style.display = proj.visible ? 'block' : 'none'; // 背相机/出屏 → 隐
      if (proj.visible) { it.el.style.left = `${proj.sx}px`; it.el.style.top = `${proj.sy}px`; }
    }
    for (const [id, it] of this.items) if (!seen.has(id)) { it.el.remove(); this.items.delete(id); } // 实体消失 → 清徽标
  }

  dispose(): void {
    for (const [, it] of this.items) it.el.remove();
    this.items.clear();
    this.overlay?.remove();
    this.overlay = null;
  }
}

// 锚点世界位：自身 Transform3D(x,y,z) 或 2D Transform(x→X,y→Z)。徽标居中贴物件（无 offsetY·与头顶飘字错开）。
function anchorPos(world: IWorld, id: string): { x: number; y: number; z: number } | null {
  const t3 = world.getComponent<Transform3D>(id, 'Transform3D');
  if (t3) return { x: t3.x, y: t3.y, z: t3.z };
  const t = world.getComponent<Transform>(id, 'Transform');
  if (t) return { x: t.x, y: 2, z: t.y };
  return null;
}
