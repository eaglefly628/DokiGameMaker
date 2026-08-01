import { defineCapability } from '@engine/core/define-capability.js';
import type { Relation } from '@engine/protocol/components.js';

export type { Relation };

export const relationCapability = defineCapability({
  id: 'g2-relation',
  version: '1.0.0',

  describe: {
    name: 'relation',
    summary: '实体跟谁有什么逻辑关系？（targeting、owned-by 等）',
    semantic: ['identity', 'link', 'reference'],
    whenToUse:
      '需要表达非空间的实体间逻辑关联时：索敌目标、归属者、跟随。空间父子关系用 hierarchy(A2)，不要用此原子。',
    examples: ['relation(kind="target", targetId="enemy-3")', 'relation(kind="owner", targetId="player")', 'relation(kind="follows", targetId="leader")'],
  },

  components: {
    provides: {
      Relation: {
        category: 'config',
        describe: '到另一个实体的具名逻辑引用（非空间）。纯数据。',
        fields: {
          kind: { type: 'string', describe: '关系类型（如 "target"、"owner"、"follows"）' },
          targetId: { type: 'EntityId', describe: '关系指向的实体 id' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    kind: { type: 'string', default: 'target', describe: '关系类型', question: '这是什么关系？', ui: { control: 'input' } },
    targetId: { type: 'string', default: '', describe: '目标实体 id', question: '关系指向哪个实体？', ui: { control: 'input' } },
  },

  systems: [],
});
