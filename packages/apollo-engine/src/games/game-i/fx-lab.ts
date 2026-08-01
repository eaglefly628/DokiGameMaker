// Game I · 战场/实体特效样例（特效架构「库 B」展示·docs/design/effects-architecture.md）
//
// 「挂在 UI 上的特效」：世界里生成的**特效实体**（爆炸火花/冲击核），由引擎渲染器画、叠在画面上。
// 关键叙事：**新特效 = 一份新的 PrefabTemplate 数据（零新 system）** —— 与库 A（UI 元素自我动画·layout.fx）正交。
//
// 纯蓝图数据，不写专属 system：
//   发射器 Timer(loop) → event-when（到点产 Signal）→ caster（按 Signal 从 PrefabLibrary 取「爆炸环」模板生成实例）
//   → prefab 一次展开整圈 12 道火花（放射状 Velocity 飞·motion-apply）+ 1 个冲击核（放大冒头）
//   → 各自 Tween 淡出 + Timer(life) 到期 → lifetime 自毁。
// 模板 = 数据，最弱 LLM 能填；要加新特效（拖尾/电弧/烟），就再加一份模板，绝不加 system 或布尔开关。

import type { WorldBlueprint } from '../../assembly/demo.assembly.js';
import type { PrefabTemplate } from '@engine/protocol/components.js';
import {
  transformCapability, velocityCapability, shapeCapability, colorCapability,
  timerCapability, destroyCapability,
} from '@atom-skills/index.js';
import { eventWhenCapability } from '@skills/tier2/index.js';
import { casterCapability, prefabCapability } from '@skills/tier3/index.js';
import { motionApplyCapability, lifetimeCapability, tweenCapability } from '@skills/tier1/index.js';

const LIFE = 46;       // 火花寿命（tick）——爆发要短促
const RING = 12;       // 一圈火花数
const SPEED = 5.2;     // 放射初速

// 「爆炸环」模板：一次生成 12 道放射火花（飞 + 淡出 + 自毁）+ 1 个冲击核（大半径冒头 + 淡出）。
function burst(tint: number): PrefabTemplate {
  const entities: PrefabTemplate['entities'] = {
    // 冲击核：半径较大、低速、快速淡出 —— 读作爆心闪光。
    core: {
      Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      Velocity: { vx: 0, vy: 0, angular: 0 },
      Shape: { kind: 'circle', radius: 16 },
      Color: { tint: 0xffffff, alpha: 0.9 },
      Tween: { target: 'Color.alpha', from: 0.9, to: 0, elapsed: 0, duration: Math.round(LIFE * 0.5), easing: 'easeOut', done: false },
      Timer: { id: 'life', elapsed: 0, duration: Math.round(LIFE * 0.5), loop: false },
    },
  };
  // 放射火花：均分一圈，按角度给放射状速度。
  for (let i = 0; i < RING; i++) {
    const a = (i / RING) * Math.PI * 2;
    entities[`s${i}`] = {
      Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      Velocity: { vx: Math.cos(a) * SPEED, vy: Math.sin(a) * SPEED, angular: 0 },
      Shape: { kind: 'circle', radius: 5 },
      Color: { tint, alpha: 1 },
      Tween: { target: 'Color.alpha', from: 1, to: 0, elapsed: 0, duration: LIFE, easing: 'easeIn', done: false },
      Timer: { id: 'life', elapsed: 0, duration: LIFE, loop: false },
    };
  }
  return { entities };
}

// 发射器：每 period tick 产一次 'boom' 信号 → caster 在自身位生成一圈爆炸。
function detonator(x: number, y: number, template: string, period: number, phase: number): WorldBlueprint['entities'][string] {
  const sig = `boom_${template}`;
  return {
    Transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
    Timer: { id: 'boom', elapsed: phase, duration: period, loop: true },
    EventWhen: { signal: sig, when: { kind: 'timer', id: 'boom', cmp: 'gte', value: period - 1 }, mode: 'edge', armed: false },
    Caster: { onSignal: sig, template, at: 'self' },
  };
}

/** 战场特效样例蓝图：三处定时引爆「爆炸环」prefab（放射火花 + 冲击核·飞 + 淡出 + 自毁）。 */
export function fxBlueprint(): WorldBlueprint {
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
          'boom-jade': burst(0x9cd2c5),
          'boom-gold': burst(0xd4bd8a),
          'boom-rose': burst(0xe88f9c),
        },
        seq: 0,
      } },
      // 周期(34) < 火花寿命(46)：每处永远有上一波在飞 + 新一波引爆，画面始终饱满；三处错相位轮流炸。
      'det-l': detonator(200, 210, 'boom-jade', 34, 0),
      'det-m': detonator(330, 210, 'boom-gold', 34, 11),
      'det-r': detonator(460, 210, 'boom-rose', 34, 22),
    },
  };
}
