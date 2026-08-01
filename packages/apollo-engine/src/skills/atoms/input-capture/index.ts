import { defineCapability } from '@engine/core/define-capability.js';
import type { RawInput } from '@engine/protocol/components.js';

export type { RawInput };

export const inputCaptureCapability = defineCapability({
  id: 'i1-input-capture',
  version: '1.0.0',

  describe: {
    name: 'input-capture',
    summary: '这帧有什么外部原始信号？',
    semantic: ['input', 'event'],
    whenToUse:
      '需要读取键盘/指针/触摸原始信号时。RawInput 由运行时（DOM 监听等副作用层）每帧注入；action-map(I2) 把它翻译成语义动作。本原子只定义契约，捕获本身是运行时职责。',
    examples: ['键盘：{source:"keyboard", key:"ArrowLeft", phase:"down"}', '指针：{source:"pointer", x:120, y:80, phase:"move"}', '触摸：{source:"touch", x:50, y:50, phase:"down"}'],
  },

  components: {
    provides: {
      RawInput: {
        category: 'event',
        describe: '一帧原始输入信号，由运行时注入、被 action-map 消费。',
        fields: {
          source: { type: 'string', describe: "信号来源：'keyboard' | 'pointer' | 'touch'" },
          key: { type: 'string', describe: '按键名（keyboard 时）' },
          x: { type: 'number', describe: '坐标 X（pointer/touch 时）' },
          y: { type: 'number', describe: '坐标 Y（pointer/touch 时）' },
          phase: { type: 'string', describe: "阶段：'down' | 'up' | 'move'" },
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
