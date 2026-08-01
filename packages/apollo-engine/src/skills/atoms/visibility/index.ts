import { defineCapability } from '@engine/core/define-capability.js';
import type { Visibility } from '@engine/protocol/components.js';

export type { Visibility };

export const visibilityCapability = defineCapability({
  id: 'h1-visibility',
  version: '1.0.0',

  describe: {
    name: 'visibility',
    summary: '实体是否可见？是否参与系统运算？',
    semantic: ['control', 'infrastructure'],
    whenToUse:
      'visible 控制渲染跳过，active 控制逻辑跳过。引擎基础设施层面的开关，不同于 flag（游戏逻辑开关）。',
    examples: ['visible=false, active=true — 隐身但仍参与碰撞', 'visible=true, active=false — 显示但冻结', 'visible=false, active=false — 对象池中休眠'],
  },

  components: {
    provides: {
      Visibility: {
        category: 'config',
        describe: '渲染与逻辑参与开关。visible→渲染层是否绘制；active→系统是否处理。纯数据。',
        fields: {
          visible: { type: 'boolean', describe: '是否渲染' },
          active: { type: 'boolean', describe: '是否参与系统运算' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    visible: { type: 'boolean', default: true, describe: '是否可见', question: '实体初始是否可见？', ui: { control: 'toggle' } },
    active: { type: 'boolean', default: true, describe: '是否参与运算', question: '实体初始是否参与系统运算？', ui: { control: 'toggle' } },
  },

  systems: [],
});
