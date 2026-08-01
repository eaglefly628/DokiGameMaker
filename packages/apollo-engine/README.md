# @zerocraft/apollo-engine

ZeroCraft Game Maker 的**运行时内核 + 制作端 Studio**，自 [`eaglefly628/ApolloGame`](https://github.com/eaglefly628/ApolloGame)
（分支 `claude/mainbranch`）vendored 而来。**同步锚点见 [`SYNC.json`](./SYNC.json)——它是唯一权威来源，
任何一次重新同步都必须更新它。**

## 这里面是什么

| 目录 | 内容 |
| --- | --- |
| `src/engine` | 引擎本体：确定性 tick 循环、`defineCapability()` 自描述 + 拓扑排序调度 |
| `src/skills` | 原子能力库（26 原子 skill + Tier 1–4 涌现层） |
| `src/assembly` | Assembly 蓝图：**纯 JSON 的游戏定义**，`Engine.load(blueprint)` 即可运行 |
| `src/renderer` | 引擎无关渲染：`collectRenderables(world) → Renderable[]` + 可替换后端（Canvas / Three / ASCII / SVG） |
| `src/ui` | 数据化 UI（LayoutNode → `mountUI`），HUD/菜单等 |
| `src/studio` | **制作端 Studio**：`DesignStudio` / `CreationWizard` / `GamePipelinePanel`，以及美术管线面板（见下） |
| `src/net` `src/services` `src/runtime` `src/assets` `src/debug` | 联机（lockstep）、服务层、运行时、资源与调试 |
| `docs/playbooks` | **怎么用这个引擎做游戏**的手册（20 份） |
| `docs/rules` | **核心铁律**（数据驱动第一性原则、UI 契约、引擎总览、LLM onboarding） |
| `tools` | 美术管线工具 + 门禁（ledger / audit / scoped-gate） |

## 🔴 核心铁律（做任何游戏前必读）

**第一性原则：整个游戏是数据，不是代码。** 引擎是固定的确定性解释器，游戏内容全部用
数据（Assembly JSON 蓝图）描述；AI 与用户只编辑数据。正文见
[`docs/rules/data-driven-uniqueness.md`](./docs/rules/data-driven-uniqueness.md)。

由此派生的硬红线（违反即判定未完成）：

1. **禁止在游戏层写解释器** —— 游戏行为经既有 capability 组合表达，不自造执行引擎。
2. **禁止裸 `Math.random()`** —— 破坏确定性 tick 与回放，随机一律走引擎的受控随机源。
3. **禁止 `innerHTML`** —— UI 走 LayoutNode 数据化组件，不手写自由 DOM。
4. **游戏 = 一份 Assembly JSON** —— 新游戏的产出物是数据蓝图，不是一坨新代码。

完整规约见 [`docs/rules/APOLLO-CLAUDE-snapshot.md`](./docs/rules/APOLLO-CLAUDE-snapshot.md)
（上游 agent 规约快照，含引擎域界定义）。

## 🎨 美术管线（ledger 制）

美术不是"丢一堆图进来"，而是**账本（ledger）驱动**——每个资源在账本里登记，
由审计命令校验，缺失/多余/未评审都会被拦下。

```bash
node tools/ledger-audit.mjs        # 美术账本审计（缺漏/孤儿资源）
node tools/styleset-ledger.mjs     # 风格集账本
node tools/asset-reconcile.mjs     # 资源与账本对账
node tools/build-artlib-index.mjs  # 重建美术库索引
node tools/import-art-pack.mjs     # 导入美术包
node tools/ui-audit.mjs            # UI 规范审计
```

Studio 侧对应面板：`ArtLedgerPanel`（账本）、`AssetBrowser`（浏览）、
`AssetImportWizard`（导入）、`AssetGenPanel`（生成）、`AssetPendingReview`（待评审）。

手册：[`docs/playbooks/art-pipeline.md`](./docs/playbooks/art-pipeline.md)、
[`assets.md`](./docs/playbooks/assets.md)、[`character-card.md`](./docs/playbooks/character-card.md)、
[`3d.md`](./docs/playbooks/3d.md)。

## 本地运行（VS Code / 终端）

```bash
# 仓库根执行；首次先 pnpm install
pnpm dev:engine        # 起引擎预览 → http://localhost:5180
```

打开后是一个极简选择页，点 **▶ Game I** 即进入游戏；左上角「⟵ 返回」卸载并回到选择页。
改任意引擎/游戏源码即热更新。

**入口**：`index.html` → `src/dev-preview.ts`。

> 为什么不用上游的 launcher：上游 `src/launcher/game-runner.tsx` 里有一张指向**全部 15 个
> 游戏**的静态 import 表，而本仓只 vendored 了其中少数（见 `SYNC.json`），整表搬进来会留
> 一堆解析不到的路径。`dev-preview.ts` 只挂**已搬入且导出 `mount` 的游戏**，契约
> （`mount(container) => cleanup`）与上游 game-runner 完全一致，不另造机制。

**加一个游戏到预览页**：把游戏搬进 `src/games/`（见下方「搬一个游戏进来」）后，在
`src/dev-preview.ts` 的 `GAMES` 数组里加一行即可。

其它常用命令：

```bash
pnpm --filter @zerocraft/apollo-engine test        # 引擎全部测试
pnpm --filter @zerocraft/apollo-engine typecheck   # tsc --noEmit
pnpm --filter @zerocraft/apollo-engine ledger:audit # 美术账本审计
```

⚠️ 三处别名配置必须同形，任一漂移都会出现「tsc 过但运行/测试挂」：
`tsconfig.json` 的 `paths`、`vitest.config.ts` 与 `vite.config.ts` 的 `resolve.alias`。

## 门禁

`tools/scoped-gate.mjs` 是分级推送门禁，**退出码即门禁结果**，判词 token
`SCOPED-GATE: FULL|GAME:<g>|DOCS-ONLY|NONE` 可 grep：

```bash
node tools/scoped-gate.mjs          # 只分类打印计划，不执行
node tools/scoped-gate.mjs --run    # 真跑，退出码=结果
```

> 它与 ZeroCraft 定时任务的 **Pre-run Hook 协议天然兼容**（`exit 0` 放行 /
> `exit 2` 跳过 / 其它 fail-closed 拦截）。挂上即让 Apollo 的门禁给 ZeroCraft 的
> 自动化把关。⚠️ 挂之前先读根 `docs/ROADMAP.md` 的「前置阻断项」。

## 路径别名

引擎内部大量使用别名（`@engine` 753 处等），已在本包 `tsconfig.json` 配好；
**宿主侧（Vite/Vitest）需要配同名 alias 才能解析**：

```
@engine → src/engine     @skills → src/skills    @atom-skills → src/skills/atoms
@assets → src/assets     @services → src/services @renderer → src/renderer
@ui     → src/ui         @net    → src/net
```

## 没搬进来的东西（以及为什么）

见 `SYNC.json` 的 `excluded`。要点：**游戏内容与美术资源没搬**——上游 39,912 个文件里
37,833 个是美术素材，属于具体游戏，不属于引擎。

### 搬一个游戏进来

游戏是**内容快照**，不是活依赖，可以直接拷贝（与引擎不同，无需保持指针）：

1. 从上游取 `src/games/<游戏名>/`；
2. **连它的美术资源一起**（`public/games/<游戏名>/`、相关 `assets/`）——这才是大头；
3. 它的设计文档在上游 `docs/design/<游戏名>/`；
4. 跑 `node tools/ledger-audit.mjs` 确认美术账本对得上。

## 从上游重新同步

```bash
git clone --depth 1 --branch claude/mainbranch \
  https://github.com/eaglefly628/ApolloGame /tmp/apollo
# 对比自上次同步以来引擎面的变更（commit 取自 SYNC.json）
git -C /tmp/apollo diff <SYNC.json里的commit>..HEAD -- src/engine src/skills src/assembly \
  src/renderer src/runtime src/net src/services src/ui src/assets src/debug src/studio
```

同步完**必须更新 `SYNC.json` 的 commit**，否则下次没人知道差异从哪算起。

## 许可

上游 ApolloGame 的许可条款随代码继承；ZeroCraft 本体为 Apache-2.0 fork（见根 `LICENSE` / `NOTICE`）。
