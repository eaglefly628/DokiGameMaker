import { defineCapability } from '@engine/core/define-capability.js';
import type { Velocity } from '@engine/protocol/components.js';

export type { Velocity };

export const velocityCapability = defineCapability({
  id: 'b1-velocity',
  version: '1.0.0',

  describe: {
    name: 'velocity',
    summary: '实体当前的运动方向、速度和角速度。',
    semantic: ['motion', 'kinematics', 'speed'],
    whenToUse:
      '任何会移动或自转的实体都需要此原子。motion-apply（Tier 1）每帧把 velocity 累加到 transform；accel-apply 把 acceleration 累加到 velocity。',
    examples: [
      '玩家移动：vx/vy 由输入驱动',
      '投射物：发射时设定 vx/vy，飞行中由 motion-apply 更新位置',
      '自旋拾取物：angular 恒定，rotation-apply 持续旋转',
    ],
  },

  components: {
    provides: {
      Velocity: {
        category: 'config',
        describe: '线速度 (vx, vy) 与角速度 (angular)，纯数据，由其它系统读写。',
        fields: {
          vx: { type: 'number', describe: '每 tick 沿 X 轴的位移速度' },
          vy: { type: 'number', describe: '每 tick 沿 Y 轴的位移速度' },
          angular: { type: 'number', describe: '每 tick 的旋转角速度（弧度）' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    vx: {
      type: 'number',
      default: 0,
      describe: '初始 X 速度',
      question: '初始水平速度是多少？',
      ui: { control: 'slider', min: -100, max: 100, step: 0.1 },
    },
    vy: {
      type: 'number',
      default: 0,
      describe: '初始 Y 速度',
      question: '初始垂直速度是多少？',
      ui: { control: 'slider', min: -100, max: 100, step: 0.1 },
    },
    angular: {
      type: 'number',
      default: 0,
      describe: '初始角速度',
      question: '初始旋转速度是多少（弧度/tick）？',
      ui: { control: 'slider', min: -3.14159, max: 3.14159, step: 0.01 },
    },
  },

  systems: [],
});
