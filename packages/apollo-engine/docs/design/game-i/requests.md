# game-i 需求单（游戏域工单）

> 2026-07-15 立（owner 拍板「工单随游戏走·游戏可暂停」）：本游戏的 bug/玩法/演出/平衡工作票在此，
> 域主（程序/PE/design）自取自结，**不占主池 10 槽**（主池 `docs/workflow/requests.md` 只管引擎本身）。
> 标「控件缺口/引擎收编」的条目=引擎域候补——落地须走主池腾槽或 capgap 通道，游戏层不得自造。
> done 迁 `docs/workflow/requests-archive.md`；3D 线仍在 `docs/workflow/requests-3d.md`。

---

### REQ-I-展示台升格 · [2026-06-25] · owner（火车上头脑风暴）→ Lead（引擎/展示台域）· Game I · status: **进行中（Lead）** · 类型: 方向 + 真需求若干 · 优先级: P2

> **owner 意图**：把 game-i 从「UI/声音测试场」**升格为「引擎底座能力展示台 / sample 画廊」**——每个底座能力一个 canonical 活样例，作为活文档 + 回归面 + 迁移参照；以后标准代码下沉到这层当 sample。页面**重组为 Hub + 模块**（落地点几个大模块入口：UI / 声音 / 输入 / 动画 / 渲染3D…，点进去出现该块）。
>
> **Lead 评判（CORE RULE）**：接受方向（强对纲领：样例即「这能力真能数据驱动」的证明）。逐项核底座现状——多数是**组合现有 capability**，非新写引擎：
> | 模块 | 底座现状 | 判定 |
> |---|---|---|
> | UI / 声音 | 已是数据样例（mountUI / Web Audio 胶水） | ✓ 已在 |
> | 输入 | `atoms/input-capture`(RawInput)、`atoms/action-map`、`components/input.ts`(KeyBinding/Action) | ✓ 组合现有 → **本轮已做** |
> | 精灵/帧动画 | `atoms/sprite`、`atoms/frame`、`tier1/tween`、`tier1/animation` | ✓ 组合现有（走 renderer 表面·非 mountUI） |
> | 寻路 | `tier2/grid-move`、`tier2/hex`（game-f 在用） | ✓ 组合现有（走 renderer 表面） |
> | 渲染 3D | `renderer/three-renderer`、`three-projection` | ✓ 已具备 |
> | 视频 | 仅 `services/aigp`(AI 生成端口)+`assets`(资源索引)，**无播放渲染能力** | **deferred（真需求·待触发）** |
>
> **纪律**：能力永远在引擎（确定性解释器），样例永远是数据 + 薄宿主胶水（运行时职责），**绝不在游戏层写 bespoke system**；每样例保持「最弱 LLM 能照抄」纯度，**不许长成 mini-game**。分两类样例：**UI 数据样例（mountUI）** vs **渲染/仿真样例（renderer + skills）**，别混。
>
> **视频改判**：owner 明确「以后跟爱诗 AI 合作 + 开场视频要用」→ 不是 wontfix，是 **deferred 的底层真需求**：等真游戏拉动（要播放/渲染视频）再下沉成 capability，先放着不为凑 demo 提前建（避免 YAGNI）。
>
> **已落地（Lead）**：
> - **Hub + 模块重组**：落地积木墙（Card grid·点块进各模块）+ 顶栏返回；mod-ui 套现有 5 UI 子 tab。
> - **🎮 输入底座**：`input-lab.ts`（KeyBinding[] 纯数据 + resolveSignal/applyRawInput 纯函数 + LayoutNode 视图）+ 宿主 bindInputPad 监听胶水；10 测。
> - **✨ 精灵动画**：`anim-lab.ts`（tween 蓝图·4 形状）+ 渲染舞台宿主 syncStage（Engine+CanvasRenderer 挂 #sim-stage·幂等·换皮/退出拆建）；3 测 + Chromium 截图验证。
> - **🧠 游戏 AI（索敌+寻路）**：`ai-lab.ts`（aggro Perception→Relation 锁玩家 + grid-move hex A* 逐格逼近·到相邻停 的纯蓝图）；3 测 + 截图（5 敌从四周寻路合围玩家）。
> - **🧊 3D 渲染**：`three-lab.ts`（Mesh3D 翻面卡/翻滚立方/倾转面 + tween 转 rotation）+ ThreeRenderer 后端（syncStage 按 backend 选 canvas/three）；3 测 + 截图（SwiftShader WebGL 真 3D）。
> - **四根底座支柱**（owner 2026-06-25「先把这 4 档落地」）——全 Canvas、纯蓝图、零专属 system、各带测试 + Chromium 截图：
>   - **🟢 运动与碰撞**（physics-lab）：motion-apply + overlap-detect + **collision-resolve**（按 Mass 推开=真碰撞响应；勘探误判为「无响应」，实测存在）。
>   - **⚔️ 战斗结算**（combat-lab）：弹道(Sensor+Hitbox) → overlap → trigger-zone → hitbox 扣血/灼烧 DoT → mortal → destroy（照搬 game-d 写法）。
>   - **🎆 生成与寿命**（spawn-lab）：Timer(loop)→event-when→caster→prefab 周期生成粒子 + Tween 淡出 + lifetime 自毁。
>   - **🔀 状态机**（fsm-lab）：自由计时器 → event-when（timer 阈值）→ effect-apply（set-state + set-visible）idle→alert→flee→循环（reset-timer 按 targetEntity 定位）。
> 全部「组合现成能力（蓝图 capabilities+entities）」，**零专属 system**。展示台现 10 块全亮。tsc+vitest(1758)+build 全绿。
> **TODO**：序列帧 spritesheet 动画（需真实贴图资产·待资产接入）；视频模块（deferred·爱诗 AI/开场视频拉动再下沉）；Hub 积木异形/点阵底纹（待 owner 拍样式·必要时下沉 renderer 背景/异形布局能力）。

