// Line3D 世界折线（render-only）：纯函数带几何（实线/虚线）+ 系统脏标/生命周期 + 不进 hash。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { lineRibbon, LineSystem } from './line3d.js';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/index.js';
import type { Line3D } from '@engine/protocol/components.js';

const WHITE = { r: 1, g: 1, b: 1 };
const CAM = { x: 0, y: 0, z: 20 };
const PTS: Array<[number, number, number]> = [[0, 0, 0], [10, 0, 0], [20, 0, 0]];

describe('lineRibbon（纯函数·朝相机带线）', () => {
  it('实线：N 点 → (N-1) 段·每段 4 顶点 2 三角', () => {
    const rb = lineRibbon(PTS, CAM, 0.5, WHITE, 1, 0, 0, false);
    expect(rb.positions.length).toBe((3 - 1) * 4 * 3); // 2 段 ×4 顶点 ×3
    expect(rb.indices.length).toBe((3 - 1) * 6);        // 2 段 ×2 三角 ×3
    expect(rb.colors.length).toBe((3 - 1) * 4 * 4);     // RGBA
  });
  it('带宽：垂直视线方向展开（相机 +Z·沿 +X 线 → 顶点在 ±Y 分开）', () => {
    const rb = lineRibbon([[0, 0, 0], [10, 0, 0]], CAM, 0.5, WHITE, 1, 0, 0, false);
    // 首段两顶点 y 应分开（side = tangent(+X) × view(+Z) = ±Y）
    expect(Math.abs(rb.positions[1]! - rb.positions[4]!)).toBeGreaterThan(0.1);
  });
  it('虚线：dash>0 → 分段（总顶点比实线多但有间隔·段数 = 实段数）', () => {
    const solid = lineRibbon([[0, 0, 0], [20, 0, 0]], CAM, 0.5, WHITE, 1, 0, 0, false);
    const dashed = lineRibbon([[0, 0, 0], [20, 0, 0]], CAM, 0.5, WHITE, 1, 2, 2, false);
    expect(dashed.indices.length).toBeGreaterThan(0);        // 有虚线段
    expect(dashed.indices.length).toBeLessThan(solid.indices.length * 20); // 有限（不是每采样都连·gap 断开）
    // 虚线段数应为偶数化的 dash 覆盖（周期 4·长 20 → ~5 个实段）
    const dashQuads = dashed.indices.length / 6;
    expect(dashQuads).toBeGreaterThanOrEqual(3);
  });
  it('闭合 closed：多一段回首点', () => {
    const open = lineRibbon(PTS, CAM, 0.5, WHITE, 1, 0, 0, false);
    const closed = lineRibbon(PTS, CAM, 0.5, WHITE, 1, 0, 0, true);
    expect(closed.indices.length).toBeGreaterThan(open.indices.length); // 多末点→首点一段
  });
  it('<2 点 → 空', () => {
    expect(lineRibbon([[1, 1, 1]], CAM, 0.5, WHITE, 1, 0, 0, false).indices.length).toBe(0);
  });
});

describe('LineSystem（脏标/生命周期·render-only）', () => {
  const cam = (): THREE.Camera => { const c = new THREE.PerspectiveCamera(50, 2, 0.1, 100); c.position.set(0, 0, 20); c.updateMatrixWorld(); return c; };
  it('contentSig：points 变即变；build 挂/清网格', () => {
    const scene = new THREE.Scene();
    const w = new World(); w.createEntity('aim');
    w.addComponent('aim', { type: 'Line3D', points: PTS, width: 0.4, color: 0x00ffcc } as Line3D);
    const sys = new LineSystem();
    const s1 = sys.contentSig(w);
    expect(sys.build(scene, w, cam())).toBe(1);
    expect(scene.children.some((o) => o instanceof THREE.Mesh)).toBe(true);
    // points 变 → sig 变
    w.removeComponent('aim', 'Line3D');
    w.addComponent('aim', { type: 'Line3D', points: [[0, 0, 0], [5, 5, 5]] } as Line3D);
    expect(sys.contentSig(w)).not.toBe(s1);
    // 实体消失 → 清理
    w.destroyEntity('aim');
    expect(sys.build(scene, w, cam())).toBe(0);
    expect(scene.children.some((o) => o instanceof THREE.Mesh)).toBe(false);
  });
});

describe('Line3D = render-only（不进 hash）', () => {
  it('加 Line3D 不改变 world hash', () => {
    const w = new World(); w.createEntity('e');
    const h0 = hashSnapshot(w.snapshot());
    w.addComponent('e', { type: 'Line3D', points: PTS, dash: 1 } as Line3D);
    expect(hashSnapshot(w.snapshot())).toBe(h0); // Line3D 被 NON_DETERMINISTIC 排除
  });
});
