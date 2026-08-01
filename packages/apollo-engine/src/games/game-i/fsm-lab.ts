// Game I · 状态机/行为样例（底座「数据驱动状态转移」能力展示）
//
// 纯蓝图数据，不写专属 system：一个自由计时器 Timer(clock) 计数 → event-when 在计时阈值产 Signal →
// effect-apply 据信号改 State.current（set-state）并切状态标记的可见性（set-visible）。条件→信号→效果，
// 三段都是数据（manifesto：状态转移=数据组合，非代码）。状态在 canvas 上以「彩色指示块」可见：
// idle(青) → alert(金) → flee(红) → 复位循环。
//
// 转移表（数据）：
//   clock≥70  → alert （青灭·金亮）
//   clock≥150 → flee  （金灭·红亮）
//   clock≥230 → idle  （红灭·青亮 + 复位 clock 重新循环）

import type { WorldBlueprint } from '../../assembly/demo.assembly.js';
import { transformCapability, shapeCapability, colorCapability, stateCapability, timerCapability } from '@atom-skills/index.js';
import { eventWhenCapability, effectApplyCapability } from '@skills/tier2/index.js';

type Ent = WorldBlueprint['entities'][string];

// 状态指示块（同位置堆叠·只有当前态那块可见）。
function marker(tint: number, visible: boolean): Ent {
  return {
    Transform: { x: 320, y: 150, rotation: 0, scaleX: 1, scaleY: 1 },
    Shape: { kind: 'box', width: 84, height: 84 },
    Color: { tint, alpha: 1 },
    Visibility: { visible, active: true },
  };
}
// event-when：clock 计时到 value 时（上升沿）发信号。
function when(signal: string, value: number): Ent {
  return { EventWhen: { signal, when: { kind: 'timer', id: 'clock', cmp: 'gte', value }, mode: 'edge', armed: false } };
}
const setState = (signal: string, value: string): Ent => ({ Effect: { onSignal: signal, kind: 'set-state', targetId: 'behavior', value } });
const setVis = (signal: string, marker: string, value: boolean): Ent => ({ Effect: { onSignal: signal, kind: 'set-visible', targetId: marker, targetEntity: marker, value } });
// reset-timer 按 targetEntity（持 Timer 的实体）定位，value=新 duration（保持自由计时）。
const resetClock = (signal: string): Ent => ({ Effect: { onSignal: signal, kind: 'reset-timer', targetId: 'mob', targetEntity: 'mob', value: 99999 } });

/** 状态机样例蓝图：clock 驱动 idle→alert→flee→idle 循环，set-visible 切指示块。 */
export function fsmBlueprint(): WorldBlueprint {
  return {
    capabilities: [transformCapability, shapeCapability, colorCapability, stateCapability, timerCapability, eventWhenCapability, effectApplyCapability],
    entities: {
      // 被观察的实体：持 State + 自由计时器（计数到大数不结束，作转移时钟）。
      mob: {
        State: { fsmId: 'behavior', current: 'idle', previous: 'idle' },
        Timer: { id: 'clock', elapsed: 0, duration: 99999, loop: false },
      },
      // 三个状态指示块（堆叠·初始只 idle 可见）。
      'mk-idle': marker(0x9cd2c5, true),
      'mk-alert': marker(0xd4bd8a, false),
      'mk-flee': marker(0xd07a6a, false),
      // 转移规则（event-when）。
      'ew-alert': when('to_alert', 70),
      'ew-flee': when('to_flee', 150),
      'ew-idle': when('to_idle', 230),
      // 效果（effect-apply）：改状态 + 切可见 + （回 idle 时）复位时钟。
      'ef-alert-s': setState('to_alert', 'alert'),
      'ef-alert-v1': setVis('to_alert', 'mk-idle', false),
      'ef-alert-v2': setVis('to_alert', 'mk-alert', true),
      'ef-flee-s': setState('to_flee', 'flee'),
      'ef-flee-v1': setVis('to_flee', 'mk-alert', false),
      'ef-flee-v2': setVis('to_flee', 'mk-flee', true),
      'ef-idle-s': setState('to_idle', 'idle'),
      'ef-idle-v1': setVis('to_idle', 'mk-flee', false),
      'ef-idle-v2': setVis('to_idle', 'mk-idle', true),
      'ef-idle-r': resetClock('to_idle'),
    },
  };
}
