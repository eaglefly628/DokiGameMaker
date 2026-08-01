// TA Phase 2：动态 point/spot 局部光（预算 cap + 可移动 + 池清理）。three Scene/Light 为纯 JS·无需 GL。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LightRig } from './lights.js';
import { World } from '@engine/core/world.js';
import { getLights3D } from '@engine/protocol/camera-view.js';
import type { Light3D, Transform } from '@engine/protocol/components.js';

const pointCount = (s: THREE.Scene): number => s.children.filter((c) => c instanceof THREE.PointLight).length;
const point = (i: number, extra: Partial<Light3D>): Light3D => ({ type: 'Light3D', kind: 'point', color: 0xffffff, intensity: 50, range: 20, ...extra }) as Light3D;

describe('LightRig · 动态局部光（TA Phase 2）', () => {
  it('预算 cap：摆 3 盏 point → 只生效 2 盏', () => {
    const scene = new THREE.Scene();
    const rig = new LightRig(scene);
    const w = new World();
    for (let i = 0; i < 3; i++) { w.createEntity(`p${i}`); w.addComponent(`p${i}`, point(i, { x: i, y: 5, z: 0 })); }
    rig.sync(scene, getLights3D(w), w);
    expect(pointCount(scene)).toBe(2); // 第 3 盏被预算丢弃
  });

  it('可移动：挂带 Transform 的实体 → 光读其 2D Transform(x→X,y→Z)+baseY，实体移动则光随之走', () => {
    const scene = new THREE.Scene();
    const rig = new LightRig(scene);
    const w = new World();
    w.createEntity('mover');
    w.addComponent('mover', { type: 'Transform', x: 10, y: -4, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('mover', point(0, { baseY: 6 })); // 无显式 xyz → 读 Transform
    rig.sync(scene, getLights3D(w), w);
    let l = scene.children.find((c) => c instanceof THREE.PointLight) as THREE.PointLight;
    expect([l.position.x, l.position.y, l.position.z]).toEqual([10, 6, -4]); // x→X, baseY→Y, y→Z
    // 移动实体 → 再 sync → 光跟随。
    w.getComponent<Transform>('mover', 'Transform')!.x = 25;
    rig.sync(scene, getLights3D(w), w);
    l = scene.children.find((c) => c instanceof THREE.PointLight) as THREE.PointLight;
    expect(l.position.x).toBe(25);
  });

  it('池清理：撤掉 Light3D → 局部光从场景移除', () => {
    const scene = new THREE.Scene();
    const rig = new LightRig(scene);
    const w = new World();
    w.createEntity('p'); w.addComponent('p', point(0, { x: 0, y: 5, z: 0 }));
    rig.sync(scene, getLights3D(w), w);
    expect(pointCount(scene)).toBe(1);
    w.removeComponent('p', 'Light3D');
    rig.sync(scene, getLights3D(w), w);
    expect(pointCount(scene)).toBe(0);
  });
});
