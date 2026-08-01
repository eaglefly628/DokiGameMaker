// Trail3D 运动拖尾（render-only）：纯函数带几何 + 系统采样位移历史 + 不进 hash。
import { describe, it, expect } from 'vitest';
import { ribbonBuffers, TrailSystem } from './trail.js';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/index.js';
import type { Trail3D, Transform3D } from '@engine/protocol/components.js';

const WHITE = { r: 1, g: 1, b: 1 };

describe('ribbonBuffers（纯函数·朝相机带几何）', () => {
  it('<2 点 → 空带（无几何）', () => {
    const rb = ribbonBuffers([{ x: 0, y: 0, z: 0 }], { x: 0, y: 0, z: 10 }, 0.15, WHITE, 0);
    expect(rb.indices.length).toBe(0);
    expect(rb.positions.length).toBe(0);
  });
  it('N 点 → 2N 顶点 + (N-1)·2 三角·头端不透明尾端按 fade', () => {
    const pts = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }]; // 沿 +X 走
    const rb = ribbonBuffers(pts, { x: 1, y: 0, z: 10 }, 0.5, WHITE, 0); // 相机在 +Z 看
    expect(rb.positions.length).toBe(3 * 2 * 3); // 2N 顶点 ×3
    expect(rb.colors.length).toBe(3 * 2 * 4);    // 2N 顶点 ×4(RGBA)
    expect(rb.indices.length).toBe((3 - 1) * 6); // (N-1) 节 ×2 三角 ×3
    // 尾端(第0点)alpha = fade(0)；头端(末点)alpha = 1
    expect(rb.colors[3]).toBeCloseTo(0);                       // 顶点0 的 a
    expect(rb.colors[(3 * 2 - 1) * 4 + 3]).toBeCloseTo(1);     // 末顶点 的 a
  });
  it('带在垂直视线方向展开（相机在 +Z → 沿 +X 走的带在 XY 平面有宽度·Z 近似不变）', () => {
    const pts = [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }];
    const rb = ribbonBuffers(pts, { x: 0, y: 0, z: 10 }, 0.5, WHITE, 1);
    // 头端两顶点应在 y 方向分开（side = tangent(+X) × view(+Z) = ±Y）
    const headA = [rb.positions[1 * 2 * 3 + 1], rb.positions[(1 * 2 + 1) * 3 + 1]]; // 两顶点的 y
    expect(Math.abs(headA[0] - headA[1])).toBeGreaterThan(0.1); // y 上分开 = 有带宽
  });
});

describe('TrailSystem 采样（位移历史·render-only）', () => {
  const mk = (): World => {
    const w = new World();
    w.createEntity('ball');
    w.addComponent('ball', { type: 'Transform3D', x: 0, y: 0, z: 0 } as Transform3D);
    w.addComponent('ball', { type: 'Trail3D', segments: 4, minDist: 0.5 } as Trail3D);
    return w;
  };
  it('位移超 minDist 才落点·静止不堆点·超 segments 丢旧', () => {
    const w = mk();
    const sys = new TrailSystem();
    const t = (): Transform3D => w.getComponent<Transform3D>('ball', 'Transform3D')!;
    expect(sys.sample(w)).toBe(1); // 首点
    expect(sys.sample(w)).toBe(0); // 没动 → 不落点·不活跃
    t().x = 1; expect(sys.sample(w)).toBe(1); // 移 1 > 0.5 → 落点
    t().x = 1.2; expect(sys.sample(w)).toBe(0); // 只移 0.2 < 0.5 → 不落
    t().x = 2; sys.sample(w); t().x = 3; sys.sample(w); t().x = 4; expect(sys.sample(w)).toBe(1);
    // segments=4 上限：历史裁到 4（不校内部数组·至少不崩·live 语义正确）
  });
  it('实体消失 → 清理拖尾态（流式卸载安全）', () => {
    const w = mk();
    const sys = new TrailSystem();
    expect(sys.sample(w)).toBe(1);
    w.destroyEntity('ball');
    expect(sys.sample(w)).toBe(0);
  });
});

describe('Trail3D = render-only（不进 hash）', () => {
  it('加 Trail3D 不改变 world hash', () => {
    const w = new World();
    w.createEntity('e');
    const h0 = hashSnapshot(w.snapshot());
    w.addComponent('e', { type: 'Trail3D', width: 0.4, color: 0xff0000 } as Trail3D);
    expect(hashSnapshot(w.snapshot())).toBe(h0); // Trail3D 被 NON_DETERMINISTIC 排除
  });
});
