# ZeroCraft Game Maker · 需求书

> 本文件是**产品需求的唯一事实源**。与实现冲突时以本文为准，但必须在同一改动内
> 同步修正本文。工程进度与交接见 `docs/HANDOFF.md`，架构分期见 `docs/ROADMAP.md`。

## 1. 产品定位

**ZeroCraft Game Maker = 专门为做游戏而生的 AI 工作平台。**

不是通用编码工具。所有入口、提示词、流程都指向「用 ZeroCraft 引擎做游戏」；
通用编码能力即便底座具备，也不作为产品主线暴露。

## 2. 核心架构：Engine / Content 分离（Unreal 类比）

| Unreal | ZeroCraft | 位置 |
| --- | --- | --- |
| Unreal Engine | ZeroCraft 引擎（原 Apollo） | `packages/apollo-engine/src/{engine,skills,assembly,renderer,ui,net,services,runtime}` |
| Content 工程 | 一个游戏 | `packages/apollo-engine/src/games/<slug>/` |

**硬约束**：

- 游戏**只含数据与薄接线**，不含引擎本体；引擎是 **`import` 引用关系**。
- 引擎有能力缺口时**去补引擎**，不在游戏层自造系统。
- 新游戏长在引擎包内，因此 tier1–4 积木库、八阶段流程板、美术管线工具**开箱即得**，
  不复制引擎、不产生第二份真相。

## 3. 第一性原则与铁律

**整个游戏是数据，不是代码。** 引擎是固定的确定性解释器；游戏内容由 Assembly JSON
蓝图描述。违反下列任一条即判定未完成：

1. 禁止在游戏层自写解释器 / 状态机引擎 —— 玩法用既有 capability 组合表达。
2. 禁止裸 `Math.random()` —— 破坏确定性 tick 与回放/联机，随机走引擎受控随机源。
3. 禁止 `innerHTML` —— UI 走 LayoutNode 数据化组件。
4. 零测试不出货；不得跳过、删除或弱化测试来制造通过。

## 4. 工作流：八阶段流程板

由 `packages/apollo-engine/tools/game-pipeline.mjs` 驱动，**状态从工件推导，不信模型
口头汇报**；机器门证据绑内容指纹，**游戏文件一动证据自动过期**。

| 阶段 | 机器门判据 |
| --- | --- |
| S1 立项卡 | concept 字段非空 |
| S2 能力计划 | plan 在档 或 免 plan 裁决在案 |
| S3 骨架关 | parseManifest 零 error + 真引擎 load + 空跑 2 tick |
| S4 玩法关 | 自证产物在档（`S4-alignment.md` + shots ≥5，**缺=拒跑**）→ 验收剧本 ≥3 场景 → 该游戏 vitest 绿 |
| S5 UI 关 | 自证产物在档 → game-skill-audit 红旗零 |
| S6 美术关 | 台账推导（MOCK 不算完成） |
| S7 品质关 | 视觉评分卡 |
| S8 终检关 | tsc + vitest + build 三绿 |

**规矩**：开工先 `board <slug>`，只做第一个非绿阶段；宣布"完成"的唯一凭据 = 贴
`board` 全绿输出，不全绿只许说"做到 SN"。

## 5. 自我迭代 / 自我验证

S4/S5 的自证产物是**硬门禁**，也是自我打磨的抓手——不靠人工反复推审：

- 引擎自带**无头渲染**：`AsciiRenderer.render(world) → string`（字符网格，agent 可
  直接读）、`frame-svg`（可存档证据）；
- 引擎是**确定性 tick**，同 seed 同输入必然同结果 → 证据可复现、回归可比对；
- 循环：跑起来 → 渲一帧读 → 对照 S1 玩法描述找差距 → 改数据 → 再跑，
  每轮差距与修法写进 `SN-alignment.md`。

## 6. 美术管线：账本制

