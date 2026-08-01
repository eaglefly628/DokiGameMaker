import { defineCapability } from '@engine/core/define-capability.js';
import type { Mass } from '@engine/protocol/components.js';

export type { Mass };

export const massCapability = defineCapability({
  id: 'b3-mass',
  version: '1.0.0',

  describe: {
    name: 'mass',
    summary: '实体有多重？（0 = 不可移动）',
    semantic: ['physics', 'collision'],
    whenToUse:
      '参与碰撞响应的实体需要质量。collision-separate / collision-bounce 按 mass 比例分配位移与反弹。value=0 表示静态不可移动（地面、墙）。',
    examples: ['玩家：value=1，可被推动', '地面/墙：value=0，碰撞中不动', '重箱子：value=10，难以被轻物推动'],
  },

  components: {
    provides: {
      Mass: {
        category: 'config',
        describe: '质量标量。0 表示无穷大（不可移动）。纯数据，碰撞响应读取。',
        fields: {
          value: { type: 'number', describe: '质量；0 = 不可移动（视为无穷大）' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    value: { type: 'number', default: 1, describe: '质量', question: '这个实体多重？（0 = 不可移动）', ui: { control: 'slider', min: 0, max: 100, step: 0.1 } },
  },

  systems: [],
});
