// Path3D 路径跟随（render-only）：纯采样函数 + loop 参数 + 系统写 Transform3D + 不进 hash。
import { describe, it, expect } from 'vitest';
import { samplePath, pathParam, PathSystem } from './path.js';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/index.js';
import type { Path3D, Transform3D } from '@engine/protocol/components.js';

const PTS: Array<readonly [number, number, number]> = [[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10]];

describe('samplePath（纯函数·折线/平滑）', () => {
  it('linear：端点精确·中点线性插值', () => {
    expect(samplePath(PTS, 0, 'linear', false)).toMatchObject({ x: 0, z: 0 });
    expect(samplePath(PTS, 1, 'linear', false)).toMatchObject({ x: 0, z: 10 }); // 末点
    const mid = samplePath(PTS, 0.5, 'linear', false); // 3 段·0.5 落在第 2 段(10,0,0)→(10,0,10) 中点
    expect(mid.x).toBeCloseTo(10); expect(mid.z).toBeCloseTo(5);
  });
  it('smooth：过控制点（端点仍精确）', () => {
    expect(samplePath(PTS, 0, 'smooth', false)).toMatchObject({ x: 0, z: 0 });
    const q = samplePath(PTS, 1 / 3, 'smooth', false); // 段边界 → 恰在控制点 (10,0,0)
    expect(q.x).toBeCloseTo(10); expect(q.z).toBeCloseTo(0);
  });
  it('闭合 closed：末段回到首点', () => {
    const near1 = samplePath(PTS, 0.999, 'linear', true); // closed=4 段·末段 (0,0,10)→(0,0,0)
    expect(near1.z).toBeLessThan(1); // 正接近首点
  });
  it('退化保护：<2 点返回首点/原点', () => {
    expect(samplePath([[3, 4, 5]], 0.7, 'smooth', false)).toMatchObject({ x: 3, y: 4, z: 5 });
    expect(samplePath([], 0.5, 'linear', false)).toMatchObject({ x: 0, y: 0, z: 0 });
  });
});

describe('pathParam（loop 语义）', () => {
  it('none：钳 [0,1]·到头 inactive', () => {
    expect(pathParam(0.5, 1, 'none')).toMatchObject({ t: 0.5, active: true });
    expect(pathParam(2, 1, 'none')).toMatchObject({ t: 1, active: false });
  });
  it('loop：frac 循环·恒 active', () => {
    expect(pathParam(2.25, 1, 'loop')).toMatchObject({ t: 0.25, active: true });
  });
  it('pingpong：往复三角波', () => {
    expect(pathParam(0.5, 1, 'pingpong').t).toBeCloseTo(0.5); // 上行
    expect(pathParam(1.5, 1, 'pingpong').t).toBeCloseTo(0.5); // 下行（1.5→2-1.5=0.5）
    expect(pathParam(1.0, 1, 'pingpong').t).toBeCloseTo(1);   // 顶点
  });
});

describe('PathSystem（写 Transform3D·render-only）', () => {
  const mk = (path: Partial<Path3D>): World => {
    const w = new World(); w.createEntity('mv');
    w.addComponent('mv', { type: 'Transform3D', x: 0, y: 0, z: 0 } as Transform3D);
    w.addComponent('mv', { type: 'Path3D', points: PTS, duration: 4, mode: 'linear', ...path } as Path3D);
    return w;
  };
  it('沿路径推进位置（帧率无关·按经过秒）', () => {
    const w = mk({ loop: 'none' });
    const sys = new PathSystem();
    const t = (): Transform3D => w.getComponent<Transform3D>('mv', 'Transform3D')!;
    sys.sync(w, 1000);                       // t0 → 首点
    expect(t().x).toBeCloseTo(0); expect(t().z).toBeCloseTo(0);
    sys.sync(w, 1000 + 4000);                // 走完 4s → 末点
    expect(t().x).toBeCloseTo(0); expect(t().z).toBeCloseTo(10);
  });
  it('loop:none 到头 → 不计活跃（省帧）；loop → 恒活跃', () => {
    const none = new PathSystem(); const wn = mk({ loop: 'none' });
    none.sync(wn, 1000);
    expect(none.sync(wn, 1000 + 5000)).toBe(0); // 超时长 → inactive
    const lp = new PathSystem(); const wl = mk({ loop: 'loop' });
    lp.sync(wl, 1000);
    expect(lp.sync(wl, 1000 + 5000)).toBe(1);   // 循环 → 恒活跃
  });
  it('faceDir：写 rotY 朝切线方向', () => {
    const w = mk({ loop: 'loop', faceDir: true });
    const sys = new PathSystem();
    sys.sync(w, 1000); // 首段沿 +X 走 → heading atan2(dx,dz)=atan2(+,0)=π/2
    expect(w.getComponent<Transform3D>('mv', 'Transform3D')!.rotY).toBeCloseTo(Math.PI / 2);
  });
});

describe('Path3D = render-only（不进 hash）', () => {
  it('加 Path3D 不改变 world hash', () => {
    const w = new World(); w.createEntity('e');
    const h0 = hashSnapshot(w.snapshot());
    w.addComponent('e', { type: 'Path3D', points: PTS, duration: 3 } as Path3D);
    expect(hashSnapshot(w.snapshot())).toBe(h0); // Path3D 被 NON_DETERMINISTIC 排除
  });
});
