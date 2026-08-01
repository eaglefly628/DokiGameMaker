import { defineCapability } from '@engine/core/define-capability.js';
import type { Controllable } from '@engine/protocol/components.js';

export type { Controllable };

// ═══════════════════════════════════════════════════════════════
//  i3-controllable —— 「这个实体归哪名玩家开、开多快？」（契约原子·systems:[]）
//
//  缺口实证（owner 07-11「按箭头/AD 不动」）：把键盘变成移动的真正链路是
//  运行时 applyMovement（net 层）——按 Controllable.playerId 路由每 tick 命令：
//  ←→/AD 写 Velocity.vx=±speed；无 Acceleration（不吃重力）时 ↑↓/WS 写 vy；
//  Space 发 Action{jump}（配 t2-jump 才起跳）。但 Controllable 此前没有任何
//  capability 提供 → 目录里查不到、推断推不出，AI 只能去猜 i1/i2（纯契约、
//  声明了不产生行为）。本原子把这个运行时契约登记进词表：可发现、可校验、可推断。
//  行为本身仍在运行时（与 i1-input-capture 同一模式：原子=契约，副作用=运行时）。
// ═══════════════════════════════════════════════════════════════

export const controllableCapability = defineCapability({
  id: 'i3-controllable',
  version: '1.0.0',

  describe: {
    name: 'controllable',
    summary: '玩家操控标记：运行时按 playerId 把键盘命令写进该实体（←→/AD→vx=±speed·无重力时↑↓/WS→vy·Space→Action{jump}）。要「按键能动」挂它+Velocity+t1-motion-apply。',
    semantic: ['input', 'intent', 'player'],
    whenToUse:
      '玩家要直接操控某实体移动时。挂 Controllable{playerId:"p1", speed}+Velocity，配 t1-motion-apply（积分位移）；跳跃再加 t2-jump。运行器自动按 playerId 接键盘：单人=方向键+WASD+空格；双人=玩家1 方向键+空格、玩家2 WASD+左Shift。i1/i2 是输入契约原子，声明它们不会让实体动。',
    examples: [
      '横版主角：Controllable{playerId:"p1", speed:3} + Velocity + Acceleration(重力) + t2-jump',
      'Pong 左板：Controllable{playerId:"p1", speed:4} + Velocity（无重力→↑↓ 直接写 vy）',
      '本地双人：两实体各挂 playerId "p1"/"p2"，运行器自动两套键位',
    ],
  },

  components: {
    provides: {
      Controllable: {
        category: 'config',
        describe: '玩家操控标记（运行时 applyMovement 按 playerId 路由键盘命令·每 tick 无输入即清零速度）。',
        fields: {
          playerId: { type: 'string', describe: '归哪名玩家（"p1"/"p2"…）——运行器按它分配键位' },
          speed: { type: 'number', describe: '移动速度（写入 Velocity 的幅值·像素/tick）' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {},

  systems: [],
});
