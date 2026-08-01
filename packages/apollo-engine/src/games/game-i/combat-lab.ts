// Game I · 战斗结算样例（底座「命中 → 伤害 → 状态/DoT → 死亡」能力展示）
//
// 纯蓝图数据，不写专属 system（组件写法照搬 game-d/blueprint.ts）：
//   弹道（Sensor + Tag(ZONE_FLAG) + Hitbox）飞行(motion-apply) → 与敌重叠(overlap-detect) →
//   trigger-zone 产 Trigger → hitbox 校验阵营(targetMask)后扣 Resource(hp)、可挂 OverTime(DoT) →
//   resource 结算 → mortal(hp≤0 → DestroyRequest) → destroy 移除。弹道自身 Timer(life) 到期自毁(lifetime)。

import type { WorldBlueprint } from '../../assembly/demo.assembly.js';
import {
  transformCapability, velocityCapability, shapeCapability, colorCapability,
  timerCapability, resourceCapability, overlapDetectCapability, destroyCapability,
} from '@atom-skills/index.js';
import { triggerZoneCapability, hitboxCapability, overTimeCapability, mortalCapability, ZONE_FLAG } from '@skills/tier2/index.js';
import { motionApplyCapability, lifetimeCapability } from '@skills/tier1/index.js';

const ENEMY = 1 << 2;

function foe(x: number, y: number): WorldBlueprint['entities'][string] {
  return {
    Transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
    Shape: { kind: 'box', width: 34, height: 34 },
    Color: { tint: 0xc98a86, alpha: 1 },
    Tag: { flags: ENEMY },
    Resource: { id: 'hp', current: 60, min: 0, max: 60 },
    Mortal: { resource: 'hp', atOrBelow: 0 }, // hp≤0 → 自销毁
  };
}
// 弹道 = 伤害区（Sensor 穿过不被推 + ZONE_FLAG 让 trigger-zone 认它 + Hitbox 结算）。
function bolt(x: number, y: number, vx: number, tint: number, hit: Record<string, unknown>): WorldBlueprint['entities'][string] {
  return {
    Transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
    Velocity: { vx, vy: 0, angular: 0 },
    Shape: { kind: 'circle', radius: 10 },
    Color: { tint, alpha: 1 },
    Sensor: {},
    Tag: { flags: ZONE_FLAG },
    Hitbox: { resource: 'hp', targetMask: ENEMY, ...hit },
    Timer: { id: 'life', elapsed: 0, duration: 200, loop: false }, // 到期自毁
  };
}

/** 战斗样例蓝图：三发弹道分别 秒杀 / 普攻 / 灼烧DoT 三个敌人。 */
export function combatBlueprint(): WorldBlueprint {
  return {
    capabilities: [
      transformCapability, velocityCapability, shapeCapability, colorCapability,
      timerCapability, resourceCapability, overlapDetectCapability, destroyCapability,
      triggerZoneCapability, hitboxCapability, overTimeCapability, mortalCapability,
      motionApplyCapability, lifetimeCapability,
    ],
    entities: {
      'foe-1': foe(500, 110),
      'foe-2': foe(500, 200),
      'foe-3': foe(500, 290),
      'bolt-1': bolt(70, 110, 4, 0x9cd2c5, { amount: 100 }),                                  // 一击必杀
      'bolt-2': bolt(70, 200, 4, 0xd4bd8a, { amount: 60 }),                                   // 刚好打死
      'bolt-3': bolt(70, 290, 3.4, 0xe0a070, { amount: 12, dotPerTick: 8, dotPeriod: 14, dotDuration: 140 }), // 直伤 + 灼烧 DoT
    },
  };
}
