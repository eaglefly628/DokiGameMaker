// @vitest-environment happy-dom
// Diegetic3D UI 贴进 3D 空间（render-only）：CSS3DObject 定位/朝向/缩放 from Transform3D + 生命周期 + contentSig 脏标 + 不进 hash。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DiegeticLayer } from './diegetic.js';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/index.js';
import type { Diegetic3D, Transform3D } from '@engine/protocol/components.js';

const NODE = (t: string): Diegetic3D['node'] => ({ type: 'Panel', id: 'p', props: {}, children: [{ type: 'Label', id: 'l', props: { text: t } }] });
const cam = (): THREE.PerspectiveCamera => { const c = new THREE.PerspectiveCamera(50, 2, 0.1, 100); c.position.set(0, 0, 10); c.lookAt(0, 0, 0); c.updateMatrixWorld(); return c; };

describe('DiegeticLayer（CSS3DObject 真 DOM 面片·render-only）', () => {
  it('据 Transform3D 定位/朝向/缩放（worldWidth/pxWidth）', () => {
    const container = document.createElement('div'); document.body.appendChild(container);
    const layer = new DiegeticLayer();
    layer.init(container, 800, 400);
    const w = new World(); w.createEntity('screen');
    w.addComponent('screen', { type: 'Transform3D', x: 3, y: 2, z: -1, rotY: 0.5 } as Transform3D);
    w.addComponent('screen', { type: 'Diegetic3D', node: NODE('HELLO'), pxWidth: 400, pxHeight: 200, worldWidth: 8 } as Diegetic3D);
    layer.sync(w, cam());
    // CSS3DObject 挂进 css 场景·位姿来自 Transform3D
    const obj = (layer as unknown as { cssScene: THREE.Scene }).cssScene.children[0]!;
    expect(obj.position.toArray()).toEqual([3, 2, -1]);
    expect(obj.rotation.y).toBeCloseTo(0.5);
    expect(obj.scale.x).toBeCloseTo(8 / 400); // worldWidth/pxWidth
    expect(obj.scale.y).toBeCloseTo((8 * 200 / 400) / 200); // worldHeight(缺省=保像素比)/pxHeight
    layer.dispose();
  });
  it('contentSig：node 变即变（相机前脏标）·相同稳定', () => {
    const container = document.createElement('div'); document.body.appendChild(container);
    const layer = new DiegeticLayer(); layer.init(container, 800, 400);
    const w = new World(); w.createEntity('s');
    w.addComponent('s', { type: 'Transform3D', x: 0, y: 0, z: 0 } as Transform3D);
    w.addComponent('s', { type: 'Diegetic3D', node: NODE('A') } as Diegetic3D);
    const s1 = layer.contentSig(w);
    expect(layer.contentSig(w)).toBe(s1); // 稳定
    w.removeComponent('s', 'Diegetic3D');
    w.addComponent('s', { type: 'Diegetic3D', node: NODE('B') } as Diegetic3D);
    expect(layer.contentSig(w)).not.toBe(s1); // node 变 → 签名变
    layer.dispose();
  });
  it('实体消失 → 清理面片（不崩）；无 init → sync no-op', () => {
    const container = document.createElement('div'); document.body.appendChild(container);
    const layer = new DiegeticLayer(); layer.init(container, 800, 400);
    const w = new World(); w.createEntity('s');
    w.addComponent('s', { type: 'Transform3D', x: 0, y: 0, z: 0 } as Transform3D);
    w.addComponent('s', { type: 'Diegetic3D', node: NODE('X') } as Diegetic3D);
    layer.sync(w, cam());
    expect((layer as unknown as { cssScene: THREE.Scene }).cssScene.children.length).toBe(1);
    w.destroyEntity('s');
    layer.sync(w, cam());
    expect((layer as unknown as { cssScene: THREE.Scene }).cssScene.children.length).toBe(0); // 清理
    layer.dispose();
    // 未 init 的层 sync 安全
    expect(() => new DiegeticLayer().sync(w, cam())).not.toThrow();
  });
});

describe('Diegetic3D = render-only（不进 hash）', () => {
  it('加 Diegetic3D 不改变 world hash', () => {
    const w = new World(); w.createEntity('e');
    const h0 = hashSnapshot(w.snapshot());
    w.addComponent('e', { type: 'Diegetic3D', node: NODE('hud') } as Diegetic3D);
    expect(hashSnapshot(w.snapshot())).toBe(h0); // Diegetic3D 被 NON_DETERMINISTIC 排除
  });
});
