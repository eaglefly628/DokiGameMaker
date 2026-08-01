// Anim3D（程序化位姿动画·render-only）：纯函数求值 + 系统按壁钟改 Transform3D 分量 + 不进 hash。
import { describe, it, expect } from 'vitest';
import { Anim3DSystem } from './anim3d.js';
import { anim3dField, transform3dPose, springValue } from '../three-projection.js';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/index.js';
import type { Anim3D, Transform3D } from '@engine/protocol/components.js';

describe('anim3dField（纯函数·spin/bob）', () => {
  it('spin：field = 初值 + rate·t（匀速自转）', () => {
    expect(anim3dField({ kind: 'spin', rate: 0.36 }, 0, 0.7)).toBeCloseTo(0.7);
    expect(anim3dField({ kind: 'spin', rate: 0.36 }, 2, 0.7)).toBeCloseTo(0.7 + 0.72); // 1.42
  });
  it('bob：field = 初值 + amp·sin(t·freq + phase)（正弦浮动）', () => {
    expect(anim3dField({ kind: 'bob', amp: 0.13, freq: 1.8 }, 0, 0.78)).toBeCloseTo(0.78); // sin0=0
    // t·freq+phase = π/2 → sin=1 → 峰值 base+amp
    const tPeak = Math.PI / 2 / 1.8;
    expect(anim3dField({ kind: 'bob', amp: 0.13, freq: 1.8 }, tPeak, 0.78)).toBeCloseTo(0.78 + 0.13);
  });

  it('osc 波形（sine/triangle/saw/square 归一 [-1,1]）', () => {
    const at = (wave: 'sine' | 'triangle' | 'saw' | 'square', x: number) => anim3dField({ kind: 'osc', wave, amp: 1, freq: 1, phase: 0 }, x, 0);
    // x=π/2：sine=1·triangle=峰1·saw≈0.5·square=1
    expect(at('sine', Math.PI / 2)).toBeCloseTo(1);
    expect(at('triangle', Math.PI / 2)).toBeCloseTo(1); // 三角在 1/4 周期到峰
    expect(at('square', Math.PI / 2)).toBe(1);
    expect(at('square', -Math.PI / 2)).toBe(-1);
    expect(at('saw', Math.PI / 2)).toBeCloseTo(0.5); // 锯齿 1/4 周期 = 0.5（x=0 过零上升）
    expect(Math.abs(at('sine', 0))).toBeLessThan(1e-9); // 原点 0
  });

  it('noise：确定性（同 t 同值）+ 在 [初值±amp] 内', () => {
    const n = (t: number) => anim3dField({ kind: 'noise', amp: 0.5, freq: 2, seed: 7 }, t, 3);
    expect(n(1.3)).toBe(n(1.3)); // 确定性
    for (const t of [0, 0.5, 1.7, 4.2]) { expect(n(t)).toBeGreaterThanOrEqual(3 - 0.5); expect(n(t)).toBeLessThanOrEqual(3 + 0.5); }
  });

  it('spring：t0=from·渐近 to·欠阻尼过冲（弹跳）·临界不过冲', () => {
    const under = { to: 1, from: 0, freq: 2, damping: 0.3 };
    expect(springValue(under, 0, 0)).toBeCloseTo(0);          // t0 = from
    expect(springValue(under, 5, 0)).toBeCloseTo(1, 1);       // 渐近 to
    // 欠阻尼：过程中某点越过 to（过冲 >1）
    let overshot = false;
    for (let t = 0; t < 1; t += 0.02) if (springValue(under, t, 0) > 1.02) overshot = true;
    expect(overshot).toBe(true);
    // 临界阻尼(=1)：不过冲（全程 ≤ to）
    const crit = { to: 1, from: 0, freq: 2, damping: 1 };
    let over = false;
    for (let t = 0; t < 3; t += 0.02) if (springValue(crit, t, 0) > 1.0001) over = true;
    expect(over).toBe(false);
    // from 缺省 = base 初值
    expect(springValue({ to: 5, freq: 2 }, 0, 2)).toBeCloseTo(2); // t0 = base
  });

  it('ease：from→to 经 dur（delay 后起·超 dur 保持 to·绝对值不绕初值）', () => {
    const e = { kind: 'ease' as const, from: 0, to: 2, dur: 1, curve: 'linear' as const, delay: 0.5 };
    expect(anim3dField(e, 0, 99)).toBe(0); // delay 前 = from（不绕 base 99）
    expect(anim3dField(e, 0.5, 99)).toBe(0); // 起点
    expect(anim3dField(e, 1.0, 99)).toBeCloseTo(1); // 半程（linear）= 1
    expect(anim3dField(e, 1.5, 99)).toBeCloseTo(2); // 终点
    expect(anim3dField(e, 5.0, 99)).toBeCloseTo(2); // 超 dur 保持 to
    // outBack 回弹过冲：中段可能 >to 或 <from
    const ob = anim3dField({ kind: 'ease', from: 0, to: 1, dur: 1, curve: 'outBack' }, 0.7, 0);
    expect(ob).toBeGreaterThan(1); // 过冲峰 >1
  });
});

