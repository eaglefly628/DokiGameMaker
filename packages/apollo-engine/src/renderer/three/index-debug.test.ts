// @vitest-environment happy-dom
// 实体编号 debug 覆盖（render-only·稳定编号供指名反馈）：indexMap 稳定排序 + DOM 徽标开/关。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { IndexDebug } from './index-debug.js';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/index.js';
import type { Transform3D, Transform } from '@engine/protocol/components.js';

function cam(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(50, 2, 0.1, 200);
  c.position.set(0, 20, 60); c.lookAt(0, 0, 0); c.updateMatrixWorld(); c.updateProjectionMatrix();
  return c;
}
function seed(): World {
  const w = new World();
  w.createEntity('zebra'); w.addComponent('zebra', { type: 'Transform3D', x: 0, y: 1, z: 0 } as Transform3D);
  w.createEntity('alpha'); w.addComponent('alpha', { type: 'Transform3D', x: 5, y: 1, z: 0 } as Transform3D);
  w.createEntity('mid'); w.addComponent('mid', { type: 'Transform', x: -5, y: 3, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  return w;
}

describe('IndexDebug.indexMap（稳定编号·按 id 排序·1-based）', () => {
  it('按实体 id 字典序取 1-based 序号（Transform3D + 2D Transform 并集去重）', () => {
    const m = IndexDebug.indexMap(seed());
    expect(m.get('alpha')).toBe(1);
    expect(m.get('mid')).toBe(2);
    expect(m.get('zebra')).toBe(3);
    expect(m.size).toBe(3);
  });
  it('无锚实体（仅 Camera3D/Light 等）不参与编号', () => {
    const w = new World();
    w.createEntity('cam'); w.addComponent('cam', { type: 'Camera3D', yaw: 0, pitch: 0.5, distance: 50 } as unknown as Transform3D);
    expect(IndexDebug.indexMap(w).size).toBe(0);
  });
  it('编号是纯读——不改 world hash（render-only）', () => {
    const w = seed();
    const h0 = hashSnapshot(w.snapshot());
    IndexDebug.indexMap(w);
    expect(hashSnapshot(w.snapshot())).toBe(h0);
  });
});

describe('IndexDebug DOM 徽标（开则画·关则清）', () => {
  it('on → 每个带锚实体一枚徽标（#N + id）；off → 清空', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const dbg = new IndexDebug();
    dbg.init(container);
    const overlay = container.firstElementChild as HTMLElement; // init 建的叠层
    const w = seed();
    dbg.sync(w, cam(), 800, 600, true);
    expect(overlay.children.length).toBe(3); // 3 实体 → 3 枚徽标
    expect(overlay.textContent).toContain('#1');
    expect(overlay.textContent).toContain('alpha');
    // 关 → 徽标清空
    dbg.sync(w, cam(), 800, 600, false);
    expect(overlay.children.length).toBe(0);
    dbg.dispose();
  });
  it('实体消失 → 其徽标被清理', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const dbg = new IndexDebug();
    dbg.init(container);
    const overlay = container.firstElementChild as HTMLElement;
    const w = seed();
    dbg.sync(w, cam(), 800, 600, true);
    expect(overlay.textContent).toContain('zebra');
    w.destroyEntity('zebra');
    dbg.sync(w, cam(), 800, 600, true);
    expect(overlay.textContent).not.toContain('zebra');
    expect(overlay.children.length).toBe(2);
    dbg.dispose();
  });
});
