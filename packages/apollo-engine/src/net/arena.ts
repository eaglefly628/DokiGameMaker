import { World } from '@engine/core/world.js';
import type { Transform, Velocity, Controllable } from '@engine/protocol/components.js';
import { motionApplyCapability } from '@skills/tier1/motion-apply.js';

// 最小竞技场：两个分别由玩家 A / B 操控的实体 + motion-apply（速度→位移）。
// 测试与 headless demo 共用，保证"被验证的世界"和"被演示的世界"是同一个。
export function buildArena(): World {
  const w = new World();
  for (const s of motionApplyCapability.systems) w.addSystem(s);

  w.createEntity('alice');
  w.addComponent('alice', { type: 'Transform', x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent('alice', { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
  w.addComponent('alice', { type: 'Controllable', playerId: 'A', speed: 3 } as Controllable);

  w.createEntity('bob');
  w.addComponent('bob', { type: 'Transform', x: 200, y: 200, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent('bob', { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
  w.addComponent('bob', { type: 'Controllable', playerId: 'B', speed: 2 } as Controllable);

  return w;
}