美术不是"丢一堆图进去"，而是账本驱动：资源登记 → `ledger:audit` 校验缺漏与孤儿。
Studio 侧有对应面板（`ArtLedgerPanel` / `AssetBrowser` / `AssetImportWizard` /
`AssetGenPanel` / `AssetPendingReview`）。

## 7. 用户体验要求（一体化）

| 要求 | 状态 |
| --- | --- |
| 「新建」页只提供做游戏的入口，移除通用编码入口 | ✅ 已实现 |
| 点击入口即触发 game-maker Skill，自动读八阶段流程与积木库 | ✅ 已实现 |
| 新建游戏一条命令起手，产出可跑真代码 | ✅ 已实现（`pnpm new:game`） |
| **游戏跑在 ZeroCraft 右侧栏，不另开浏览器** | ✅ 已实现（右侧栏「运行游戏预览」，见下） |
| 一键构建 / 发布 | ⬜ 未实现 |

**右侧栏预览的落地口径**（改动只在 `apps/desktop/**`，属 ① IDE 框架线）：

- 入口：右侧栏「+」菜单的**游戏**组、以及空态首行「运行游戏预览」。
- 谁起 dev server：**main 进程**。renderer 只交一个 `workdir` 作为「从哪往上找仓库」的
  线索，要执行什么由 main 从仓库结构推导（`packages/apollo-engine/package.json` 的
  `name` 必须恰为 `@zerocraft/apollo-engine`），renderer 无从指定命令、参数或环境。
- 端口 5180 上**已经有服务就复用**（用户自己 `pnpm dev:engine` 起的也算），标记
  `external` 并且退出时不去杀它；只有本进程拉起的才在退出时回收。
- 谁触发 addTab：**renderer**。main 起好后回一个 URL，renderer 走既有的
  `openUrlInSidebarBrowser` 开 `web-browser` 页签，全程不碰系统浏览器。
- 依赖没装时**如实报错让用户自己装**，不代跑 `pnpm install`。

## 8. 工作分工（三条线·各自域界与门禁）

三条线**写权限不重叠**，改动范围决定该跑哪道门禁。跨线需求走「提单」而非直接动手。

| 线 | 负责 | 写权限域 | 提交门禁 |
| --- | --- | --- | --- |
| **① IDE 框架线** | ZeroCraft 外壳：菜单、面板、右侧栏、会话、插件、打包 | `apps/desktop/**`、`packages/`（除 apollo-engine） | `pnpm --filter desktop typecheck` + desktop 单测 + `check:i18n` |
| **② 引擎线** | 积木库与运行时：capability、渲染、assembly、UI 基座、工具链 | `packages/apollo-engine/src/{engine,skills,assembly,renderer,ui,net,services,runtime,assets,debug}`、`tools/**` | 引擎包全量 `test` + `typecheck`（碰共享面=影响所有游戏，需说明影响面） |
| **③ 游戏内容线** | 具体游戏：蓝图数据、玩法、该游戏美术 | `packages/apollo-engine/src/games/<自己的 slug>/**`、`docs/design/<slug>/**`、`public/games/<slug>/**` | 八阶段流程板 `board <slug>` + 该游戏 vitest |

**跨线规则**：

- ③ 发现积木缺口 → **提给 ②**（补引擎），不在游戏层自造系统。
- ② 需要新的宿主能力（面板/预览/工具暴露）→ **提给 ①**。
- ① 不碰引擎与游戏内容；② 不碰具体游戏目录；③ 不碰引擎共享面。
- 引擎为 vendored（见 `packages/apollo-engine/SYNC.json`）：② 改共享面会在下次上游
  同步时冲突，**必须在改动说明里点出**。

**并行安全**：三条线域界不重叠，可多 session 并行；同线内多任务应各自开分支，
避免抢同一批文件。

## 9. 明确不做（当前阶段）

- 不做账号体系与云端同步（本地优先）。
- 引擎不发 npm 包、游戏不出 monorepo（形态 A 工作室模式）；待外部用户出现再议。
- 不做插件（`.cindy`）形态——除非需要分发给没有本仓的人，或需要插件独有能力。
