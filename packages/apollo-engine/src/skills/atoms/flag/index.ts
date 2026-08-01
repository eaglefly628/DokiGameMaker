import { defineCapability } from '@engine/core/define-capability.js';
import type { Flag } from '@engine/protocol/components.js';

export { type Flag };

export const flagCapability = defineCapability({
  id: 'f2-flag',
  version: '1.0.0',

  describe: {
    name: 'flag',
    summary: '某个条件开还是关？持久布尔状态原子，用 id 区分不同开关。',
    semantic: ['boolean', 'state', 'condition', 'config'],
    whenToUse: '需要记录某个条件是否满足时：角色是否着地（grounded）、技能是否就绪（ready）、触发器是否激活（triggered）等任意命名布尔状态。',
    examples: [
      'flag(id="grounded", active=true) — 平台跳跃：角色是否站在地面',
      'flag(id="skill-ready", active=false) — 冷却系统：技能是否可用',
      'flag(id="door-open", active=false) — 关卡状态：门是否已打开',
      'flag(id="invincible", active=false) — 无敌帧：角色当前是否无敌',
    ],
  },

  components: {
    provides: {
      Flag: {
        category: 'config',
        describe: '命名布尔开关。id 标识是哪个条件，active 表示该条件当前是否成立。',
        fields: {
          id: { type: 'string', describe: '标识这是哪个布尔开关（如 "grounded"、"skill-ready"）' },
          active: { type: 'boolean', describe: '当前开关状态：true 为开，false 为关' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    id: {
      type: 'string',
      default: '',
      describe: '开关的唯一标识符',
      question: '这个布尔开关叫什么名字？',
      ui: { control: 'input' },
    },
    active: {
      type: 'boolean',
      default: false,
      describe: '初始状态（开或关）',
      question: '初始状态是开还是关？',
      ui: { control: 'toggle' },
    },
  },

  systems: [],
});
