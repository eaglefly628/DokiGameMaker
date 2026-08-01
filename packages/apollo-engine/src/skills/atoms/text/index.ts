import { defineCapability } from '@engine/core/define-capability.js';
import type { Text } from '@engine/protocol/components.js';

export type { Text };

export const textCapability = defineCapability({
  id: 'l6-text',
  version: '1.0.0',

  describe: {
    name: 'text',
    summary: '显示什么文字？',
    semantic: ['render', 'text'],
    whenToUse: '伤害飘字、对话气泡、UI 文本、计分。独立渲染原语（非 sprite 特化，渲染管线不同）。',
    examples: ['伤害飘字：content="-25"', '对话气泡：content="你好"', '计分：content="Score: 100"'],
  },

  components: {
    provides: {
      Text: {
        category: 'render',
        describe: '文本渲染内容与样式，渲染层据此排版绘制。',
        fields: {
          content: { type: 'string', describe: '要显示的文字' },
          fontSize: { type: 'number', describe: '字号（像素）' },
          fontFamily: { type: 'string', describe: '字体' },
          anchor: { type: 'string', describe: "对齐锚点：'left' | 'center' | 'right'" },
          lineSpacing: { type: 'number', describe: '行间距（像素）' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    content: { type: 'string', default: '', describe: '文本内容', question: '显示什么文字？', ui: { control: 'input' } },
    fontSize: { type: 'number', default: 16, describe: '字号', question: '字号多大？', ui: { control: 'slider', min: 1, max: 128, step: 1 } },
    fontFamily: { type: 'string', default: 'sans-serif', describe: '字体', question: '用什么字体？', ui: { control: 'input' } },
    anchor: { type: 'select', default: 'center', describe: '对齐', question: '文字对齐方式？', ui: { control: 'chips', options: ['left', 'center', 'right'] } },
    lineSpacing: { type: 'number', default: 0, describe: '行间距', question: '行间距？', ui: { control: 'slider', min: 0, max: 50, step: 1 } },
  },

  systems: [],
});
