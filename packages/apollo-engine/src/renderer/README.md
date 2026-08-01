# `src/renderer` — 引擎渲染层（多后端，单一数据源）

> 一条铁律：**渲染层是纯表现**。只读 world、产出像素/网格，**从不写 sim、不进 hash**。
> 因此渲染层用浮点 / `Math.sin/tan` 等都不影响确定性（与 `@engine/math` 的确定性约束无关、天然豁免）。

## 单一数据源：`Renderable`

`collectRenderables(world)`（`renderable.ts`）把世界里挂 `Transform` 且可见的实体抽成一份**引擎无关**的
`Renderable[]`（x/y/rotation/scale/zOrder + 可选 Shape/Color/Sprite/Frame/Text），按 zOrder 排序。
绘制模式由纯函数 `chooseRenderMode` 决定（text > sprite > shape > placeholder > none）。

**所有后端读同一份 `Renderable`** —— 这就是「同一份游戏数据、换渲染方法」的根基。

## 多渲染后端（`RendererBackend`：`init / sync / destroy`）

| 后端 | 文件 | 用途 | 备注 |
|---|---|---|---|
| **Ascii** | `ascii-renderer.ts` | 终端 / 无头快照 / 测试 | 纯字符，零依赖 |
| **Canvas** | `canvas-renderer.ts` | 浏览器 2D（默认） | Canvas2D；可选 `AssetManager` 画贴图 |
| **Three（3D）** | `three-renderer.ts` | 浏览器 3D | Three.js；Shape→平面几何、Sprite→贴图面、Text→画布纹理、Transform+zOrder→空间位姿、相机自适配 |

新增后端（Phaser / WebGPU / AI 视频…）= 实现 `RendererBackend` 消费 `Renderable`，**不动游戏数据**。

## 为什么 Three 后端不进 `index` barrel

`three` 静态依赖 ~150KB。若从 barrel 导出，Canvas/Ascii 的消费者会连带打包 three。
故 **3D 入口直接 `import { ThreeRenderer } from '@renderer/three-renderer.js'`**，让打包器把 three 切进
该入口自己的 chunk。纯投影几何（`three-projection.ts`，无 three 依赖）照常 barrel 导出、node 可测。

## 确定性边界（与渲染层的关系）

- 位置真相在 **sim**（`Transform`/`HexPos`，进 hash）；渲染层只是它的投影。
- 3D 的相机 / 抛物线 / 旋转等是**表现编排**，活在渲染层，永不回写 sim。
- game-g 的卡牌渲染器（`src/games/game-g/three-renderer.ts`，读 `Card3D` + 牌面纹理 + 抛飞编排）是
  **游戏专属**表现，与本目录的**通用** Three 后端并存——单一编排不强行下沉（rule-of-three）。
