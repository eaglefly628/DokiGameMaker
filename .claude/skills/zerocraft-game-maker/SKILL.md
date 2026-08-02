---
name: zerocraft-game-maker
description: 用 ZeroCraft（Apollo）引擎做游戏的完整工作流。当用户要「做一个游戏 / 加一个玩法 / 改游戏机制 / 做关卡 / 推进某个游戏 / 加卡牌·战斗·合成·塔防·平台跳跃等玩法」，或提到 Assembly 蓝图、capability、积木、流程板、game-i 等本引擎概念时使用。它给出八阶段生产流程板、积木清单查法、自证与门禁判据，以及必须遵守的数据驱动铁律。
---

# ZeroCraft Game Maker

用**已有积木**拼游戏，按**八阶段流程板**推进。

> 所有命令都在仓库根执行。引擎与工具在 `packages/apollo-engine/`。

## 0. 新建一个游戏（从 ZeroCraft Engine 模板起手）

用户说「新建/做一个游戏」而目标游戏还不存在时，**先用模板建骨架，不要从空文件手写**：

```bash
pnpm new:game <slug> -- --name "显示名" --pitch "一句话玩法"
```

它产出的是**能立刻跑起来的真代码**（不是占位注释）：起手蓝图（真 capability）、
`mount(container) => cleanup` 入口、冒烟测试（真引擎 load + 空跑 2 tick）、设计文档
骨架，并自动注册进预览页。建完即可 `pnpm dev:engine` 看到它在动。

**新游戏直接长在引擎包内**（`packages/apollo-engine/src/games/<slug>`），所以
tier1–4 积木库、八阶段流程板、美术管线工具**开箱即得**——不复制引擎、不留第二份真相。

建完接着走下面的流程板。

## 1. 开工第一命令（**不许跳过**）

```bash
node packages/apollo-engine/tools/game-pipeline.mjs board <slug>
```

**先看板，再干活；只做第一个非绿的阶段。** 板子的状态是**从工件推导**的（真跑
manifest / 测试 / 台账 / 审计），不是谁说了算——所以：

- 不要凭对话历史判断"做到哪了"，**一律以 board 输出为准**；
- 不要一口气冲完八个阶段。**一次只推一个阶段**，做完重跑 board 确认再往下；
- 机器门的证据绑内容指纹，**游戏文件一动证据自动过期**——绿不是永久绿。

这条设计正是为了治「LLM 长流程上下文丢失/漂移」，见
`packages/apollo-engine/tools/game-pipeline.mjs` 头注释。

## 2. 八阶段与判据

| 阶段 | 做什么 | 机器门判据 |
| --- | --- | --- |
| **S1 立项卡** | 名字 + 一句话玩法 + 参考 + 风格意向 | concept 字段非空 |
| **S2 能力计划** | 挑哪些积木、怎么组合 | plan 在档 或 免 plan 裁决在案 |
| **S3 骨架关** | manifest 立起来、引擎吃得下 | parseManifest 零 error **+ 真引擎 load + 空跑 2 tick** |
| **S4 玩法关** | 胜负/重开/核心循环闭环 | **自证产物在档**（`S4-alignment.md` + shots ≥5，**缺=拒跑**）→ 验收剧本 ≥3 场景 → 该游戏 vitest 绿 |
| **S5 UI 关** | HUD/菜单守 LayoutNode 纪律 | **自证产物在档**（`S5-alignment.md` + shots ≥5）→ game-skill-audit 红旗零 |
| **S6 美术关** | 台账 → 风格锚 → 生成 → 写回 → 复核 | 台账推导（MOCK 不算完成） |
| **S7 品质关** | 视觉评分卡打分 | 以人门为主 |
| **S8 终检关** | 全库门禁 | tsc + vitest + build 三绿 |

常用子命令：

```bash
# 打印该阶段复查清单（推进某阶段前先看）
node packages/apollo-engine/tools/game-pipeline.mjs checklist <slug> <S3|S4|S5|S8>

# 跑该阶段机器门 → 记证据（退出码即结果）
node packages/apollo-engine/tools/game-pipeline.mjs gate <slug> <S3|S4|S5|S8>

# 立项卡
node packages/apollo-engine/tools/game-pipeline.mjs concept <slug> --name "…" --pitch "…"
```

