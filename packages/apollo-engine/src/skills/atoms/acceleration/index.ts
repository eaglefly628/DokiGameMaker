import { defineCapability } from '@engine/core/define-capability.js';
import type { Acceleration } from '@engine/protocol/components.js';

export type { Acceleration };

export const accelerationCapability = defineCapability({
  id: 'b2-acceleration',
  version: '1.0.0',

  describe: {
    name: 'acceleration',
    summary: '实体的速度在怎么变？',
    semantic: ['motion', 'kinematics', 'dynamics'],
    whenToUse:
      '需要变速运动时：重力、推进、摩擦。accel-apply（Tier 1）每帧把 acceleration 累加到 velocity。',
    examples: ['重力：ay 恒定，物体加速下落', '飞船推进：朝向方向施加 ax/ay', '摩擦：与 velocity 反向的 acceleration'],
  },

  components: {
    provides: {
      Acceleration: {
        category: 'config',
        describe: '每 tick 施加到 velocity 的加速度，纯数据。',
        fields: {
          ax: { type: 'number', describe: '沿 X 轴的加速度' },
          ay: { type: 'number', describe: '沿 Y 轴的加速度' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    ax: { type: 'number', default: 0, describe: '初始 X 加速度', question: '水平加速度？', ui: { control: 'slider', min: -50, max: 50, step: 0.1 } },
    ay: { type: 'number', default: 0, describe: '初始 Y 加速度', question: '垂直加速度（重力）？', ui: { control: 'slider', min: -50, max: 50, step: 0.1 } },
  },

  systems: [],
});
