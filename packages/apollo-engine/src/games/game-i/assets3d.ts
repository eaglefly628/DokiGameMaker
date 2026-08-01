// Game I · 3D 模型资产清单（glTF/glb）——给 Model3D 展台用。
// 复用引擎自带基础模型（public/models·与 game-z 同源·许可见 public/models/CREDITS.md）。
// 蓝图只持 modelKey（保纯·可哈希）；字节由 ModelAssetLoader 取 ArrayBuffer，ThreeRenderer 解析。
import type { AssetManifest } from '@assets/index.js';

export const MODEL_DUCK = 'duck';
export const MODEL_BOX = 'box';

export const GAME_I_ASSETS: AssetManifest = [
  { kind: 'model', key: MODEL_DUCK, src: '/models/duck.glb' },
  { kind: 'model', key: MODEL_BOX, src: '/models/box.glb' },
];
