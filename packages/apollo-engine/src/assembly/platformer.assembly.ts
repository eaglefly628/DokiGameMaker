import type { WorldBlueprint } from './demo.assembly.js';
import {
  transformCapability,
  velocityCapability,
  accelerationCapability,
  shapeCapability,
  colorCapability,
  overlapDetectCapability,
} from '@atom-skills/index.js';
import { accelApplyCapability, motionApplyCapability } from '@skills/tier1/index.js';
import { collisionResolveCapability, groundSenseCapability, jumpCapability, boundsClampCapability } from '@skills/tier2/index.js';

// ═══════════════════════════════════════════════════════════════
//  可玩平台跳跃场景 —— ←/→ 移动，空格跳跃
// ═══════════════════════════════════════════════════════════════
//  画面里的每一个行为都不是某个系统"写死"的，而是 6 个各自独立的原子组合涌现的：
//    重力(accel-apply) ⊕ 运动(motion-apply) ⊕ 重叠检测(overlap-detect)
//    ⊕ 落地感知(ground-sense) ⊕ 碰撞解算(collision-resolve) ⊕ 跳跃(jump)
//  靠 SystemPhase 自动定序成 Update→Resolve→Commit。
//
//  输入接缝：玩家是 Controllable（横向移动复用既有 applyCommands），同时有 Acceleration（重力）。
//  因此 applyCommands 只用输入控其水平速度、垂直交给重力；空格 → Action{name:'jump'}，
//  jump 系统仅在 Grounded（脚下有静态面）时转成向上冲量 → 离地即不可二段跳。
// ═══════════════════════════════════════════════════════════════

const GROUND_TINT = 0x4b5563;
const PLATFORM_TINT = 0x6b7280;
const PLAYER_TINT = 0xfbbf24;

export const platformerBlueprint: WorldBlueprint = {
  capabilities: [
    // 组件契约
    transformCapability,
    velocityCapability,
    accelerationCapability,
    shapeCapability,
    colorCapability,
    // 系统（带 phase，自动定序）
    accelApplyCapability,
    motionApplyCapability,
    overlapDetectCapability,
    groundSenseCapability,
    collisionResolveCapability,
    jumpCapability,
    boundsClampCapability,
  ],
  entities: {
    // 静态地面与平台：无 Velocity = 静态。ground-sense 视其为可站立面，collision-resolve 把玩家挡在外面。
    ground: {
      Transform: { x: 320, y: 372, rotation: 0, scaleX: 1, scaleY: 1 },
      Shape: { kind: 'box', width: 620, height: 48 },
      Color: { tint: GROUND_TINT, alpha: 1 },
    },
    platformLeft: {
      Transform: { x: 150, y: 280, rotation: 0, scaleX: 1, scaleY: 1 },
      Shape: { kind: 'box', width: 150, height: 24 },
      Color: { tint: PLATFORM_TINT, alpha: 1 },
    },
    platformRight: {
      Transform: { x: 500, y: 210, rotation: 0, scaleX: 1, scaleY: 1 },
      Shape: { kind: 'box', width: 150, height: 24 },
      Color: { tint: PLATFORM_TINT, alpha: 1 },
    },
    // 玩家：动态方块。重力下坠，←/→ 走，空格跳。
    player: {
      Transform: { x: 320, y: 80, rotation: 0, scaleX: 1, scaleY: 1 },
      Velocity: { vx: 0, vy: 0, angular: 0 },
      Acceleration: { ax: 0, ay: 0.6 },
      Controllable: { playerId: 'p1', speed: 3 },
      Shape: { kind: 'box', width: 30, height: 30 },
      Color: { tint: PLAYER_TINT, alpha: 1 },
      Bounds: { minX: 0, minY: 0, maxX: 640, maxY: 400 },
    },
  },
};
