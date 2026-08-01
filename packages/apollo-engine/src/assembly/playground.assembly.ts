import { defineCapability } from '@engine/core/define-capability.js';
import type { Transform, Velocity } from '@engine/protocol/components.js';
import type { WorldBlueprint } from './demo.assembly.js';
import { transformCapability, velocityCapability, shapeCapability, colorCapability } from '@atom-skills/index.js';

const WORLD_W = 640;
const WORLD_H = 400;

// demo 专用系统：移动 + 画布环绕，融合成单系统。
// （故意合一：两个都写 Transform 的系统会让粗粒度拓扑排序判成环。）
export const driftCapability = defineCapability({
  id: 'demo-drift',
  version: '1.0.0',
  describe: {
    name: 'drift',
    summary: '按 velocity 移动并在画布边界环绕',
    semantic: ['demo'],
    whenToUse: '演示用，让实体持续可见地运动',
    examples: [],
  },
  components: { provides: {}, reads: ['Transform', 'Velocity'], writes: ['Transform'], consumes: [] },
  config: {},
  systems: [
    {
      id: 'drift',
      reads: ['Transform', 'Velocity'],
      writes: ['Transform'],
      consumes: [],
      execute(world) {
        for (const [id] of world.query('Transform', 'Velocity')) {
          const t = world.getComponent<Transform>(id, 'Transform')!;
          const v = world.getComponent<Velocity>(id, 'Velocity')!;
          t.x += v.vx;
          t.y += v.vy;
          if (t.x > WORLD_W) t.x -= WORLD_W;
          else if (t.x < 0) t.x += WORLD_W;
          if (t.y > WORLD_H) t.y -= WORLD_H;
          else if (t.y < 0) t.y += WORLD_H;
        }
      },
    },
  ],
});

// 浏览器演示场景：三个彩色形状持续运动并环绕 —— 前端"跑通"的可视证据。
export const playgroundBlueprint: WorldBlueprint = {
  capabilities: [transformCapability, velocityCapability, shapeCapability, colorCapability, driftCapability],
  entities: {
    redBox: {
      Transform: { x: 60, y: 90, rotation: 0, scaleX: 1, scaleY: 1 },
      Velocity: { vx: 2.2, vy: 0.7, angular: 0 },
      Shape: { kind: 'box', width: 44, height: 44 },
      Color: { tint: 0xef4444, alpha: 1 },
    },
    blueCircle: {
      Transform: { x: 320, y: 260, rotation: 0, scaleX: 1, scaleY: 1 },
      Velocity: { vx: -1.6, vy: 1.2, angular: 0 },
      Shape: { kind: 'circle', radius: 26 },
      Color: { tint: 0x3b82f6, alpha: 1 },
    },
    greenBox: {
      Transform: { x: 520, y: 160, rotation: 0, scaleX: 1, scaleY: 1 },
      Velocity: { vx: -2.7, vy: -1.0, angular: 0 },
      Shape: { kind: 'box', width: 30, height: 30 },
      Color: { tint: 0x22c55e, alpha: 1 },
    },
    // 玩家方块：速度由键盘输入逐 tick 驱动（applyCommands 写 Velocity，drift 结算位移）。
    // 这是多人接缝的本地端——把输入源换成网络对端即可联机。
    player: {
      Transform: { x: 320, y: 200, rotation: 0, scaleX: 1, scaleY: 1 },
      Velocity: { vx: 0, vy: 0, angular: 0 },
      Controllable: { playerId: 'p1', speed: 3 },
      Shape: { kind: 'box', width: 34, height: 34 },
      Color: { tint: 0xffffff, alpha: 1 },
    },
  },
};
