// Billboard3D 世界空间广告牌（render-only）：Sprite 定位/取贴图/改参 + 2D 位 + 不进 hash。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BillboardSystem } from './billboard.js';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/index.js';
import type { Billboard3D, Transform3D, Transform } from '@engine/protocol/components.js';

const spriteOf = (scene: THREE.Scene): THREE.Sprite => scene.children.find((o) => o instanceof THREE.Sprite) as THREE.Sprite;
const noTex = (): THREE.Texture | null => null;

describe('BillboardSystem（Sprite·render-only）', () => {
  it('建精灵于实体 Transform3D 位·尺寸/染色/混合按参数', () => {
    const scene = new THREE.Scene();
    const w = new World(); w.createEntity('coin');
    w.addComponent('coin', { type: 'Transform3D', x: 4, y: 2, z: -1 } as Transform3D);
    w.addComponent('coin', { type: 'Billboard3D', size: 3, color: 0xffcc00, blend: 'add' } as Billboard3D);
    const sys = new BillboardSystem();
    expect(sys.sync(scene, w, noTex)).toBeGreaterThan(0);
    const sp = spriteOf(scene);
    expect(sp).toBeTruthy();
    expect(sp.position.toArray()).toEqual([4, 2, -1]);
    expect(sp.scale.x).toBe(3); expect(sp.scale.y).toBe(3);
    const mat = sp.material as THREE.SpriteMaterial;
    expect(mat.color.getHex()).toBe(0xffcc00);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
  });
  it('非等比 width/height + 2D Transform(x→X,y→Z)+baseY 定位', () => {
    const scene = new THREE.Scene();
    const w = new World(); w.createEntity('ic');
    w.addComponent('ic', { type: 'Transform', x: 7, y: -5, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('ic', { type: 'Billboard3D', width: 2, height: 4, baseY: 6 } as Billboard3D);
    const sys = new BillboardSystem();
    sys.sync(scene, w, noTex);
    const sp = spriteOf(scene);
    expect(sp.position.x).toBe(7); expect(sp.position.z).toBe(-5); expect(sp.position.y).toBe(6); // 2D y→Z·baseY→Y
    expect(sp.scale.x).toBe(2); expect(sp.scale.y).toBe(4);
  });
  it('贴图异步就绪：null→就绪 → 挂上 map（有变化）', () => {
    const scene = new THREE.Scene();
    const w = new World(); w.createEntity('p');
    w.addComponent('p', { type: 'Transform3D', x: 0, y: 0, z: 0 } as Transform3D);
    w.addComponent('p', { type: 'Billboard3D', tex: 'icon/coin' } as Billboard3D);
    const sys = new BillboardSystem();
    let ready: THREE.Texture | null = null;
    const resolve = (): THREE.Texture | null => ready;
    sys.sync(scene, w, resolve); // 未就绪 → 纯色·map null
    expect((spriteOf(scene).material as THREE.SpriteMaterial).map).toBeNull();
    ready = new THREE.Texture();
    expect(sys.sync(scene, w, resolve)).toBeGreaterThan(0); // 就绪 → 有变化
    expect((spriteOf(scene).material as THREE.SpriteMaterial).map).toBe(ready);
  });
  it('静止无变化返回 0（不强制重渲）；实体消失清理', () => {
    const scene = new THREE.Scene();
    const w = new World(); w.createEntity('s');
    w.addComponent('s', { type: 'Transform3D', x: 1, y: 1, z: 1 } as Transform3D);
    w.addComponent('s', { type: 'Billboard3D', size: 2 } as Billboard3D);
    const sys = new BillboardSystem();
    sys.sync(scene, w, noTex);
    expect(sys.sync(scene, w, noTex)).toBe(0); // 静止 → 无变化
    w.destroyEntity('s');
    expect(sys.sync(scene, w, noTex)).toBeGreaterThan(0);
    expect(spriteOf(scene)).toBeFalsy();
  });
});

describe('Billboard3D = render-only（不进 hash）', () => {
  it('加 Billboard3D 不改变 world hash', () => {
    const w = new World(); w.createEntity('e');
    const h0 = hashSnapshot(w.snapshot());
    w.addComponent('e', { type: 'Billboard3D', tex: 'x', size: 2 } as Billboard3D);
    expect(hashSnapshot(w.snapshot())).toBe(h0); // Billboard3D 被 NON_DETERMINISTIC 排除
  });
});
