import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { World } from '@engine/core/world.js';
import { SystemPhase } from '@engine/core/types.js';
import type { FaceDir, FaceRotate, Transform, Velocity, Relation } from '@engine/protocol/components.js';
import { faceRotateCapability } from './face-rotate.js';
import { motionApplyCapability } from '@skills/tier1/index.js';
import { steeringCapability, facingCapability } from '@skills/tier2/index.js';

// face-rotate 测试（REQ-FACE-ROTATE）。俯视有向物按方向旋转贴图——sim 侧只写单位方向向量 FaceDir
// （sqrt 归一·零 trig），渲染器另行 atan2（见 renderable.test.ts 的 resolveRotation2D 断言）。

const xf = (x = 0, y = 0): Transform => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const fd = (w: World, e: string): FaceDir | undefined => w.getComponent<FaceDir>(e, 'FaceDir');

function world(): World {
  const w = new World();
  for (const s of faceRotateCapability.systems) w.addSystem(s);
  return w;
}

describe('face-rotate — 元数据', () => {
  it('id + Commit 相位', () => {
    expect(faceRotateCapability.id).toBe('t2-face-rotate');
    expect(faceRotateCapability.systems[0].phase).toBe(SystemPhase.Commit);
  });
});

describe('face-rotate — sim 侧零三角函数（自证）', () => {
  it('face-rotate.ts 源码不含 Math.sin/cos/atan2（sim 只用 sqrt 归一，跨机安全）', () => {
    const src = readFileSync(fileURLToPath(new URL('./face-rotate.ts', import.meta.url)), 'utf8');
    expect(/Math\.(sin|cos|atan2)\s*\(/.test(src)).toBe(false);
  });
});

describe('face-rotate — velocity 模式', () => {
  it('斜向速度(3,4) → 单位向量(0.6,0.8)，|FaceDir|≈1', () => {
    const w = world();
    w.createEntity('m');
    w.addComponent('m', xf());
    w.addComponent('m', { type: 'Velocity', vx: 3, vy: 4, angular: 0 } as Velocity);
    w.addComponent('m', { type: 'FaceRotate', source: 'velocity' } as FaceRotate);
    w.tick();
    const d = fd(w, 'm')!;
    expect(d.x).toBeCloseTo(0.6, 9);
    expect(d.y).toBeCloseTo(0.8, 9);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 9);
  });

  it('静止且从未写过 → 默认朝右 (1,0)', () => {
    const w = world();
    w.createEntity('m');
    w.addComponent('m', xf());
    w.addComponent('m', { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
    w.addComponent('m', { type: 'FaceRotate', source: 'velocity' } as FaceRotate);
    w.tick();
    const d = fd(w, 'm')!;
    expect(d.x).toBe(1);
    expect(d.y).toBe(0);
  });

  it('移动后静止 → 保持上次朝向（不抖）', () => {
    const w = world();
    w.createEntity('m');
    w.addComponent('m', xf());
    const v = { type: 'Velocity', vx: 0, vy: -2, angular: 0 } as Velocity;
    w.addComponent('m', v);
    w.addComponent('m', { type: 'FaceRotate', source: 'velocity' } as FaceRotate);
    w.tick();
    expect(fd(w, 'm')!.x).toBeCloseTo(0, 9);
    expect(fd(w, 'm')!.y).toBeCloseTo(-1, 9);
    v.vx = 0;
    v.vy = 0;
    w.tick();
    expect(fd(w, 'm')!.x).toBeCloseTo(0, 9); // 未被清零/未被覆盖成默认
    expect(fd(w, 'm')!.y).toBeCloseTo(-1, 9);
  });
});

describe('face-rotate — target 模式', () => {
  it('面朝 Relation(target) 方向的单位向量', () => {
    const w = world();
    w.createEntity('hero');
    w.addComponent('hero', xf(0, 30)); // 目标在正上方（+y）
    w.createEntity('turret');
    w.addComponent('turret', xf(0, 0));
    w.addComponent('turret', { type: 'FaceRotate', source: 'target' } as FaceRotate);
    w.addComponent('turret', { type: 'Relation', kind: 'target', targetId: 'hero' } as unknown as Relation);
    w.tick();
    const d = fd(w, 'turret')!;
    expect(d.x).toBeCloseTo(0, 9);
    expect(d.y).toBeCloseTo(1, 9);
  });

  it('无目标/目标缺失 → 不崩、保持默认', () => {
    const w = world();
    w.createEntity('turret');
    w.addComponent('turret', xf(0, 0));
    w.addComponent('turret', { type: 'FaceRotate', source: 'target' } as FaceRotate);
    expect(() => w.tick()).not.toThrow();
    expect(fd(w, 'turret')).toEqual({ type: 'FaceDir', x: 1, y: 0 });
  });
});

describe('face-rotate — 确定性', () => {
  it('同布局两次跑 → 同快照（无随机/墙钟）', () => {
    const run = (): string => {
      const w = world();
      w.createEntity('a');
      w.addComponent('a', xf());
      w.addComponent('a', { type: 'Velocity', vx: -3, vy: 4, angular: 0 } as Velocity);
      w.addComponent('a', { type: 'FaceRotate', source: 'velocity' } as FaceRotate);
      w.createEntity('hero');
      w.addComponent('hero', xf(10, -10));
      w.createEntity('b');
      w.addComponent('b', xf(0, 0));
      w.addComponent('b', { type: 'FaceRotate', source: 'target' } as FaceRotate);
      w.addComponent('b', { type: 'Relation', kind: 'target', targetId: 'hero' } as unknown as Relation);
      for (let i = 0; i < 10; i++) w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});

describe('face-rotate — 撞环回归（与相关能力同装）', () => {
  it('与 motion-apply/steering/facing 同装可 tick 不抛', () => {
    const w = new World();
    for (const cap of [motionApplyCapability, steeringCapability, facingCapability, faceRotateCapability]) {
      for (const s of cap.systems) w.addSystem(s);
    }
    w.createEntity('hero');
    w.addComponent('hero', xf(50, 0));
    w.createEntity('chaser');
    w.addComponent('chaser', xf(0, 0));
    w.addComponent('chaser', { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
    w.addComponent('chaser', { type: 'Steering', mode: 'seek', speed: 2, stopRange: 5 } as never);
    w.addComponent('chaser', { type: 'Facing', mode: 'velocity' } as never);
    w.addComponent('chaser', { type: 'FaceRotate', source: 'velocity' } as FaceRotate);
    w.addComponent('chaser', { type: 'Relation', kind: 'target', targetId: 'hero' } as unknown as Relation);
    expect(() => {
      for (let i = 0; i < 20; i++) w.tick();
    }).not.toThrow();
    // 追向 hero(+x) → FaceDir 应朝右为主
    const d = fd(w, 'chaser')!;
    expect(d.x).toBeGreaterThan(0);
  });
});
