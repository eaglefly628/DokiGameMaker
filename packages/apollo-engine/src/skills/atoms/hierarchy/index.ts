import { defineCapability } from '@engine/core/define-capability.js';
import type { Hierarchy } from '@engine/protocol/components.js';

export type { Hierarchy };

export const hierarchyCapability = defineCapability({
  id: 'a2-hierarchy',
  version: '1.0.0',

  describe: {
    name: 'hierarchy',
    summary: '实体挂在谁下面？本地偏移多少？',
    semantic: ['spatial', 'parenting'],
    whenToUse:
      '需要空间父子关系时：炮塔挂在车身、手挂在身体、UI 锚定。hierarchy-resolve（Tier 1）用 parent.transform + local 算出 child 的世界 Transform。空间继承用此原子，纯逻辑关联用 relation(G2)。',
    examples: ['炮塔：parentId="tank", localX=0, localY=-10', '挂饰：parentId="player", local 偏移', '编队：子机相对长机偏移'],
  },

  components: {
    provides: {
      Hierarchy: {
        category: 'config',
        describe: '父实体引用 + 本地变换偏移。child 世界变换由 hierarchy-resolve 计算。',
        fields: {
          parentId: { type: 'EntityId', describe: '父实体 id' },
          localX: { type: 'number', describe: '相对父的本地 X 偏移' },
          localY: { type: 'number', describe: '相对父的本地 Y 偏移' },
          localRotation: { type: 'number', describe: '相对父的本地旋转（弧度）' },
          localScaleX: { type: 'number', describe: '相对父的本地 X 缩放' },
          localScaleY: { type: 'number', describe: '相对父的本地 Y 缩放' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    parentId: { type: 'string', default: '', describe: '父实体 id', question: '挂在哪个实体下？', ui: { control: 'input' } },
    localX: { type: 'number', default: 0, describe: '本地 X', question: '相对父的 X 偏移？', ui: { control: 'slider', min: -1000, max: 1000, step: 1 } },
    localY: { type: 'number', default: 0, describe: '本地 Y', question: '相对父的 Y 偏移？', ui: { control: 'slider', min: -1000, max: 1000, step: 1 } },
    localRotation: { type: 'number', default: 0, describe: '本地旋转', question: '相对父的旋转（弧度）？', ui: { control: 'slider', min: -3.14159, max: 3.14159, step: 0.01 } },
    localScaleX: { type: 'number', default: 1, describe: '本地 X 缩放', question: '相对父的 X 缩放？', ui: { control: 'slider', min: 0.01, max: 10, step: 0.01 } },
    localScaleY: { type: 'number', default: 1, describe: '本地 Y 缩放', question: '相对父的 Y 缩放？', ui: { control: 'slider', min: 0.01, max: 10, step: 0.01 } },
  },

  systems: [],
});
