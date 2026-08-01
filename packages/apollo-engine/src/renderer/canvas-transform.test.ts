// 2D 渲染仿射合成（REQ-3D-RENDER-EFFICIENCY 热路径去 save/restore）：纯逻辑单测。
import { describe, it, expect } from 'vitest';
import { deviceBase, entityMatrix } from './canvas-transform.js';

// 用 6 元仿射 [a,b,c,d,e,f] 把局部点 (lx,ly) 映到设备点：dx=a*lx+c*ly+e, dy=b*lx+d*ly+f。
const apply = (m: readonly number[], lx: number, ly: number): [number, number] => [m[0]! * lx + m[2]! * ly + m[4]!, m[1]! * lx + m[3]! * ly + m[5]!];

describe('deviceBase（world→device 基变换·DPR×相机）', () => {
  it('无相机：仅 DPR 缩放（1:1×dpr）', () => {
    expect(deviceBase(2, null, 640, 400)).toEqual({ s: 2, e: 0, f: 0 });
    expect(deviceBase(1, undefined, 640, 400)).toEqual({ s: 1, e: 0, f: 0 });
  });
  it('有相机：s=dpr*zoom·平移把相机中心落视口中心', () => {
    const b = deviceBase(1, { zoom: 2, centerX: 100, centerY: 50 }, 640, 400);
    expect(b.s).toBe(2);
    expect(b.e).toBe(640 / 2 - 2 * 100); // 320-200=120
    expect(b.f).toBe(400 / 2 - 2 * 50);  // 200-100=100
    // 相机中心 world(100,50) → 应落在视口中心 device(320,200)
    const [cx, cy] = apply(entityMatrix(b, 100, 50, 0, 1, 1), 0, 0);
    expect(cx).toBeCloseTo(320); expect(cy).toBeCloseTo(200);
  });
});

describe('entityMatrix（实体世界变换折进 base）', () => {
  it('rot=0 无相机 dpr=1：退化成 translate(x,y)scale(sx,sy)（与旧逐位一致）', () => {
    const b = deviceBase(1, null, 640, 400);
    const m = entityMatrix(b, 30, 40, 0, 2, 3);
    expect(m).toEqual([2, 0, 0, 3, 30, 40]);
    // 局部原点 → (x,y)；局部 (1,0) → (x+sx, y)
    expect(apply(m, 0, 0)).toEqual([30, 40]);
    expect(apply(m, 1, 0)).toEqual([32, 40]);
    expect(apply(m, 0, 1)).toEqual([30, 43]);
  });
  it('rot=90°：局部 +X 轴转到设备 +Y（右手屏幕系）', () => {
    const b = deviceBase(1, null, 640, 400);
    const m = entityMatrix(b, 0, 0, Math.PI / 2, 1, 1);
    const [x1, y1] = apply(m, 1, 0); // 局部 (1,0) 旋转 90° → (0,1)
    expect(x1).toBeCloseTo(0); expect(y1).toBeCloseTo(1);
  });
  it('DPR + 相机 + 实体三层合成：局部点映射与逐层等价', () => {
    const dpr = 2, cam = { zoom: 1.5, centerX: 10, centerY: 20 };
    const b = deviceBase(dpr, cam, 800, 600);
    const m = entityMatrix(b, 5, 7, 0, 1, 1);
    // 逐层手算：world=(5,7)+local；logical=zoom*(world-c)+(W/2,H/2)；device=dpr*logical
    const local: [number, number] = [3, -4];
    const world = [5 + local[0], 7 + local[1]];
    const logical = [cam.zoom * (world[0] - cam.centerX) + 800 / 2, cam.zoom * (world[1] - cam.centerY) + 600 / 2];
    const device = [dpr * logical[0], dpr * logical[1]];
    const [dx, dy] = apply(m, local[0], local[1]);
    expect(dx).toBeCloseTo(device[0]); expect(dy).toBeCloseTo(device[1]);
  });
});
