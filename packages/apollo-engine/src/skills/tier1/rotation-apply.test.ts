import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { SystemPhase } from '@engine/core/types.js';
import type { Transform, Velocity } from '@engine/protocol/components.js';
import { rotationApplyCapability } from './rotation-apply.js';

function mk(): World {
  const w = new World();
  for (const s of rotationApplyCapability.systems) w.addSystem(s);
  return w;
}
const T = (w: World): Transform => w.getComponent<Transform>('e', 'Transform')!;

describe('T1 rotation-apply', () => {
  it('契约：Rotate 阶段 / 读 Transform+Velocity / 写 Transform', () => {
    expect(rotationApplyCapability.systems[0].phase).toBe(SystemPhase.Rotate);
    expect(rotationApplyCapability.components.reads).toEqual(['Transform', 'Velocity']);
    expect(rotationApplyCapability.components.writes).toEqual(['Transform']);
  });
  it('angular 累加到 rotation，多 tick；x/y 不动', () => {
    const w = mk();
    w.createEntity('e');
    w.addComponent('e', { type: 'Transform', x: 5, y: 9, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('e', { type: 'Velocity', vx: 0, vy: 0, angular: 0.1 } as Velocity);
    w.tick();
    w.tick();
    w.tick();
    expect(T(w).rotation).toBeCloseTo(0.3);
    expect(T(w).x).toBe(5);
    expect(T(w).y).toBe(9);
  });
  it('angular=0 不变', () => {
    const w = mk();
    w.createEntity('e');
    w.addComponent('e', { type: 'Transform', x: 0, y: 0, rotation: 1, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('e', { type: 'Velocity', vx: 1, vy: 1, angular: 0 } as Velocity);
    w.tick();
    expect(T(w).rotation).toBe(1);
  });
});
