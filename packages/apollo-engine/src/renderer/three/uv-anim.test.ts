// Material3D.uvAnim（UV 动画·render-only）：滚动改 offset + 序列帧步进 + 撤销还原 + 不进 hash。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { UvAnimSystem } from './uv-anim.js';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/index.js';
import type { Material3D } from '@engine/protocol/components.js';

function meshWithMap(): { mesh: THREE.Mesh; source: THREE.Texture } {
  const source = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: source }));
  return { mesh, source };
}
const mapOf = (mesh: THREE.Mesh): THREE.Texture => (mesh.material as THREE.MeshStandardMaterial).map!;

describe('UvAnimSystem 滚动（scroll）', () => {
  it('把材质贴图换成克隆并逐帧推进 offset（不动源贴图·随壁钟）', () => {
    const { mesh, source } = meshWithMap();
    const w = new World(); w.createEntity('e');
    w.addComponent('e', { type: 'Material3D', preset: 'matte', uvAnim: { scrollX: 1, scrollY: 0.5 } } as Material3D);
    const sys = new UvAnimSystem();
    const meshes = new Map([['e', mesh]]);
    expect(sys.sync(w, meshes, 1000)).toBe(1); // 注册·t0=1000·elapsed0
    const clone = mapOf(mesh);
    expect(clone).not.toBe(source);            // 换成了克隆
    expect(source.offset.x).toBe(0);           // 源不动
    sys.sync(w, meshes, 1500);                 // +0.5s
    expect(clone.offset.x).toBeCloseTo(0.5);   // scrollX 1 · 0.5s
    expect(clone.offset.y).toBeCloseTo(0.25);  // scrollY 0.5 · 0.5s
  });
});

describe('UvAnimSystem 序列帧（flipbook）', () => {
  it('cols×rows 网格·按 fps 逐格·repeat=1/网格·offset 定位当前格', () => {
    const { mesh } = meshWithMap();
    const w = new World(); w.createEntity('e');
    w.addComponent('e', { type: 'Material3D', preset: 'matte', uvAnim: { fps: 4, cols: 2, rows: 2 } } as Material3D);
    const sys = new UvAnimSystem();
    const meshes = new Map([['e', mesh]]);
    sys.sync(w, meshes, 1000); // frame 0
    const c = mapOf(mesh);
    expect(c.repeat.x).toBeCloseTo(0.5); expect(c.repeat.y).toBeCloseTo(0.5); // 2×2 网格
    expect(c.offset.x).toBeCloseTo(0); expect(c.offset.y).toBeCloseTo(0.5);   // frame0 = 左上格（row0 顶）
    sys.sync(w, meshes, 1000 + 260); // elapsed 0.26·fps4 → frame 1（col1,row0）
    expect(c.offset.x).toBeCloseTo(0.5); expect(c.offset.y).toBeCloseTo(0.5);
    sys.sync(w, meshes, 1000 + 510); // frame 2（col0,row1·底行）
    expect(c.offset.x).toBeCloseTo(0); expect(c.offset.y).toBeCloseTo(0);
  });
});

describe('UvAnimSystem 生命周期', () => {
  it('撤掉 uvAnim → 还原基底贴图并回收；mesh 消失清理', () => {
    const { mesh, source } = meshWithMap();
    const w = new World(); w.createEntity('e');
    w.addComponent('e', { type: 'Material3D', preset: 'matte', uvAnim: { scrollX: 1 } } as Material3D);
    const sys = new UvAnimSystem();
    const meshes = new Map([['e', mesh]]);
    sys.sync(w, meshes, 1000);
    expect(mapOf(mesh)).not.toBe(source);
    // 撤掉 uvAnim（换成无 uvAnim 的材质）
    w.removeComponent('e', 'Material3D');
    w.addComponent('e', { type: 'Material3D', preset: 'matte' } as Material3D);
    expect(sys.sync(w, meshes, 1200)).toBe(0); // 不再活跃
    expect(mapOf(mesh)).toBe(source);          // 还原基底
  });
});

describe('Material3D.uvAnim = render-only（不进 hash）', () => {
  it('材质带 uvAnim 不改变 world hash', () => {
    const w = new World(); w.createEntity('e');
    const h0 = hashSnapshot(w.snapshot());
    w.addComponent('e', { type: 'Material3D', preset: 'matte', uvAnim: { scrollX: 2 } } as Material3D);
    expect(hashSnapshot(w.snapshot())).toBe(h0); // Material3D 被 NON_DETERMINISTIC 排除
  });
});
