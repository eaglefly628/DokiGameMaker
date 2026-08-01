# 卡牌手册

> 卡牌进 sim = 确定性发牌 / 出牌 / 判型 / 计分，可 lockstep、可回放。牌与小丑效果**全是数据表**，由能力解释。
> 机读真相：`describe`（`src/skills/tier2·tier3`）；组件闭集 `src/assembly/component-map.ts`。

## ① 做 X → 用什么

| 任务 | 能力实名 | 怎么接（一句） |
|---|---|---|
| 牌库/手牌 + 确定性发牌 | `t2-card-pile` | 牌桌挂 `CardPile{owner,deck,hand,handSize}` + `PlayedHand{owner}` |
| 注入"出哪几张"命令流 | `t2-card-play` | 每玩家牌桌挂 `PlayedHand{owner}` + `Flag`（scoring 脉冲）；单人统一输入 / 多人 lockstep |
| 判牌型给基础分（含百搭） | `t3-poker-hand` | 同实体挂 `PokerHand{rankingTable,chipsResource,multResource}` + `PlayedHand{cards}` |
| 逐张小丑 / baseChips 累加 | `t3-card-scoring` | 挂 `PerCardScore{chipsResource,baseChipsByRank}`（与 PlayedHand 同实体）；每♦+mult、人头+chips、retrigger |
| 拖放摆牌/一排格位 | `t2-drag-place` / `t2-tray` | 拖：`Draggable{snap}`+`Shape`；排：`Tray{originX,gap,capacity}` |
| 选牌交互 → 出牌信号 | `t2-clickable` | 卡片挂 `Clickable{action}`，信号接 card-play/scoring（见 events-logic.md） |

## ② 样例指针

- registry：`t3-poker-hand`/`t3-card-scoring` 的 `describe.examples`（Balatro 式逐张结算）。
- **正样例·计分核**：`src/games/game-e/session.ts`（回合逻辑，无 React 依赖可 headless 测）。
- **正样例·数据小丑目录**：`src/games/game-e/joker-catalog.ts`（全量小丑元数据）+ `jokers.ts`（声明式 `{op,target,value,when}` 效果，弱 LLM 可产/校对）。
- 装配：`src/games/game-e/blueprint.ts`。

## ③ 本线红线

- 牌型/计分/发牌**全用能力**，游戏层不写计分循环（虚胖数据禁：小丑效果必须由 card-scoring 消费，不是文案摆设）。
- 发牌/洗牌种子化（randomness.md），**禁裸 `Math.random`**。
- UI/HUD（手牌区、计分板）走 LayoutNode（见 ui.md），不手写 React。

## ④ 正样例 / 反面教材

- ✅ game-e 计分核 `session.ts` + 数据小丑 `joker-catalog.ts`/`jokers.ts`：**最佳正面教材**（牌与效果=纯数据）。
- ✖ 手写 React 卡牌屏（game-e 曾有的手写屏已移除；见 llm-onboarding §4——手写 UI 屏勿模仿）。

## ⑤ 查不到怎么办

新牌型/新结算算子现有能力表达不了 → `docs/workflow/requests.md` 提缺口（先看能否用 poker-hand rankingTable / card-scoring 数据字段重组）。**不在游戏层写自定义计分器。**
