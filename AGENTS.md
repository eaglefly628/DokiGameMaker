# ZeroCraft Game Maker：Agent 工作入口

> 本文件是 Codex 与 Claude Code 共用的项目指令**正本**。`CLAUDE.md` 只保留
> `@AGENTS.md`，不要在两处重复维护规则。

## 0. 这是什么

**ZeroCraft Game Maker = 可视化制作工具（Editor / Studio） + 内置运行引擎（Apollo）**。

它由两份 vendored 的上游代码拼成，两份都还在持续跟上游同步：

| 组成 | 来源 | 同步锚点 |
| --- | --- | --- |
| **桌面/移动外壳**（`apps/`、`packages/@cindy/*`、`cindy-protocol/`） | fork 自 [`makecindy/cindy`](https://github.com/makecindy/cindy)（Apache-2.0，心动网络 X.D. Network） | 根 `UPSTREAM.json` |
| **引擎内核 + 制作端 Studio**（`packages/apollo-engine/`） | vendored 自 [`eaglefly628/ApolloGame`](https://github.com/eaglefly628/ApolloGame) | `packages/apollo-engine/SYNC.json` |

**Apache-2.0 归属（`LICENSE` / `NOTICE` / `docs/legal/notices/`）永久保留，不得删改。**
本仓正在做的「去 Cindy 化」改的是**规则与品牌**，不是版权归属——两件事不要混。

## 1. 三条工作线

任何任务开工前，先判断自己在哪条线上：

| 线 | 内容 | 主责角色 |
| --- | --- | --- |
| **A · 上游移植** | 持续把上游 Cindy 的改动、上游 Apollo 的引擎增量移植进来 | `upstream-cindy-porter`、`apollo-sync-porter` |
| **B · 引擎改造** | 把 Apollo 引擎接进本产品，并逐步改造成我们自己的引擎框架 | `engine-core`、`engine-render`、`engine-ui`、`engine-studio`、`engine-host-bridge` |
| **C · 做游戏** | 用引擎产出实际游戏（数据 + 美术） | `game-author`、`art-ledger` |

横跨三条线的支撑角色：`rule-migrator`（规则治理 / 去 Cindy 化）、`gatekeeper`（门禁验收）。

## 2. 角色路由表

角色卡在 `.claude/agents/`，**每张卡写明了自己的域边界、必读、铁律与验收命令**。
按「你要动哪些文件」对号入座：

| 你要动 | 用这个角色 |
| --- | --- |
| `packages/apollo-engine/src/{engine,skills,assembly,net,services,runtime}` | `engine-core` |
| `packages/apollo-engine/src/renderer/**`（含 3D） | `engine-render` |
| `packages/apollo-engine/src/ui/**`（LayoutNode 控件闭集 / 主题） | `engine-ui` |
| `packages/apollo-engine/src/studio/**`（制作端面板） | `engine-studio` |
| `apps/desktop/**` 与引擎接线（面板注册 / Vite 别名 / CSP / IPC / 打包） | `engine-host-bridge` |
| 从上游 Cindy 移植改动 | `upstream-cindy-porter` |
| 从上游 Apollo 重新同步引擎 | `apollo-sync-porter` |
| 游戏蓝图数据 / 玩法 / 关卡 | `game-author` |
| 美术账本、资源导入与审计、`apollo-engine/tools/**` | `art-ledger` |
| 规则文档、`AGENTS.md`、去 Cindy 化 | `rule-migrator` |
| 提交前门禁与验收结论 | `gatekeeper` |

**跨出域边界的缺口不要自己伸手改**：在报告里开单指名对应角色，由 owner 调度。

## 3. 仓库边界

- 本仓负责 desktop、mobile、共享 packages，以及 **vendored 的 Apollo 引擎**。
- 上游 Cindy 仓与 Apollo 仓（`eaglefly628/ApolloGame`）**都是独立仓库**，除非用户明确
  要求，不跨仓修改。Apollo 仓保持独立，其分支纪律与验收体系原样保留。
- 服务端位于独立仓库；本产品默认**本地优先**，端点已改为 localhost 自托管占位。
- 开始工作前先检查工作区状态和相关源码，不覆盖、不回退用户已有改动。

## 4. 引擎铁律（碰 `packages/apollo-engine/**` 必守）

**第一性原则：整个游戏是数据，不是代码。** 引擎是固定的确定性解释器；游戏内容全部用
数据（Assembly JSON 蓝图）描述。尺子：**「最弱的 LLM 能否产出同样的数据？」**
正文见 `packages/apollo-engine/docs/rules/data-driven-uniqueness.md`。

由此派生的硬红线（**违反即判定未完成**）：

1. **禁止在游戏层写解释器** —— 游戏行为经既有 capability 组合表达；表达不了就**下沉
   通用 capability**，不在游戏层自造执行引擎。
2. **禁止裸 `Math.random()`** —— 破坏确定性 tick 与回放，随机一律走引擎受控随机源。
3. **禁止 `innerHTML` / 手写自由 DOM / 手写 React 游戏屏** —— UI 走 LayoutNode 数据化控件闭集。
4. **游戏 = 一份 Assembly JSON** —— 新游戏的产出物是数据蓝图，不是一坨新代码。
5. **数字不许手抄** —— capability 清单读 `src/assembly/capability-registry.ts`，原子读
   `src/skills/atoms/index.ts`，UI 控件闭集读 `src/ui/components/catalog.ts`。文档里写死的
   数字一律视为过期信号。

### ⚠️ 本仓有两套 UI 规范，别串线

| 你在改哪 | 适用规范 |
| --- | --- |
| `apps/desktop/src/renderer/**`（制作工具外壳） | `docs/design-rules/DESIGN.md` |
| `packages/apollo-engine/src/ui/**`（游戏内 UI / HUD / 菜单） | `packages/apollo-engine/docs/rules/apollo-ui-contract.md` |

## 5. 规则组织

- 开发与工程规则统一放在 `docs/dev-rules/`。
- 产品行为与体验规则统一放在 `docs/product-rules/`。
- **制作工具外壳**的 UI 视觉、交互与内容设计规则放在 `docs/design-rules/`，权威正文为
  `docs/design-rules/DESIGN.md`（根 `DESIGN.md` 仅为跳转入口），目录索引为
  `docs/design-rules/cindy-design-system.md`。
- 引擎与游戏侧的规则、手册在 `packages/apollo-engine/docs/`（`rules/` 铁律、
  `playbooks/` 20 份生产线手册）。
- 角色卡在 `.claude/agents/`。
- 根 `AGENTS.md` 只保留所有任务都适用的规则、风险入口和文档索引；目录或模块专属规则
  优先放到对应目录的嵌套 `AGENTS.md`。

> **规则体系正在去 Cindy 化改造中**：哪些规则保留、哪些改写、哪些删除，以
> `docs/dev-rules/rule-migration-plan.md` 的三分表为准。**判定必须以代码为准，不以
> 文档为准**——凭印象删规则是这条线最大的风险。

## 6. 规则索引（改动前对号入座）

**上游移植**

- 从上游 Cindy 移植、或从上游 Apollo 重新同步引擎前，必须先读
  `docs/dev-rules/upstream-sync.md`（两条线的锚点与「不能被回退」清单）。

**环境与启动**

- 首次接触本仓、需要定位功能代码位置或判断新代码归属模块时，先读仓库地图
  `docs/dev-rules/repo-map.md`；引擎面另见 `docs/ZEROCRAFT-CODEBASE-NOTES.md` 与
  `packages/apollo-engine/README.md`。
- 首次安装、修复依赖或准备新 worktree 时，必须先读
  `docs/dev-rules/environment-setup.md`。
- 启动、调试或验证 Desktop 时，必须先读 `docs/dev-rules/desktop-development.md`。
- 开发、调试或验证 Mobile 时，必须先读 `docs/dev-rules/mobile-development.md`。
  修改 `apps/mobile` 的原生配置、原生依赖、config plugin 或原生模块（`app.json`、
  `app.config.js`、`eas.json`、`apps/mobile/package.json`、`plugins/`、`modules/` 等会
  进入 runtime fingerprint 的输入）前，必须先读其「冷更边界」：**除非必要，不得提交会
  改变指纹的改动**；会触发冷更的改动与技术框架变动同级，**必须由 owner 针对冷更明确
  确认后才能合并**——不看改动大小，也不看谁提的，提交者身份不构成例外。

**安全与边界（底线，不因去 Cindy 化而放松）**

- 修改 Desktop Renderer、preload、BrowserWindow、WebView、IPC、CSP、导航或 Electron
  特权能力前，必须先读 `docs/dev-rules/electron-security-and-process-boundaries.md`。
- 修改凭证或授权信息处理、文件落盘位置、用户持久数据、临时文件或测试目录前，必须
  先读 `docs/dev-rules/credentials-and-local-storage.md`。
- 修改插件（`.cindy`）运行时、沙箱、权限、能力 slot、面板供片、网络／凭证／文件交接，
  或身份卡、管子协议、打包与编写手册前，必须先读
  `docs/dev-rules/plugin-security-and-authoring.md`。
- 修改 Desktop 数据库 schema、migration、companion script 或运行期数据库访问前，必须
  先读 `docs/dev-rules/database-and-migrations.md`（历史 migration 是 append-only）。
- **项目自动化执行闸门**：`.cindy/automations/schedules.json` 从被打开的项目目录读取，
  其 `preRunHook.command` 经系统 shell 执行。本仓已加总开关（默认关、三重 fail-closed，
  见 `apps/desktop/src/main/project-automation-settings-store.ts` 与
  `scheduler-host/project-automation-loader.ts`）。**任何把它默认打开、或绕过该闸门的
  改动，都必须 owner 明确拍板。**

**功能与实现**

- 新增或修改媒体生成、导入、缓存、附件、持久化、协议解析或回收逻辑前，必须先读
  `docs/dev-rules/media-storage-and-protocols.md`。
- 修改 `packages/maker-core` 的 Agent 编排、prompt 组装、tool／MCP 暴露、translator、
  model 映射、usage 计量，或任何进入模型 system 段的提示词前，必须先读
  `docs/dev-rules/maker-core-and-agent-behavior.md`。
- 修改 Orca 多 Agent 协同时，必须先读 `docs/dev-rules/orca-team-architecture.md`。
- 修改客户端自动更新链路（`cindy-updater` 或 Electron 侧更新服务）前，必须先读
  `docs/dev-rules/cindy-updater.md`（高风险模块；本仓自托管下的更新源口径待改写，
  见迁移计划）。
- 新增或修改 Desktop 日志、IPC 错误处理、main 侧业务逻辑与测试、跨平台（macOS／
  Windows）行为，或任何 UI 文案的 i18n 落地前，必须先读
  `docs/dev-rules/engineering-conventions.md`。
- 升级 `cindy-protocol`、修改插件分发来源边界或 device-link 协议／relay／隧道
  payload／IPC allowlist，或任何改动跨端 wire protocol 前，必须先读
  `docs/dev-rules/protocol-and-submodules.md`（**注意：本仓已把协议 vendored、去
  submodule，该文档口径待改写**）。
- 修改 package 依赖方向、main 进程模块加载方式，或主界面布局树结构前，必须先读
  `docs/dev-rules/architecture-invariants.md`。
- 新增或修改 Settings UI、配置文件、本地偏好、运行时 profile，或 agent／MCP／provider
  开关前，必须先读 `docs/dev-rules/configuration-and-overrides.md`。
- 新增或修改涉及 workdir 文件、agent 进程、会话数据的功能，或新增 IPC channel／推送事件
  前，必须先读 `docs/dev-rules/remote-and-mobile-adaptation.md`。

**产品与设计**

- 新增或调整产品功能、判断能力应进入 Core / Skill / 插件、设计人机交互或多端体验前，
  必须先读 `docs/product-rules/core-product-principles.md`。
- 新增或修改**制作工具外壳**的界面、组件、布局、样式、动效或 UI 文案前，必须先读权威
  设计规范 `docs/design-rules/DESIGN.md`；设计文档索引见
  `docs/design-rules/cindy-design-system.md`。外壳侧所有新增或修改的 UI 必须同时**实现**
  Light 与 Dark 两种模式（颜色一律走语义 token，禁止只适配一种模式的硬编码或条件补丁）；
  只实现一种模式视为未完成。**两种模式的实机目检不是硬性门槛**——做不到时如实写明哪种
  模式未验证，不得把「复用了 themed 样式」当成「双模式已验证」。
- **游戏内 UI 走另一套规范**，见 §4 的两套 UI 规范表。
- 新增或修改任何 UI 文案里的**产品术语**前，必须先查术语表 `i18n/GLOSSARY.md`：已裁决
  的术语照用，不自造译法；表里没有或拿不准的，在 `i18n/glossary.json` 加
  `status: "proposed"` 条目再讨论。门禁为 `pnpm check:i18n-glossary`，规则见
  `docs/dev-rules/engineering-conventions.md` §5.1。

**流程**

- 在内嵌 worktree 会话里工作、准备提交或直推、或做 code review 前，必须先读
  `docs/dev-rules/development-workflow.md`。
- 改动任何规则文档前，必须先读 `docs/dev-rules/rule-migration-plan.md`。

## 7. 通用工作流程

1. 先确认用户目标、**自己在哪条工作线上**、仓库边界、当前分支、worktree 和工作区状态。
2. 按 §2 认领角色并读该角色卡；跨出域边界就停下来开单，不自己伸手。
3. 尊重开发者或宿主已经提供的 Git 工作流。已有任务分支或 worktree 时直接复用，
   不嵌套创建；没有隔离方案时，可以建议新功能使用独立分支或 worktree，但不要擅自
   搬动或混用现有工作区。
4. 根据任务类型读取 §6 的相关规则；引擎面另读 `packages/apollo-engine/docs/`。
5. 先读实际代码和测试，再决定实现；**不要只依赖文档猜测现状**——本仓文档正在改造中，
   代码是唯一真相。
6. 修改时保持范围最小，保护用户已有改动，不使用破坏性 Git 命令。
7. 完成后运行与风险匹配的检查，并 review 整体 diff。
8. 如实报告已验证、未验证、风险和需要用户决定的事项。

## 8. Git 与交付

- 本仓默认 PR-first。代码和文档通常从非默认分支通过 PR 进入 `main`；只有 owner 明确
  选择例外时才允许直推主干。
- commit、push 和创建 PR 的执行时机由 owner 或宿主工作流决定；仓库规则本身不额外
  授权外部写操作。
- 提交 PR 时遵循 `.github/PULL_REQUEST_TEMPLATE.md`，如实说明改动、验证和风险。
- **DCO 签名（硬性要求）**：本仓每个 commit 都必须带 `Signed-off-by` trailer，且其中的
  名字与邮箱都要与 commit 的 author（或 committer）一致，用 `git commit -s` 生成；
  agent 的自动提交同样适用。PR 上的 DCO check（DCO GitHub App，配置见
  `.github/dco.yml`）会拦下漏签的 commit。`git commit` 没有自动签名的配置项，一次配好
  可跑 `pnpm dco:install-hook` 装 `.githooks/prepare-commit-msg`；提交前自查用
  `pnpm check:dco`。DCO 全文见根目录 `DCO`，贡献者说明见 `CONTRIBUTING.md`。
  对自动 code review 环境的说明：review 沙箱 checkout 出的 HEAD 可能是平台合成的
  瞬时 commit（不存在于本仓库、GitHub 上查不到该 SHA）；对这类合成 SHA 跑
  `check:dco` 的失败结果不构成缺签证据，不要据此报告 DCO 问题。判定 DCO 是否通过，
  一律以 PR 上的 DCO App check 与真实提交范围（`origin/main..PR head`）的结果为准。
- **提交前测试门禁（硬性要求）**：无论是提 PR 还是直接 commit，提交前都必须在本地
  跑完仓库根 `pnpm test:unit`（全部单元测试），并对本次改动涉及的每个 package 跑
  `pnpm --filter <包名> run --if-present typecheck`（`<包名>` 用该 package 在
  `package.json` 里的 `name`，如 `desktop`、`@cindy/maker-core`、
  `@zerocraft/apollo-engine`；没有 `typecheck` script 的 package 该步自动跳过），
  全部通过后才允许提交；任何一项失败都不得提交，必须先修复。细则与唯一例外
  （防丢数据的兜底保存）见 `docs/dev-rules/development-workflow.md`。
- **搬运必须留同步锚点**：动了 vendored 面就必须更新 `UPSTREAM.json` 或
  `packages/apollo-engine/SYNC.json`。
- 在上述门禁之上按风险追加验证：跨模块、高风险或基础设施改动追加更广泛验证（如
  `pnpm test:all`，引擎面另跑
  `node packages/apollo-engine/tools/scoped-gate.mjs --run`），最终以 CI 门禁为准。
  **不得通过跳过、删除或弱化测试制造通过；不得用 `vitest | grep` 吞掉失败退出码。**

## 9. 绝对安全底线

- 用户凭证、令牌、授权文件和密钥不得写入仓库或任何可能被 Git 跟踪的路径。
- 未经用户明确授权，不执行删除数据、覆盖改动、推送、发布、合并等外部或难以
  恢复的操作。
- Apache-2.0 归属（`LICENSE` / `NOTICE` / `docs/legal/notices/`）不得删改。
- 发现任务会触及系统提示词、更新器、协议兼容、数据库历史 migration、权限边界、
  项目自动化执行闸门或用户数据安全时，必须先停下来核对专项规则，并在动手前向用户
  说明风险或请求确认。
