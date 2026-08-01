// Game I · 3D 渲染样例（底座「three 渲染」能力展示）
//
// 纯蓝图数据，不写专属 system：Mesh3D 描述 3D 物件（盒/面·正反分色），tween 驱动 Transform.rotation
// 当翻面角（flipAxis）。引擎 ThreeRenderer（同 CanvasRenderer 一样实现 RendererBackend，读同一份
// collectRenderables）把它们渲成真 3D 场景，相机自适配取景。换后端即换维度，数据一字不改。

import type { WorldBlueprint } from '../../assembly/demo.assembly.js';
import { transformCapability } from '@atom-skills/index.js';
import { tweenCapability } from '@skills/tier1/index.js';

const TWO_PI = 6.28318;

/** 3D 样例蓝图：一张翻面卡 + 一个翻滚立方 + 一片倾转薄面，全由 tween 转 Transform.rotation 驱动。 */
export function threeBlueprint(): WorldBlueprint {
  return {
    capabilities: [transformCapability, tweenCapability],
    entities: {
      // 翻面卡（绕 Y 轴翻·正红背蓝·金边）——演示 Mesh3D 正反分色 + flipAxis。
      'card-flip': {
        Transform: { x: 150, y: 200, rotation: 0, scaleX: 1, scaleY: 1 },
        Mesh3D: { shape: 'box', width: 120, height: 170, depth: 12, frontTint: 0xc0392b, backTint: 0x2c3e50, edgeTint: 0xd4bd8a, flipAxis: 'y' },
        Tween: { target: 'Transform.rotation', from: 0, to: TWO_PI, elapsed: 0, duration: 150, easing: 'linear', done: false, loop: 'restart' },
      },
      // 翻滚立方（绕 X 轴）——厚盒六面。
      'cube-roll': {
        Transform: { x: 380, y: 170, rotation: 0, scaleX: 1, scaleY: 1 },
        Mesh3D: { shape: 'box', width: 96, height: 96, depth: 96, frontTint: 0x9cd2c5, backTint: 0x7fc7e8, edgeTint: 0x223344, flipAxis: 'x' },
        Tween: { target: 'Transform.rotation', from: 0, to: TWO_PI, elapsed: 0, duration: 110, easing: 'linear', done: false, loop: 'restart' },
      },
      // 倾转薄面（plane·双面同色）——慢速来回。
      'plane-tilt': {
        Transform: { x: 560, y: 235, rotation: 0, scaleX: 1, scaleY: 1 },
        Mesh3D: { shape: 'plane', width: 128, height: 128, frontTint: 0xe0b964 },
        Tween: { target: 'Transform.rotation', from: -0.9, to: 0.9, elapsed: 0, duration: 90, easing: 'easeInOut', done: false, loop: 'pingpong' },
      },
    },
  };
}
