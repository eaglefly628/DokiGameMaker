# 渲染与特效（2D）手册

> play-field（战场/棋盘/世界）走 **render 组件 + 引擎 2D 渲染器**（数据，非 UI 库）。动效强调走 `VisualEffect` 闭集。
> 机读真相：组件闭集 `src/assembly/component-map.ts`；渲染后端 `src/renderer/canvas-renderer.ts`（收集器 `renderable.ts`）。UI/HUD 请走 ui.md，不在这。

## ① 做 X → 用什么

| 任务 | 能力实名 | 怎么接（一句） |
|---|---|---|
| 画一张精灵图 | `l1-sprite`（组件 `Sprite`） | 挂 `Sprite{key}`（美术 key 走 assets.md 的 `art:` 解析）+ `Transform` |
| 上色 / 透明度 | `l2-color`（组件 `Color`） | 挂 `Color{...,alpha}`；淡入淡出用 `t1-tween` 驱动 alpha |
| sprite-sheet 帧 | `l3-frame`（组件 `Frame`） | 挂 `Frame{...}`；逐帧动画用 `t1-animation`（读 Frame+TimerDone） |
| 状态切动作动画 | `t2-anim-state` | 挂 `AnimState{clips,moveClip,idleClip}`+`Frame`+`Sprite`（走/站/打/死自动切） |
| 朝移动方向翻转（左右镜像） | `t2-facing` | 挂 `Facing{mode:"velocity"}`；配 anim-state |
| 俯视有向物按方向转贴图（整体旋转，非镜像） | `t2-face-rotate` | 挂 `FaceRotate{source:"velocity"\|"target"}`；sim 写 `FaceDir{x,y}` 单位向量（零 trig），渲染器读它 atan2（`resolveRotation2D`，render-only）；碰撞仍 AABB 不随转 |
| 世界文字 / 数字条 | `l6-text`（组件 `Text`）/`t2-text-binding` | `Text` + `TextBinding{resourceId}` 绑资源实时数字 |
| 血条/蓝条/读条 | `t2-gauge` | 宿主加子实体 `Hierarchy`+`Shape`+`Color`+`Gauge`（随资源实时变化） |
| 相机跟随/取景 | `t2-camera-follow`（组件 `Camera`） | 目标挂 `CameraTarget`，相机挂 `Camera`（合作相机取中点+缩放） |
| 动效强调（呼吸/抖/发光/闪） | `VisualEffect`（`EffectKind` 闭集） | 闭集 pulse/float/shake/pop/glow/sheen/flash/fade；`color` 取语义令牌 |

## ② 样例指针

- `EffectKind`/`VisualEffect`/`EffectColor` 语义令牌闭集：`src/ui/components/types.ts`（防注入·主题令牌解析）。
- 真实用法：`src/games/game-i/fx-lab.ts`（特效台）、`anim-lab.ts`（动画台）、`spawn-lab.ts`。
- 主题令牌（语义色 danger/gold/jade…→ 主题）：`src/ui/components/types.ts` 的 `UITheme`。

## ③ 本线红线

- 表现字段（Color.alpha、Transform）用 `t1-tween`，**不进 hash / 不被 Condition 读**（否则破回放）。
- 颜色用**语义令牌闭集**（EffectColor/EdgeColor），play-field Color 用值但**不收自由注入**。
- HUD/菜单**不用** render 组件手搭——那是 UI 库 LayoutNode 的活（ui.md）。

## ④ 正样例 / 反面教材

- ✅ `src/games/game-i/fx-lab.ts`：VisualEffect 闭集纯数据驱动。
- ✖ 游戏层自写 canvas 绘制 / 自由 CSS 动画 / 收 raw hex 破语义令牌。

## ⑤ 查不到怎么办

需要的动效/渲染表现闭集里没有 → `docs/workflow/requests.md` 提缺口（先看能否用现有 EffectKind + tween 重组）。3D 渲染进 `requests-3d.md`（见 3d.md）。**不手写渲染逃生。**
