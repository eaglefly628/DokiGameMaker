// Game I · 生成与寿命样例（底座「程序化生成 + 自动销毁」能力展示）
//
// 纯蓝图数据，不写专属 system：
//   发射器 Timer(loop) → event-when（计时到点产 Signal）→ caster（按 Signal 从 PrefabLibrary 模板生成实例）
//   → prefab 展开 → 粒子带 Velocity 飞(motion-apply) + Tween 淡出 + Timer(life) 到期 → lifetime 自销毁(destroy)。
// 全是数据（模板 + 计时 + 信号），最弱 LLM 能填。

import type { WorldBlueprint } from '../../assembly/demo.assembly.js';
import type { PrefabTemplate } from '@engine/protocol/components.js';
import {
  transformCapability, velocityCapability, shapeCapability, colorCapability,
  timerCapability, destroyCapability,
} from '@atom-skills/index.js';
import { eventWhenCapability } from '@skills/tier2/index.js';
import { casterCapability, prefabCapability } from '@skills/tier3/index.js';
import { motionApplyCapability, lifetimeCapability, tweenCapability } from '@skills/tier1/index.js';

const LIFE = 70;
// 粒子模板：飞 + 淡出 + 到期自毁。
function spark(vx: number, vy: number, tint: number): PrefabTemplate {
  return {
    entities: {
      p: {
        Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        Velocity: { vx, vy, angular: 0 },
        Shape: { kind: 'circle', radius: 6 },
        Color: { tint, alpha: 1 },
        Tween: { target: 'Color.alpha', from: 1, to: 0, elapsed: 0, duration: LIFE, easing: 'easeIn', done: false },
        Timer: { id: 'life', elapsed: 0, duration: LIFE, loop: false }, // 到期 → lifetime 自毁
      },
    },
  };
}

// 发射器：每 period tick 产一次 'emit' 信号 → caster 生成模板。
function emitter(x: number, y: number, template: string, period: number): WorldBlueprint['entities'][string] {
  const sig = `emit_${template}`;
  return {
    Transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
    Timer: { id: 'emit', elapsed: 0, duration: period, loop: true },
    EventWhen: { signal: sig, when: { kind: 'timer', id: 'emit', cmp: 'gte', value: period - 1 }, mode: 'edge', armed: false },
    Caster: { onSignal: sig, template, at: 'self' },
  };
}

/** 生成与寿命样例蓝图：三个发射器周期性喷出短命粒子（飞 + 淡出 + 自毁）。 */
export function spawnBlueprint(): WorldBlueprint {
  return {
    capabilities: [
      transformCapability, velocityCapability, shapeCapability, colorCapability,
      timerCapability, destroyCapability, tweenCapability,
      eventWhenCapability, casterCapability, prefabCapability,
      motionApplyCapability, lifetimeCapability,
    ],
    entities: {
      library: { PrefabLibrary: {
        templates: {
          'spark-l': spark(-2.2, -3.4, 0x9cd2c5),
          'spark-m': spark(0, -4.0, 0xd4bd8a),
          'spark-r': spark(2.2, -3.4, 0x7fc7e8),
        },
        seq: 0,
      } },
      'emit-l': emitter(220, 330, 'spark-l', 7),
      'emit-m': emitter(320, 330, 'spark-m', 6),
      'emit-r': emitter(420, 330, 'spark-r', 7),
    },
  };
}
