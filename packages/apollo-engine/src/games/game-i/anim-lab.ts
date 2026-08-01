// Game I · 精灵动画样例（底座「动画」能力展示）
//
// 纯蓝图数据（capabilities + entities），不写专属 system：tween 能力按 easing 把同实体上的
// 表现字段（Transform.x/scaleX/rotation、Color.alpha）从 from 插到 to，引擎 CanvasRenderer 实时绘制。
// 四个形状各演示一种动画：平移巡逻 / 呼吸缩放 / 匀速自转 / 淡入淡出，全是数据，最弱 LLM 能填。
//
// 注：序列帧（spritesheet Frame.index 环绕）需要真实贴图资产才看得见，留待资产接入；本样例用
// 几何形状 + tween 演示「连续动画」这一柱，无资产即可见。

import type { WorldBlueprint } from '../../assembly/demo.assembly.js';
import { transformCapability, shapeCapability, colorCapability } from '@atom-skills/index.js';
import { tweenCapability } from '@skills/tier1/index.js';

const TWO_PI = 6.28318;

/** 精灵动画样例蓝图：四个 tween 驱动的形状（无资产·几何可见）。 */
export function animBlueprint(): WorldBlueprint {
  return {
    capabilities: [transformCapability, shapeCapability, colorCapability, tweenCapability],
    entities: {
      // ① 平移巡逻（往复·easeInOut）
      'anim-patrol': {
        Transform: { x: 80, y: 90, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'box', width: 44, height: 44 },
        Color: { tint: 0x9cd2c5, alpha: 1 },
        Tween: { target: 'Transform.x', from: 80, to: 560, elapsed: 0, duration: 120, easing: 'easeInOut', done: false, loop: 'pingpong' },
      },
      // ② 呼吸缩放（往复·easeInOut）
      'anim-breathe': {
        Transform: { x: 150, y: 230, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'circle', radius: 30 },
        Color: { tint: 0xd4bd8a, alpha: 1 },
        Tween: { target: 'Transform.scaleX', from: 0.55, to: 1.5, elapsed: 0, duration: 56, easing: 'easeInOut', done: false, loop: 'pingpong' },
      },
      // ③ 匀速自转（restart 循环·linear）
      'anim-spin': {
        Transform: { x: 340, y: 230, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'box', width: 52, height: 52 },
        Color: { tint: 0x7fc7e8, alpha: 1 },
        Tween: { target: 'Transform.rotation', from: 0, to: TWO_PI, elapsed: 0, duration: 90, easing: 'linear', done: false, loop: 'restart' },
      },
      // ④ 淡入淡出（往复·easeInOut）
      'anim-fade': {
        Transform: { x: 510, y: 230, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'box', width: 56, height: 56 },
        Color: { tint: 0xe0b964, alpha: 1 },
        Tween: { target: 'Color.alpha', from: 0.12, to: 1, elapsed: 0, duration: 64, easing: 'easeInOut', done: false, loop: 'pingpong' },
      },
    },
  };
}
