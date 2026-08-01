import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { SystemPhase } from '@engine/core/types.js';
import type { Facing, Transform, Velocity, Relation } from '@engine/protocol/components.js';
import { facingCapability } from './facing.js';

const xf = (x: number, sx = 1): Transform => ({ type: 'Transform', x, y: 0, rotation: 0, scaleX: sx, scaleY: 1 });
const sx = (w: World, e: string): number => w.getComponent<Transform>(e, 'Transform')!.scaleX;

function world(): World {
  const w = new World();
  for (const s of facingCapability.systems) w.addSystem(s);
  return w;
}

describe('facing — 元数据', () => {
  it('id + Commit 相位', () => {
    expect(facingCapability.id).toBe('t2-facing');
    expect(facingCapability.systems[0].phase).toBe(SystemPhase.Commit);
  });
});

describe('facing — velocity 模式', () => {
  it('向右走→scaleX 正；向左→负；静止→保持', () => {
    const w = world();
    w.createEntity('m');
    w.addComponent('m', xf(0, 1));
    w.addComponent('m', { type: 'Velocity', vx: 5, vy: 0, angular: 0 } as Velocity);
    w.addComponent('m', { type: 'Facing', mode: 'velocity' } as Facing);
    w.tick();
    expect(sx(w, 'm')).toBe(1); // 朝右
    w.getComponent<Velocity>('m', 'Velocity')!.vx = -5;
    w.tick();
    expect(sx(w, 'm')).toBe(-1); // 朝左镜像
    w.getComponent<Velocity>('m', 'Velocity')!.vx = 0;
    w.tick();
    expect(sx(w, 'm')).toBe(-1); // 静止保持上次朝向
  });

  it('保留缩放幅度（只翻符号）', () => {
    const w = world();
    w.createEntity('m');
    w.addComponent('m', xf(0, 2)); // scaleX=2
    w.addComponent('m', { type: 'Velocity', vx: -3, vy: 0, angular: 0 } as Velocity);
    w.addComponent('m', { type: 'Facing', mode: 'velocity' } as Facing);
    w.tick();
    expect(sx(w, 'm')).toBe(-2); // 幅度 2 保留、符号翻负
  });
});

describe('facing — target 模式', () => {
  it('面朝 Relation(target) 方向', () => {
    const w = world();
    w.createEntity('hero');
    w.addComponent('hero', xf(100));
    w.createEntity('m');
    w.addComponent('m', xf(0, 1));
    w.addComponent('m', { type: 'Facing', mode: 'target' } as Facing);
    w.addComponent('m', { type: 'Relation', kind: 'target', targetId: 'hero' } as unknown as Relation);
    w.tick();
    expect(sx(w, 'm')).toBe(1); // hero 在右 → 朝右
    w.getComponent<Transform>('hero', 'Transform')!.x = -100;
    w.tick();
    expect(sx(w, 'm')).toBe(-1); // hero 在左 → 朝左
  });
});