**宣布"完成"的唯一凭据 = 贴 `board <slug>` 的全绿输出。不全绿只许说"做到 SN"。**

## 3. 自证（S4/S5 的硬门，也是自我迭代的抓手）

S4/S5 要求 `S4-alignment.md` / `S5-alignment.md` + **≥5 张画面证据**，缺了直接拒跑。
这不是走过场——**它是让你自己发现问题、自己改的机制**，不要等人来指出。

拿画面证据**不需要人肉截图**，引擎自带无头渲染：

- `AsciiRenderer.render(world) → string`（`@renderer/ascii-renderer.js`）——
  把世界渲成字符网格，**你自己就能读**，用来判断"东西在不在该在的位置、动没动"；
- `frame-svg`（`@renderer/frame-svg.js`）——渲成 SVG，可存档当证据；
- 引擎是**确定性 tick**：同 seed 同输入必然同结果，所以证据可复现、回归可比对。

自证的循环应该是：**跑起来 → 渲一帧读一读 → 对照 S1 的玩法描述找差距 → 改数据 →
再跑**。把每轮的差距与修法写进 `SN-alignment.md`，这就是自证产物。

规范见 `packages/apollo-engine/docs/playbooks/self-check.md`。

## 4. 查积木（**必做，禁止凭记忆**）

能力清单会变，**永远现场查**：

```bash
pnpm --filter @zerocraft/apollo-engine catalog -- --ids       # 先看有哪些（省 token）
pnpm --filter @zerocraft/apollo-engine catalog -- --grep 卡牌  # 按玩法找
pnpm --filter @zerocraft/apollo-engine catalog                # 全量详情
```

每条输出含 `provides`（提供哪些组件及字段类型）、`when`（何时用）、`e.g.`（真实数据
示例）——**照 `e.g.` 的数据形状写蓝图**，那是信号最高的部分。

找不到合适积木时**先回来问**，不要自己造一套系统。

## 5. 铁律（违反即判定未完成）

**整个游戏是数据，不是代码。** 引擎是固定的确定性解释器；游戏内容用 Assembly JSON
蓝图描述。产出物是**数据蓝图 + 薄接线**，不是一坨新系统。

1. **禁止在游戏层自写解释器/状态机引擎** —— 玩法用既有 capability 组合表达。
2. **禁止裸 `Math.random()`** —— 破坏确定性 tick 与回放/联机，随机走引擎受控随机源。
3. **禁止 `innerHTML`** —— UI 走 LayoutNode 数据化组件（`@ui/components`）。
4. **零测试不出货**；不得跳过、删除或弱化测试来制造通过。

## 6. 本地跑起来看

```bash
pnpm dev:engine     # → http://localhost:5180，选择页点进游戏
```

新游戏要出现在预览页，在 `packages/apollo-engine/src/dev-preview.ts` 的 `GAMES` 加一行。
游戏入口导出 `mount(container) => cleanup`。

参考写法：`packages/apollo-engine/src/games/game-i/`（各 `*-lab.ts` 是按主题拆开的
蓝图示例，最适合照着学）。

## 7. 手册（按需查，不要全读）

`packages/apollo-engine/docs/playbooks/`：
`game-production.md`（八阶段线手册·**推进阶段前读对应节**）· `self-check.md`（自证）·
`review-gates.md`（三门制）· `testing.md` · `cards.md` · `combat.md` ·
`movement-pathfinding.md` · `randomness.md` · `rendering-fx.md` · `art-pipeline.md` ·
`assets.md` · `save-platform.md` 等。核心铁律正文在 `docs/rules/`。

## 8. 边界

- 游戏相关改动只在 `packages/apollo-engine/` 内。
- 动 `src/engine` / `src/skills` 等**引擎共享面**会影响所有游戏——除非用户明确要求
  改引擎，否则在游戏自己的目录里解决；确需改时先说明影响面。
- 引擎为 vendored（见 `SYNC.json`）：改了共享面，下次从上游同步会冲突，须在改动说明里点出。
- 美术走**账本制**（登记 → `ledger:audit` 校验），不是"丢一堆图进去"。
