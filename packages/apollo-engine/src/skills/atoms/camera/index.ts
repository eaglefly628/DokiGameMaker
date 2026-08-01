import { defineCapability } from '@engine/core/define-capability.js';
import type { Camera } from '@engine/protocol/components.js';

export type { Camera };

export const cameraCapability = defineCapability({
  id: 'l5-camera',
  version: '1.0.0',

  describe: {
    name: 'camera',
    summary: '观察窗口参数？世界到屏幕的映射基准？',
    semantic: ['render', 'view'],
    whenToUse:
      '定义视口如何观察世界。camera 实体同时挂 Transform 决定世界位置，Camera 描述投影参数。震屏=改 offset，缩放=改 zoom。',
    examples: ['跟随玩家：Transform 跟随 + zoom=1', '震屏：offsetX/Y 抖动', '放大特写：zoom=2'],
  },

  components: {
    provides: {
      Camera: {
        category: 'render',
        describe: '投影参数。与同实体的 Transform 共同决定世界→屏幕映射。',
        fields: {
          zoom: { type: 'number', describe: '缩放倍数（1 为原始）' },
          offsetX: { type: 'number', describe: '屏幕 X 偏移（震屏/平移）' },
          offsetY: { type: 'number', describe: '屏幕 Y 偏移' },
          rotation: { type: 'number', describe: '视口旋转（弧度）' },
          viewportW: { type: 'number', describe: '视口宽度（像素）' },
          viewportH: { type: 'number', describe: '视口高度（像素）' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    zoom: { type: 'number', default: 1, describe: '缩放', question: '初始缩放倍数？', ui: { control: 'slider', min: 0.1, max: 10, step: 0.1 } },
    offsetX: { type: 'number', default: 0, describe: 'X 偏移', question: '屏幕 X 偏移？', ui: { control: 'slider', min: -500, max: 500, step: 1 } },
    offsetY: { type: 'number', default: 0, describe: 'Y 偏移', question: '屏幕 Y 偏移？', ui: { control: 'slider', min: -500, max: 500, step: 1 } },
    rotation: { type: 'number', default: 0, describe: '视口旋转', question: '视口旋转（弧度）？', ui: { control: 'slider', min: -3.14159, max: 3.14159, step: 0.01 } },
    viewportW: { type: 'number', default: 800, describe: '视口宽', question: '视口宽度？', ui: { control: 'slider', min: 1, max: 4096, step: 1 } },
    viewportH: { type: 'number', default: 600, describe: '视口高', question: '视口高度？', ui: { control: 'slider', min: 1, max: 4096, step: 1 } },
  },

  systems: [],
});
