import { defineCapability } from '@engine/core/define-capability.js';
import type { Tag } from '@engine/protocol/components.js';

export type { Tag };

export const tagCapability = defineCapability({
  id: 'g1-tag',
  version: '1.0.0',

  describe: {
    name: 'tag',
    summary: '实体属于哪些分类？用 bitmask 表示，位运算 O(1)。',
    semantic: ['identity', 'classification', 'bitmask'],
    whenToUse:
      '需要按类别筛选实体时：碰撞过滤（敌/友/地面）、触发器目标、索敌（tag=enemy）。一个 flags 用不同 bit 表示多个分类。',
    examples: [
      'tag(flags = ENEMY) — 索敌系统只锁定带 ENEMY 位的实体',
      'tag(flags = GROUND | SOLID) — 同时是地面且实心',
      'tag(flags = PLAYER | DAMAGEABLE) — 玩家且可受伤',
    ],
  },

  components: {
    provides: {
      Tag: {
        category: 'config',
        describe: '分类位掩码。每一位代表一个类别，按位与判断归属。纯数据，由筛选系统读取。',
        fields: {
          flags: { type: 'number', describe: '32 位分类掩码；用 | 组合、& 判断、~ 清除' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    flags: {
      type: 'number',
      default: 0,
      describe: '初始分类掩码',
      question: '这个实体属于哪些分类（位掩码）？',
      ui: { control: 'input' },
    },
  },

  systems: [],
});
