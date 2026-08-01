import { defineCapability } from '@engine/core/define-capability.js';
import type { Color } from '@engine/protocol/components.js';

export type { Color };

export const colorCapability = defineCapability({
  id: 'l2-color',
  version: '1.0.0',

  describe: {
    name: 'color',
    summary: '实体当前的颜色/透明度？',
    semantic: ['render', 'visual'],
    whenToUse: '需要染色或淡入淡出时：受击闪红、隐身半透明、状态着色。tint 为 0xRRGGBB，alpha 为 0~1。',
    examples: ['受击闪红：tint=0xff0000', '淡出：alpha 1→0', '中毒变绿：tint=0x00ff00'],
  },

  components: {
    provides: {
      Color: {
        category: 'render',
        describe: '色调与透明度，渲染层与贴图相乘。',
        fields: {
          tint: { type: 'number', describe: '色调，0xRRGGBB（0xffffff 为原色）' },
          alpha: { type: 'number', describe: '透明度 0~1' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    tint: { type: 'number', default: 0xffffff, describe: '色调 0xRRGGBB', question: '色调颜色？', ui: { control: 'input' } },
    alpha: { type: 'number', default: 1, describe: '透明度', question: '透明度（0~1）？', ui: { control: 'slider', min: 0, max: 1, step: 0.01 } },
  },

  systems: [],
});
