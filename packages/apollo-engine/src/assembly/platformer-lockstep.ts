import { World } from '@engine/core/world.js';
import type { Transform, Velocity, Acceleration, Controllable, Shape, Color, Bounds } from '@engine/protocol/components.js';
import { overlapDetectCapability } from '@atom-skills/index.js';
import { accelApplyCapability, motionApplyCapability } from '@skills/tier1/index.js';
import { collisionResolveCapability, groundSenseCapability, jumpCapability, boundsClampCapability } from '@skills/tier2/index.js';
import { playerEntityId, PLAYER_COLORS } from '../net/mp-world.js';

// 帧同步用的平台跳跃世界构建器（注入给 LockstepClient.buildWorld）。
// 关键：所有对端用**完全相同的构建顺序**（系统、再静态几何、再按 playerId 顺序的玩家）
// → 相同实体迭代序 → 逐 tick 相同哈希。几何含一个三角斜坡（polygon）供验证 SAT + 跳跃。
export function buildPlatformerLockstepWorld(playerIds: string[]): World {
  const w = new World();
  for (const cap of [
    accelApplyCapability,
    motionApplyCapability,
    overlapDetectCapability,
    groundSenseCapability,
    collisionResolveCapability,
    jumpCapability,
    boundsClampCapability,
  ]) {
    for (const s of cap.systems) w.addSystem(s);
  }

  // 静态地面（盒，640×40，顶边 y=360）。
  w.createEntity('ground');
  w.addComponent('ground', { type: 'Transform', x: 320, y: 380, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent('ground', { type: 'Shape', kind: 'box', width: 640, height: 40 } as Shape);
  w.addComponent('ground', { type: 'Color', tint: 0x475569, alpha: 1 } as Color);

  // 斜坡（三角 polygon）：world (340,360)(580,360)(580,250)，从高(右)降到低(左)。坐落在地面上。
  w.createEntity('ramp');
  w.addComponent('ramp', { type: 'Transform', x: 460, y: 340, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent('ramp', { type: 'Shape', kind: 'polygon', vertices: [-120, 20, 120, 20, 120, -90] } as Shape);
  w.addComponent('ramp', { type: 'Color', tint: 0x64748b, alpha: 1 } as Color);

  // 一块悬空平台（盒）。
  w.createEntity('platform');
  w.addComponent('platform', { type: 'Transform', x: 150, y: 270, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent('platform', { type: 'Shape', kind: 'box', width: 150, height: 20 } as Shape);
  w.addComponent('platform', { type: 'Color', tint: 0x64748b, alpha: 1 } as Color);

  // 玩家（每个 peer 一个）：动态方块，重力 + Controllable（横移）+ Bounds（不出屏）。
  playerIds.forEach((pid, i) => {
    const id = playerEntityId(pid);
    w.createEntity(id);
    w.addComponent(id, { type: 'Transform', x: 110 + i * 70, y: 80, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent(id, { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
    w.addComponent(id, { type: 'Acceleration', ax: 0, ay: 0.6 } as Acceleration);
    w.addComponent(id, { type: 'Controllable', playerId: pid, speed: 3 } as Controllable);
    w.addComponent(id, { type: 'Shape', kind: 'box', width: 28, height: 28 } as Shape);
    w.addComponent(id, { type: 'Color', tint: PLAYER_COLORS[i % PLAYER_COLORS.length], alpha: 1 } as Color);
    w.addComponent(id, { type: 'Bounds', minX: 0, minY: 0, maxX: 640, maxY: 400 } as Bounds);
  });

  return w;
}