---

### REQ-3D-展示台接入·超休闲能力样例（8 已有 + 6 新缺口 A-F）· [2026-07-15] · P3D → **指派：展示台程序** · status: open · 优先级: P2 · 类型: 展示台样例接入
> **背景**：owner 让把超休闲 3D 能力做成展示台 sample。P3D 已把 6 缺口(A-F) 全实装并推（`17749db9`·全 render-only）。展示台已支持 3D → 请把下列能力各做一个可见 sample 加进展示（P3D 只出 API + 样例数据·展示台程序接入渲染场）。**都是纯数据 component·挂在带 `Transform3D` 的实体上即可。**
>
> **A 挤压拉伸**（落地压扁）：`Anim3D{channels:[{kind:'ease',field:'scaleY',from:1,to:0.6,dur:0.15,curve:'outBack'},{kind:'ease',field:'scaleX',from:1,to:1.3,dur:0.15,curve:'outBack'}]}`（分轴独立·保体积观感）。
> **B 震屏**：`Camera3D{...,shake:{trigger:N,amp:0.4,freq:30,decay:2}}`——展示台每隔一会 bump `trigger`（+1）即抖一次。
> **C 跟随柔化**：`Camera3D{mode:'follow',target:'ball',follow:{lag:0.25,lookAhead:0.15}}`——配一个来回移动的 target 实体，看镜头软跟。
> **D 运动拖尾**：移动实体挂 `Trail3D{segments:24,width:0.3,color:0x33ccff,minDist:0.05,blend:'add'}`——球滚出发光残影。
> **E 暗角 + 命中闪白**：`Post3D{vignette:{intensity:0.5,smoothness:0.4},flash:{trigger:N,color:0xffffff,decay:3}}`——暗角常驻·bump flash.trigger 全屏闪一下。
> **F 平涂/卡通**：物件挂 `Material3D{preset:'jade',shading:'toon',toonSteps:3}`（cel 阶梯）或 `{preset:'gold',shading:'flat'}`（无光纯亮色·Helix 观感）。
>
> **已有 8 能力（无需新造·同法各摆一样例）**：人群实例化(同签名 Mesh3D 多实体)、数字飘字(`WorldUI3D{node:LayoutNode}`+`Label.tween`)、撞击粒子/纸屑(`Vfx3D`)、出生弹入(`Anim3D ease scale 0→1 outBack`)、堆叠掉落(`RigidBody3D`)、跟随相机(`Camera3D mode:'follow'`)、拾取(`Pickable3D`)、微缩景深/泛光(`Post3D tiltShift/bloom`)。
> **契约**：各 component 语义/字段以 `docs/playbooks/3d.md` 表 + `src/engine/protocol/components/render.ts` 注释为准；有疑问回 `requests-3d.md` 问 P3D，勿改 three-renderer/three/**（P3D 独占域）。
>
> **★ 补充（P3D 2026-07-16·owner「刚写的那些覆盖内容也放进展览台」）**：上批之后 P3D 又下沉了一组新原语，同样请各摆一个可见 sample（都是纯数据 component·挂带 `Transform3D` 的实体即可·已在 game-z 三台实装可参照 `src/games/game-z/diorama.ts` platformTwo/platformThree）：
> - **世界折线 `Line3D`**（任意时间零点线·实线/虚线/宽度·朝相机带线，区别于 Trail3D 的运动残影）：`Line3D{points:[[x,y,z],…], width:0.5, color:0x40e0ff, dash:1.6, gap:1.1, blend:'add', closed?}`——瞄准线/系绳/路径预览。
> - **物理关节 `Joint3D`**（暴露 cannon 约束·绳/秋千/布娃娃）：刚体挂 `Joint3D{kind:'distance'|'point'|'hinge'|'lock'|'cone', anchor:[x,y,z], distance?}`（配 `RigidBody3D`）——摆锤 = distance + 水平释放。
> - **新碰撞形**（`RigidBody3D.shape`）：`capsule`（角色胶囊·掉落立稳）/`convex`（`{shape:'convex',hull:[[x,y,z]…]}`）/`heightfield`（`{shape:'heightfield',heights:[[…]],elementSize}`·地形）。
> - **贴面世界屏 `Diegetic3D`**（LayoutNode→CSS3D 真 DOM 面片·文字锐利·适合"给人看的"信息板/菜单）：`Diegetic3D{node:LayoutNode, pxWidth, pxHeight, worldWidth, bg}`——挂 Transform3D 定位/朝向。**代价**：DOM 叠层不进 WebGL 深度（不被遮挡/不吃后处理）。
> - **UV 动画材质**（流水/岩浆/传送带）：`Material3D{…, map:<textureKey>, uvAnim:{scrollX:0.08,scrollY:0.04}, tiling:{repeat:3}}`。
> 契约同上（3d.md + render.ts）；勿改 three-renderer/three/**。

### REQ-I-gallery拆分 · gallery.ts 1620 行按展台分模块（token 优化③·owner 2026-07-15 批）· [2026-07-15] · Lead 转呈 → **指派：PUI（game-i 域·勿由他人代拆）** · status: open · 优先级: P2 · 类型: 结构拆分（零逻辑改）
> 背景：owner 批「拆大文件」降低 session 读入成本（launcher.tsx 已由 Lead 拆·apollo.py 先例）。`src/games/game-i/gallery.ts` 1620 行=单文件 top1，但 game-i 是 PUI 地盘（CLAUDE.md 边界），Lead 不越界。
> spec 建议（照 apollo.py/launcher 先例）：按展台/页签的自然缝拆 `src/games/game-i/gallery/*.ts`，gallery.ts 留薄入口 re-export；**逐字节搬运零逻辑改**；tsc+vitest（game-i 测试零改动照绿）+build 全绿直推；拆后单文件 ≤500 行。