describe('Anim3DSystem（据壁钟改 Transform3D·render-only）', () => {
  const mk = (): World => {
    const w = new World();
    w.createEntity('g');
    w.addComponent('g', { type: 'Transform3D', x: 0, y: 0.78, z: 0, rotY: 0.7 } as Transform3D);
    w.addComponent('g', { type: 'Anim3D', channels: [
      { kind: 'spin', field: 'rotY', rate: 0.36 }, { kind: 'bob', field: 'y', amp: 0.13, freq: 1.8 },
    ] } as Anim3D);
    return w;
  };

  it('spin 随经过秒推进 rotY（首见捕获初值·帧率无关·无累积漂移）', () => {
    const w = mk();
    const sys = new Anim3DSystem();
    const t = (): Transform3D => w.getComponent<Transform3D>('g', 'Transform3D')!;
    expect(sys.sync(w, 1000)).toBe(1); // 首帧捕获 base(rotY0.7)·tSec0 → rotY 仍 0.7
    expect(t().rotY).toBeCloseTo(0.7);
    sys.sync(w, 2000); // tSec 1 → 0.7 + 0.36
    expect(t().rotY).toBeCloseTo(1.06);
    sys.sync(w, 3000); // tSec 2 → 0.7 + 0.72（按初值算·非累加）
    expect(t().rotY).toBeCloseTo(1.42);
  });

  it('bob 绕 y 初值正弦摆（不漂移）', () => {
    const w = mk();
    const sys = new Anim3DSystem();
    const t = (): Transform3D => w.getComponent<Transform3D>('g', 'Transform3D')!;
    sys.sync(w, 1000); // tSec0 → y = 0.78
    expect(t().y).toBeCloseTo(0.78);
    const tPeakMs = 1000 + (Math.PI / 2 / 1.8) * 1000;
    sys.sync(w, tPeakMs); // 峰值 → 0.78 + 0.13
    expect(t().y).toBeCloseTo(0.78 + 0.13);
  });

  it('同 field 多通道叠加（compose·非覆盖）→ spin+bob 同 rotY = 变速自转（REQ-3D-骰盅 P18 下沉）', () => {
    const w = new World();
    w.createEntity('d');
    w.addComponent('d', { type: 'Transform3D', x: 0, y: 0, z: 0, rotY: 0.5 } as Transform3D);
    w.addComponent('d', { type: 'Anim3D', channels: [
      { kind: 'spin', field: 'rotY', rate: 1.0 }, { kind: 'bob', field: 'rotY', amp: 0.4, freq: 2.0 },
    ] } as Anim3D);
    const sys = new Anim3DSystem();
    const rotY = (): number => w.getComponent<Transform3D>('d', 'Transform3D')!.rotY!;
    sys.sync(w, 1000); // base 捕获·tSec0：spin delta 0 + bob delta 0 → 0.5
    expect(rotY()).toBeCloseTo(0.5);
    sys.sync(w, 2000); // tSec1：0.5 + spin(1.0·1) + bob(0.4·sin2) = 0.5 + 1.0 + 0.4·sin(2)
    expect(rotY()).toBeCloseTo(0.5 + 1.0 + 0.4 * Math.sin(2)); // 叠加·非覆盖（旧行为=后通道覆盖=只 bob）
  });

  it('一次性 ease 播完 → 不再计活跃（渲染器可 idle）·终值保持', () => {
    const w = new World();
    w.createEntity('p');
    w.addComponent('p', { type: 'Transform3D', x: 0, y: 0, z: 0, scale: 1 } as Transform3D);
    w.addComponent('p', { type: 'Anim3D', channels: [{ kind: 'ease', field: 'scale', from: 0, to: 1, dur: 0.5, curve: 'linear' }] } as Anim3D);
    const sys = new Anim3DSystem();
    const sc = (): number => w.getComponent<Transform3D>('p', 'Transform3D')!.scale!;
    expect(sys.sync(w, 1000)).toBe(1); // t0：ease 进行中 → 活跃·scale=0
    expect(sc()).toBeCloseTo(0);
    expect(sys.sync(w, 1250)).toBe(1); // t0.25：半程·仍活跃
    expect(sc()).toBeCloseTo(0.5);
    expect(sys.sync(w, 1600)).toBe(0); // t0.6>dur：播完 → **不计活跃**（idle）
    expect(sc()).toBeCloseTo(1); // 保持终值 to
  });

  it('挤压拉伸：分轴 scaleY 动画独立于 scaleX/Z（squash&stretch·分轴基准回退等比 scale）', () => {
    const w = new World();
    w.createEntity('sq');
    w.addComponent('sq', { type: 'Transform3D', x: 0, y: 0, z: 0, scale: 2 } as Transform3D); // 作者等比 2
    // 落地压扁：scaleY 1→0.6（分轴 ease·绝对值），scaleX/Z 不动（回退等比 2）
    w.addComponent('sq', { type: 'Anim3D', channels: [{ kind: 'ease', field: 'scaleY', from: 1, to: 0.6, dur: 1, curve: 'linear' }] } as Anim3D);
    const sys = new Anim3DSystem();
    const t = (): Transform3D => w.getComponent<Transform3D>('sq', 'Transform3D')!;
    sys.sync(w, 1000); // t0 → scaleY=1（ease from）
    sys.sync(w, 2000); // t1 → scaleY=0.6（到终值）
    expect(t().scaleY).toBeCloseTo(0.6);
    const pose = transform3dPose(t());
    expect(pose.sy).toBeCloseTo(0.6);   // 分轴覆盖 y
    expect(pose.sx).toBeCloseTo(2);     // x 回退作者等比 scale
    expect(pose.sz).toBeCloseTo(2);     // z 回退作者等比 scale
  });

  it('空场返回 0；实体消失后清理动画态（流式卸载安全）', () => {
    const sys = new Anim3DSystem();
    const empty = new World();
    expect(sys.sync(empty, 16)).toBe(0);
    const w = mk();
    expect(sys.sync(w, 1000)).toBe(1);
    w.destroyEntity('g');
    expect(sys.sync(w, 2000)).toBe(0); // 无实体 → 0·态已清
  });
});

describe('Anim3D 是 render-only（不进 hash）', () => {
  it('挂 Anim3D 不改变快照哈希', () => {
    const w = new World();
    w.createEntity('g');
    const h0 = hashSnapshot(w.snapshot());
    w.addComponent('g', { type: 'Anim3D', channels: [{ kind: 'spin', field: 'rotY', rate: 1 }] } as Anim3D);
    expect(hashSnapshot(w.snapshot())).toBe(h0); // Anim3D 不进 hash
  });
});
