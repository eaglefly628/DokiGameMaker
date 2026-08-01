import { defineCapability } from '@engine/core/define-capability.js';
import type { Action } from '@engine/protocol/components.js';

export type { Action };

export const actionMapCapability = defineCapability({
  id: 'i2-action-map',
  version: '1.0.0',

  describe: {
    name: 'action-map',
    summary: '原始信号对应什么语义动作？',
    semantic: ['input', 'intent'],
    whenToUse:
      '把 RawInput 翻译成与设备无关的语义动作（move-left、jump、fire）。具体按键→动作的绑定因游戏而异，属 assembly 层；本原子定义 Action 输出契约。',
    examples: ['Action{name:"move-left", value:1}', 'Action{name:"jump", value:1}', 'Action{name:"aim", value:0.5}（模拟量）'],
  },

  components: {
    provides: {
      Action: {
        category: 'intent',
        describe: '与设备无关的语义动作。value 支持模拟量（0~1）或开关（0/1）。',
        fields: {
          name: { type: 'string', describe: '动作名（如 "jump"、"move-left"）' },
          value: { type: 'number', describe: '动作强度：开关用 0/1，模拟量用 0~1' },
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
