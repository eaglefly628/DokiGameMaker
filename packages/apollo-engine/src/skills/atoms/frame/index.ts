import { defineCapability } from '@engine/core/define-capability.js';
import type { Frame } from '@engine/protocol/components.js';

export type { Frame };

export const frameCapability = defineCapability({
  id: 'l3-frame',
  version: '1.0.0',

  describe: {
    name: 'frame',
    summary: '精灵的当前帧？',
    semantic: ['render', 'animation'],
    whenToUse:
      '序列帧动画的当前帧索引。animation（Tier 1）= frame.index 随 timer 递增；渲染层按 index 选子图。',
    examples: ['行走：total=8，index 在 0~7 循环', '爆炸：total=12，播完销毁', '静止：total=1, index=0'],
  },

  components: {
    provides: {
      Frame: {
        category: 'render',
        describe: '当前帧索引与总帧数，渲染层据此选子图。',
        fields: {
          index: { type: 'number', describe: '当前帧索引（0 起）' },
          total: { type: 'number', describe: '总帧数' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    index: { type: 'number', default: 0, describe: '初始帧', question: '从第几帧开始？', ui: { control: 'slider', min: 0, max: 100, step: 1 } },
    total: { type: 'number', default: 1, describe: '总帧数', question: '一共多少帧？', ui: { control: 'slider', min: 1, max: 100, step: 1 } },
  },

  systems: [],
});
