import { defineCapability } from '@engine/core/define-capability.js';
import type { Transform } from '@engine/protocol/components.js';

export type { Transform };

export const transformCapability = defineCapability({
  id: 'a1-transform',
  version: '1.0.0',

  describe: {
    name: 'transform',
    summary: '实体在世界的位置、朝向和大小',
    semantic: ['spatial', 'position', 'rotation', 'scale', 'foundation'],
    whenToUse: '任何需要在世界中占据位置、拥有朝向或缩放比例的实体都需要此原子。几乎所有可见实体和参与空间计算的实体都应挂载 Transform。',
    examples: [
      '玩家角色：位置 (x, y) 跟随移动，rotation 随方向旋转',
      '投射物：初始位置由 SpawnRequest 决定，后续由 motion-apply 每帧更新',
      '摄像机实体：Transform 决定世界位置，Camera 组件描述投影参数',
      '触发区域：只需设置 (x, y)，rotation/scaleX/scaleY 使用默认值',
    ],
  },

  components: {
    provides: {
      Transform: {
        category: 'config',
        describe: '实体在世界坐标系中的完整空间状态：位置、朝向、缩放',
        fields: {
          x: { type: 'number', describe: '世界坐标 X 轴位置' },
          y: { type: 'number', describe: '世界坐标 Y 轴位置' },
          rotation: { type: 'number', describe: '朝向角度（弧度），顺时针为正' },
          scaleX: { type: 'number', describe: 'X 轴缩放比例，默认 1.0' },
          scaleY: { type: 'number', describe: 'Y 轴缩放比例，默认 1.0' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    x: {
      type: 'number',
      default: 0,
      describe: '初始 X 坐标',
      question: '实体的初始 X 坐标是多少？',
      ui: { control: 'slider', min: -2000, max: 2000, step: 1 },
    },
    y: {
      type: 'number',
      default: 0,
      describe: '初始 Y 坐标',
      question: '实体的初始 Y 坐标是多少？',
      ui: { control: 'slider', min: -2000, max: 2000, step: 1 },
    },
    rotation: {
      type: 'number',
      default: 0,
      describe: '初始朝向（弧度）',
      question: '实体的初始旋转角度是多少（弧度）？',
      ui: { control: 'slider', min: -3.14159, max: 3.14159, step: 0.01 },
    },
    scaleX: {
      type: 'number',
      default: 1,
      describe: '初始 X 轴缩放',
      question: '实体的初始 X 轴缩放比例是多少？',
      ui: { control: 'slider', min: 0.01, max: 10, step: 0.01 },
    },
    scaleY: {
      type: 'number',
      default: 1,
      describe: '初始 Y 轴缩放',
      question: '实体的初始 Y 轴缩放比例是多少？',
      ui: { control: 'slider', min: 0.01, max: 10, step: 0.01 },
    },
  },

  systems: [],
});
