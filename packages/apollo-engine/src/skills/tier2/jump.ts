import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { Velocity, Action } from '@engine/protocol/components.js';

// 向上起跳速度（up = -y）。引擎暂无运行期 config 注入（execute 只拿 world），故为模块常量。
export const JUMP_SPEED = 14;

// Tier 2 涌现（控制）：站在地面上（有 Grounded）且这帧有 jump 动作 → 给一个向上的速度冲量。
// "能否起跳"完全由 Grounded 闸门控制 —— 离地后 ground-sense 不再打 Grounded，自然无法二段跳。
// 这就是涌现：jump 自己不懂碰撞，只读 ground-sense 算出的事实 + 输入层的 Action。
//
// 跑在 Commit 阶段：jump 与 accel-apply、collision-resolve 都改 Velocity，三者放各自阶段，
// 避免同阶段"读改写同一组件"判成环；且 Commit 在 Update 之后，能读到本帧 ground-sense 刚标的 Grounded。
export const jumpCapability = defineCapability({
  id: 't2-jump',
  version: '1.0.0',

  describe: {
    name: 'jump',
    summary: '着地（Grounded）且有 jump 动作时，给实体一个向上的速度冲量。',
    semantic: ['tier2', 'control', 'platformer'],
    whenToUse: '平台跳跃。读 Action(name=jump)+Grounded+Velocity，写 Velocity，跑在 Commit 阶段。',
    examples: ['玩家按跳跃键起跳', '空中不能再跳（无二段跳）'],
  },

  components: {
    provides: {},
    reads: ['Action', 'Grounded', 'Velocity'],
    writes: ['Velocity'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'jump',
      phase: SystemPhase.Commit,
      reads: ['Action', 'Grounded', 'Velocity'],
      writes: ['Velocity'],
      consumes: [],
      execute(world) {
        for (const [id] of world.query('Velocity', 'Grounded', 'Action')) {
          const a = world.getComponent<Action>(id, 'Action')!;
          if (a.name !== 'jump' || a.value <= 0) continue;
          const v = world.getComponent<Velocity>(id, 'Velocity')!;
          v.vy = -JUMP_SPEED; // up = -y
        }
      },
    },
  ],
});
