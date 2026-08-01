# 事件与逻辑链手册

> 「条件成立 → 发信号 → 改世界」全用能力串起，游戏层不写规则代码。
> **信号铁律**：写世界 = 具名 `Signal` 经 enqueue 入队 → 由能力系统消费；**handler / 触发点里绝不塞自由逻辑**。
> 机读真相：`describe`（`src/skills/tier2·tier3`）；条件表达式 `src/skills/tier2/condition.ts`（`ConditionExpr`，被多能力复用）。

## ① 做 X → 用什么

| 任务 | 能力实名 | 怎么接（一句） |
|---|---|---|
| 条件成立时发信号 | `t2-event-when` | 挂 `EventWhen{signal,when,mode}`（threshold/状态/门控）；下游 query Signal 消费 |
| 信号直接改世界 | `t2-effect-apply` | 挂 `Effect{onSignal,kind,targetId,value}`（Commit 相位，下拍生效） |
| 按 Tag 掩码批量解锁一片区域的 Flag | `t2-effect-apply`（`kind:'set-flag-tagged'`） | `Effect{onSignal,kind:'set-flag-tagged',tagMask,targetId,value}`：tagMask 命中的实体里 `Flag.id===targetId` 者批量置 active（destroy-tagged/set-visible-tagged 的 Flag 孪生·webbed 区域解锁同款） |
| 顾客点单/收集类多槽交付 + 集齐续单 | `t2-order-fulfill` | 挂 `Order{needItems,filled,reward,pool?,rotateMode?,cursor?}`；`DeliverDrop` 消费落格；`pool` 非空则集齐发奖后轮换下一单（`sequence` 按 cursor 环回 / `weighted` 用世界 `RandomSeed` 加权抽） |
| 点世界实体发信号 | `t2-clickable` | 挂 `Clickable{action}`；命中即入队信号 |
| 按键/具名动作发信号 | `t2-keybind` | 挂 `KeyBinding{key,signal}`；人/AI 共用动作总线 |
| 进入触发区 | `t2-trigger-zone` | 挂 `Tag(ZONE_FLAG)`；靠 overlap-detect 的 Overlap，写 `Trigger` |
| 花费换取 / 一次改多值 | `t2-craft-recipe` | 挂 `CraftRecipe{onSignal,costs,gains}`（商店/合成） |
| 整局流程状态机 | `t3-flow` | 挂 `GameFlow{id,current,states}`；when 复用 `ConditionExpr` |
| 实体各自读条件施自身效 | `t2-self-rule` | 挂 `SelfRule{when,do,once?}`（自走棋/弹幕群自治） |
| 胜负/占据/到达判定 | `t2-zone-occupancy` | 挂 `Zone{outFlag,矩形,requiredTag,count}`；下游读 outFlag |
| 组数量作为可读数值 | `t2-group-count` | 挂 `GroupCount{countResource,requiredTag}`；阈值配 event-when |
| 演出时序（第 N tick 发什么） | `t3-timeline` | 挂 `Timeline{id,cues:[{at,do}],playOnSignal,skipOnSignal?}`；do=signal/flag/resource/spawn 四闭集；播完发 `timeline:done:<id>` |

## ② 样例指针

- registry：`t2-event-when`/`t2-effect-apply`/`t3-flow`/`t3-timeline` 的 `describe.examples`。
- 真实用法：`src/games/game-g/flow-walk.test.ts`（流程机）、`src/games/game-i/fsm-lab.ts`（状态机台）。
- UI 侧信号入队见 ui.md（`mountUI` 的 `ActionSink`）。

### 演出时序（timeline·管「何时」）

- **flow vs timeline**：flow=状态机（分支/门控/流程），timeline=固定节拍编排（第 N tick 发什么）。转场/开场三连 cue/演出节拍用 timeline；胜负流程/回合状态用 flow。
- **timeline 管「何时」、tween 管「怎么动」**：cue 只发 `Signal`/写 `Flag`/写 `Resource`/发 `SpawnRequest`（四闭集），表现层订阅信号、tween 演动画——handler 里绝不塞自由演出逻辑。
- **快进**：`skipOnSignal` 一 tick 内按序补发全部剩余 cue，**终态与逐 tick 播放完全一致**（回放安全）。**绝不走墙钟**：游标 t 按 tick 推进。

## ③ 本线红线

- **handler 里绝不塞自由逻辑**：UI/交互只发具名 `Signal`，一切世界改动由 effect/craft/flow 等能力在 sim 里做。
- 条件用 `ConditionExpr`（event-when/flow 复用），不各写一套判定。
- 概率门用 `chancePass` 种子化（randomness.md），**禁裸 `Math.random`**。

## ④ 正样例 / 反面教材

- ✅ `src/skills/tier2/event-when.ts` + `effect-apply.ts`：条件→信号→效果全数据。
- ✖ 在点击/按键回调里直接改 Resource/State（绕过信号入队 → 破确定性、AI 复用不了）。

## ⑤ 查不到怎么办

现有条件算子/效果 kind 表达不了的规则 → `docs/workflow/requests.md` 提缺口（先看 event-when `when` + effect kind 能否重组）。**不在游戏层写规则 system。**
