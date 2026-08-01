---
name: zerocraft-game-maker
description: 用 ZeroCraft（Apollo）引擎的积木库做游戏。当用户要「做一个游戏 / 加一个玩法 / 改游戏机制 / 做关卡 / 加卡牌·战斗·合成·塔防·平台跳跃等玩法」，或提到 Assembly 蓝图、capability、积木、game-i 等本引擎概念时使用。它给出这套引擎的开发流程、可用积木清单的查法、以及必须遵守的数据驱动铁律。
---

# ZeroCraft Game Maker

用**已有积木**拼出游戏，而不是写新引擎代码。

## 第一性原则（违反即判定未完成）

**整个游戏是数据，不是代码。** 引擎是固定的确定性解释器；游戏内容用 Assembly JSON
蓝图描述。你的产出物是**一份数据蓝图 + 必要的薄接线**，不是一坨新系统。

由此派生四条硬红线：

1. **禁止在游戏层自写解释器/状态机引擎** —— 玩法用既有 capability 组合表达。
   找不到合适积木时，先回来问，而不是自己造一套。
2. **禁止裸 `Math.random()`** —— 破坏确定性 tick 与回放/联机，随机走引擎受控随机源。
3. **禁止 `innerHTML`** —— UI 走 LayoutNode 数据化组件（`@ui/components`），不手写自由 DOM。
4. **优先复用，其次组合，最后才考虑新增能力**。

## 工作流程

### 1. 明确玩法（先想清楚再动手）
一句话说清「玩家做什么动作 → 得到什么反馈 → 怎么算赢/输」。含糊就先问用户，不要猜着做。

### 2. 查积木（**必做**，不要凭记忆）
能力清单会变，**永远现场查**，不要照抄任何历史清单：

```bash
# 先看有哪些（省 token）
pnpm --filter @zerocraft/apollo-engine catalog -- --ids

# 按玩法关键词找（卡牌 / 战斗 / 合成 / 拖拽 / 寻路 / 生成…）
pnpm --filter @zerocraft/apollo-engine catalog -- --grep 卡牌

# 全量详情（含每个能力提供的组件字段、何时用、具体示例）
pnpm --filter @zerocraft/apollo-engine catalog
```

输出里每条给了 `provides`（该能力提供哪些组件及字段类型）、`when`（何时用）、
`e.g.`（真实数据示例）——**照着示例的数据形状写蓝图**，这是信号最高的部分。

### 3. 选积木、拼蓝图
把玩法拆成「实体 + 组件」，为每个需求挑一个既有 capability。产出 Assembly 蓝图：
`entities[].components[]` 的纯 JSON 结构，`Engine.load(blueprint)` 即可运行。

参考已有游戏的写法：`packages/apollo-engine/src/games/game-i/`（各 `*-lab.ts` 是
按主题拆开的蓝图示例，最适合照着学）。

### 4. 接线与运行
游戏入口导出 `mount(container) => cleanup`（与预览页/上游 launcher 同一契约）。
本地跑起来看：

```bash
pnpm dev:engine     # → http://localhost:5180，在选择页点进游戏
```

新游戏要出现在预览页，在 `packages/apollo-engine/src/dev-preview.ts` 的 `GAMES` 加一行。

### 5. 过门禁（**改完必须跑，看退出码**）

```bash
pnpm --filter @zerocraft/apollo-engine test        # 引擎 + 游戏测试
pnpm --filter @zerocraft/apollo-engine typecheck   # tsc --noEmit
pnpm --filter @zerocraft/apollo-engine ledger:audit # 动了美术才需要
```

**不要靠"看起来对"交付**：没跑过测试就说完成了，等于没完成。测试红了先修，
不要跳过、删除或弱化测试来制造通过。

## 美术怎么加（账本制）

美术不是「丢一堆图进去」，而是**账本驱动**：资源在账本里登记，由 `ledger:audit`
校验缺漏与孤儿。加美术前读
`packages/apollo-engine/docs/playbooks/art-pipeline.md` 与 `assets.md`。

## 手册（按需查，不要全读）

`packages/apollo-engine/docs/playbooks/` 下按主题分：
`cards.md`（卡牌）· `combat.md`（战斗）· `movement-pathfinding.md`（移动寻路）·
`randomness.md`（随机）· `rendering-fx.md`（渲染特效）· `art-pipeline.md`（美术管线）·
`save-platform.md`（存档）· `testing.md`（测试）· `self-check.md`（自检）等。

核心铁律正文在 `packages/apollo-engine/docs/rules/`。

## 边界

- 只在 `packages/apollo-engine/` 内做游戏相关改动。
- 动 `src/engine` / `src/skills` 等**引擎共享面**会影响所有游戏——除非用户明确要求
  改引擎，否则应在游戏自己的目录里解决；确需改引擎时先说明影响面再动手。
- 引擎为 vendored（见 `packages/apollo-engine/SYNC.json`）：本地改了引擎共享面，
  下次从上游同步时会冲突，务必在改动说明里点出来。
