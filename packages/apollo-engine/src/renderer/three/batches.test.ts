// @vitest-environment happy-dom
// W1-A 实例化批（含 voxelTex 体素批·REQ-3D-RENDER-EFFICIENCY 3D 半场·大立方又大又细）：N 同款 → 1 InstancedMesh。
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';

// happy-dom 无 canvas 2d 实现 → 给 voxelTex 贴图生成打个 no-op 2d 上下文桩（只测批逻辑·非贴图像素）。
beforeAll(() => {
  const g = { addColorStop() {} };
  const ctx = new Proxy({}, { get: (_t, p) => (p === 'createLinearGradient' ? () => g : () => {}), set: () => true });
  (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctx;
});
import { InstancedBatches, type InstGroups } from './batches.js';
import type { Renderable } from '../renderable.js';
import type { Pose3D } from '../three-projection.js';
import type { Mesh3D } from '@engine/protocol/components.js';

const pose = (x = 0): Pose3D => ({ x, y: 0, z: 0, rotZ: 0, rx: 0, ry: 0, sx: 1, sy: 1, sz: 1 });
const box = (front: number): Mesh3D => ({ type: 'Mesh3D', shape: 'box', width: 20, height: 20, depth: 20, frontTint: front });
const voxBox = (top: number): Mesh3D => ({ type: 'Mesh3D', shape: 'box', width: 20, height: 20, depth: 20, frontTint: 0xffffff, voxelTex: { top, side: 0x888888, pattern: 'stone', tile: 2 } });
const item = (m: Mesh3D, x: number): { r: Renderable; pose: Pose3D } => ({ r: { mesh3d: m } as unknown as Renderable, pose: pose(x) });

describe('InstancedBatches（W1-A 实例化·平色盒）', () => {
  it('同签名 N 盒 → 1 InstancedMesh（count N·单材质）', () => {
    const scene = new THREE.Scene();
    const b = new InstancedBatches();
    const groups: InstGroups = new Map([['box|k', Array.from({ length: 40 }, (_, i) => item(box(0x40e0ff), i * 20))]]);
    b.sync(scene, groups);
    expect(b.count).toBe(1);
    expect(b.instances).toBe(40);
    const im = scene.children.find((o) => o instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(im.count).toBe(40);
    expect(Array.isArray(im.material)).toBe(false); // 平色=单材质（vertexColors）
    b.dispose(scene);
  });
});

describe('InstancedBatches voxelTex 体素批（大立方几百体素 → 每款 1 draw call）', () => {
  it('同 voxelTex 签名的 N 体素 → 1 InstancedMesh（count N·六面贴图材质数组）', () => {
    const scene = new THREE.Scene();
    const b = new InstancedBatches();
    const groups: InstGroups = new Map([['vox|stone', Array.from({ length: 300 }, (_, i) => item(voxBox(0x8b8f98), i * 24))]]);
    b.sync(scene, groups);
    expect(b.count).toBe(1);          // 300 体素 → 1 批（原来 300 draw call）
    expect(b.instances).toBe(300);
    const im = scene.children.find((o) => o instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(im.count).toBe(300);
    expect(Array.isArray(im.material)).toBe(true); // voxelTex=六面贴图材质数组
    b.dispose(scene);
  });
  it('不同 voxelTex 签名 → 各自成批（草/石 = 2 批·地形分层）', () => {
    const scene = new THREE.Scene();
    const b = new InstancedBatches();
    const groups: InstGroups = new Map([
      ['vox|grass', [item(voxBox(0x6bbf4a), 0)]],
      ['vox|stone', [item(voxBox(0x8b8f98), 24)]],
    ]);
    b.sync(scene, groups);
    expect(b.count).toBe(2);
    b.dispose(scene);
  });
});
