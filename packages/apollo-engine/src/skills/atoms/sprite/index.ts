import { defineCapability } from '@engine/core/define-capability.js';
import type { Sprite } from '@engine/protocol/components.js';

export type { Sprite };

export const spriteCapability = defineCapability({
  id: 'l1-sprite',
  version: '1.0.0',

  describe: {
    name: 'sprite',
    summary: '实体用什么图？渲染层级？',
    semantic: ['render', 'visual'],
    whenToUse:
      '任何需要显示贴图的实体。textureKey 指向资源；anchorX/Y 是 0~1 锚点；zOrder 决定 2D 绘制顺序。渲染层读取此组件绘制。',
    examples: ['玩家：textureKey="player", anchor=(0.5,0.5), zOrder=10', '背景：zOrder=0', 'UI 图标：zOrder=100'],
  },

  components: {
    provides: {
      Sprite: {
        category: 'render',
        describe: '贴图与渲染层级。渲染层每帧读取绘制。',
        fields: {
          textureKey: { type: 'assetKey', assetType: 'texture', describe: '贴图资源键（须在资产清单中，加载期硬校验）' },
          anchorX: { type: 'number', describe: '锚点 X（0~1，0.5 为中心）' },
          anchorY: { type: 'number', describe: '锚点 Y（0~1，0.5 为中心）' },
          zOrder: { type: 'number', describe: '绘制顺序，越大越靠前' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    textureKey: { type: 'string', default: '', describe: '贴图键', question: '用哪张贴图？', ui: { control: 'input' } },
    anchorX: { type: 'number', default: 0.5, describe: '锚点 X', question: '水平锚点（0~1）？', ui: { control: 'slider', min: 0, max: 1, step: 0.01 } },
    anchorY: { type: 'number', default: 0.5, describe: '锚点 Y', question: '垂直锚点（0~1）？', ui: { control: 'slider', min: 0, max: 1, step: 0.01 } },
    zOrder: { type: 'number', default: 0, describe: '绘制层级', question: '绘制层级（越大越靠前）？', ui: { control: 'slider', min: 0, max: 1000, step: 1 } },
  },

  systems: [],
});
