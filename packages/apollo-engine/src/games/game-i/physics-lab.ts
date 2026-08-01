// Game I · 运动与碰撞样例（底座「运动学 + 碰撞检测」能力展示）
//
// 纯蓝图数据，不写专属 system：motion-apply 每拍把 Velocity 累加进 Transform（运动学位移），
// overlap-detect 宽相位 AABB + 窄相位算出重叠对 Overlap{entityA,entityB,normal,depth}。引擎 CanvasRenderer 绘制。
//
// 三柱：motion-apply（Velocity→Transform 运动学位移）+ overlap-detect（宽相位 AABB + 窄相位 →
// Overlap{entityA,entityB,normal,depth} 碰撞事实）+ collision-resolve（按 Mass + 重叠法线把相撞体推开 →
// 真·碰撞响应）。四物体相向运动，于中心相撞后被推开。全是数据，无专属 system。

import type { WorldBlueprint } from '../../assembly/demo.assembly.js';
import { transformCapability, velocityCapability, shapeCapability, colorCapability, overlapDetectCapability } from '@atom-skills/index.js';
import { motionApplyCapability } from '@skills/tier1/index.js';
import { collisionResolveCapability } from '@skills/tier2/index.js';

function body(x: number, y: number, vx: number, vy: number, tint: number): WorldBlueprint['entities'][string] {
  return {
    Transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
    Velocity: { vx, vy, angular: 0 },
    Mass: { value: 1 },                          // collision-resolve 按质量分配推开量
    Shape: { kind: 'circle', radius: 24 },
    Color: { tint, alpha: 1 },
  };
}

/** 运动与碰撞样例蓝图：四物体相向运动，于中心相撞被推开（检测 + 响应）。 */
export function physicsBlueprint(): WorldBlueprint {
  return {
    capabilities: [transformCapability, velocityCapability, shapeCapability, colorCapability, overlapDetectCapability, motionApplyCapability, collisionResolveCapability],
    entities: {
      'body-nw': body(120, 90, 1.4, 0.78, 0x9cd2c5),
      'body-ne': body(520, 90, -1.4, 0.78, 0xd4bd8a),
      'body-sw': body(120, 310, 1.4, -0.78, 0x7fc7e8),
      'body-se': body(520, 310, -1.4, -0.78, 0xd07a6a),
    },
  };
}
