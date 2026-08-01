import { defineCapability } from '@engine/core/define-capability.js';
import type { Velocity, Acceleration } from '@engine/protocol/components.js';

// Tier 1 涌现（直接结算）：acceleration → velocity。无新组件，纯系统。
// 与 motion-apply 互补：本系统写 Velocity，motion-apply 读 Velocity，
// 拓扑排序自动让 accel 先于 motion → 涌现出"加速度→速度→位置"完整运动学链。
export const accelApplyCapability = defineCapability({
  id: 't1-accel-apply',
  version: '1.0.0',

  describe: {
    name: 'accel-apply',
    summary: '每帧把 acceleration 累加到 velocity（速度）。',
    semantic: ['tier1', 'kinematic'],
    whenToUse: '让实体受持续加速度影响（重力、推进力）。读 Velocity + Acceleration，写 Velocity。',
    examples: ['重力下坠', '抛物线弹道', '推进器加速'],
  },

  components: {
    provides: {},
    reads: ['Velocity', 'Acceleration'],
    writes: ['Velocity'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'accel-apply',
      reads: ['Velocity', 'Acceleration'],
      writes: ['Velocity'],
      consumes: [],
      execute(world) {
        for (const [id] of world.query('Velocity', 'Acceleration')) {
          const v = world.getComponent<Velocity>(id, 'Velocity')!;
          const a = world.getComponent<Acceleration>(id, 'Acceleration')!;
          v.vx += a.ax;
          v.vy += a.ay;
        }
      },
    },
  ],
});
