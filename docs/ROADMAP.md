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
> **三层分开推进**。核心红线两条：**引用不拷贝、门禁不旁路**。
> Apollo 仓（`eaglefly628/ApolloGame`，主干 `claude/mainbranch`）**保持独立**，
> 其分支纪律、推送门禁、多 session 并行、验收体系原样保留。

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

### 第二层：积木层（引用，不搬家）

Apollo 的引擎本体 / tier1-4 能力库 / UI starters / sample 游戏，经 `workingDir`
天然可读。**现阶段明确不做 vendored 拷贝**（会立刻产生两份真相）。
待真正要做「编辑器 + 引擎一体打包」的产品形态时，再评估 git submodule 挂法。

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
2. **ZeroCraft 侧加闸**（我们自有 fork，可改）：新增项目自动化开关（默认关），
   或恢复「首次/变更需用户显式同意」语义。

**建议采用 1 + 2 并行**：Apollo 侧守卫防投毒源头，ZeroCraft 侧加闸做纵深防御。

---

## 决策记录（ADR）

后续重要技术决策将以简短条目记录在此，便于回溯。

| 日期 | 决策 | 备注 |
| --- | --- | --- |
| 2026-07-28 | 建立初始仓库与三阶段路线图 | Phase 1 启动 |
| 2026-07-28 | Phase 2 基座选定 = fork Cindy 开源客户端 | 见下方执行进度 |
| 2026-07-28 | 只改「外部展示名」为 ZeroCraft，内部 `@cindy/*` 命名空间/标识符不动 | 避免破坏 `.cindy` 插件格式 / userData / 协议契约 |
| 2026-07-28 | 云端能力暂不保留，走本地优先；简化不删代码 | owner 决策 |

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
