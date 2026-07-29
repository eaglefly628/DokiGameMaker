# ZeroCraft 代码库理解笔记（我的架构地图）

> 这份文档是「接手/改造这份代码前先读一遍」的向导。它**不是**逐文件读完 5903 个文件的产物——
> 那既不现实也没必要。它综合自两类来源：
> 1. **权威文档**：`docs/dev-rules/*.md`（每份都标了「读取时机」与「事实来源」表）、`docs/README.md`、
>    `docs/product-rules/`、`README`。这些文档本身就是为 AI agent 组织的全仓地图。
> 2. **结构化通读**：对 `apps/`、`packages/`、`config/` 的目录树与关键源码做了一次系统性 survey，
>    下方引用了具体文件路径（`file:line` 可点）。
>
> **可信度标注**：能引到具体文件路径的条目 = 已直接核对；只给结论没给路径的 = 据权威文档转述。
> 有疑问一律以 `docs/dev-rules/` 的对应文档正文与其「事实来源」表为准。
>
> **一个关键命名坑**：产品术语是「插件（plugin）」，但**代码标识符仍叫 `Ghost` / `cindy-brain`**——
> 二者指同一个东西。看到 `ghost.json` / `GhostRuntime` / `cindy-brain/` 就是「插件系统」。

---

## 0. 它是什么 + 为什么好读

- ZeroCraft = **fork 自 Cindy 开源客户端**（Apache-2.0）的 Electron 桌面 + Expo 移动 **AI Agent 客户端**，pnpm monorepo。
- **它本身是用 Claude Code / agent 开发的**：满仓 `AGENTS.md`/`CLAUDE.md`、`docs/dev-rules/` 的 authoritative 治理文档、提交署名 `Claude <noreply@anthropic.com>`。所以定位与理解都快——**「好读」不等于「已全读」**，改动前仍要读对应 dev-rule。

## 1. Monorepo 布局

workspace globs（`pnpm-workspace.yaml`）：`apps/*`、`packages/*`、`cindy-protocol/packages/*`。权威地图：`docs/dev-rules/repo-map.md`。

| 顶层目录 | 内容 |
|---|---|
| `apps/` | 终端产品 + 随包二进制：`desktop`（Electron+Vite）、`mobile`（Expo/RN）、以及不入仓的 CLI 二进制目录 `claude-code-bin`/`ripgrep-bin`/`codex-bin`/`android-platform-tools-bin` |
| `packages/` | 24 个客户端能力包，与 main/renderer 解耦（见 §5） |
| `cindy-protocol/` | 与服务端共享的 wire-protocol 权威源。子包：`device-link-protocol`/`plugin-protocol`/`skill-protocol`/`slack-hook-protocol`/`voice-protocol`。**本 fork 已把它 vendored 成普通文件（去 submodule）** |
| `config/` | 运行期端点清单 `endpoint.json`(cn)/`endpoint.global.json`(global)/`endpoint.dev.json.example`。**本 fork 已改为 localhost 自托管占位** |
| `scripts/` | 仓库级工程脚本：dev 启动器、`ensure-agent-binaries.mjs`、i18n/endpoint/DCO 门禁、worktree 管理 |
| `tools/` | 三个随包 CLI（claude/codex/ripgrep）的版本 pin（`latest.json`）+ 更新器 |
| `i18n/` | 术语治理：`GLOSSARY.md`、`glossary.json`、schema、baseline |
| `docs/` | 规则文档：`dev-rules/`（authoritative 工程规则）、`product-rules/`、`design-rules/`、`legal/` |

## 2. apps/desktop 结构

`apps/desktop/src/` = `main/` + `renderer/` + `preload/` + `shared/` + `test/`。

**入口点**：
- **主进程**：`main/index.ts`（薄壳：剥离敏感 Anthropic env、按区域设 userData 目录、在任何 `ipcMain.handle` 之前装 device-link invoke 捕获）→ 动态 import `main/bootstrap-electron.ts`。
- **渲染进程**：`renderer/index.tsx` → `App.tsx`（+ `router.tsx`、`index.html`）。
- **preload**：`preload/preload.ts`（主桥）；另有 `ghostPreload.ts`（插件面板，零权限）、`browserCommentPreload.ts`。

**`main/` 关键子系统**（`apps/desktop/src/main/<dir>`）：
- `maker-host/` — Electron 与 `maker-core` 的宿主胶水：凭证库、provider service、Claude/Codex OAuth、system-prompt 文件。
- `maker-ipc/` — `maker:*` IPC 面 + Orca 服务（见 §3/§4）。
- `maker-orchestration/` — fork/rewind/transcript-anchor。
- `mcp-integrations/` — 接 MCP 服务器（browser/computer/ghost/custom/codex bridge）。
- `cindy-brain/` — **插件（Ghost）运行时**、能力 slot、打包、setup（见 §6）。
- `localDb/` — SQLite/Drizzle 引擎（见 §7）。
- `layout/` — `LayoutStore.ts` 布局持久化。
- `device-link/` — 跨设备远控宿主（dispatch/ownership/媒体传输/allowlist）。
- 其它：`im/`、`remote-ssh/`、`scheduler-host/`、`voice-input/`、`terminal/`、`file-browser/`、`git-*`、`plugin-market/`、`skillhub/`、`secrets/`、`security/`(CSP)、`model-access/`、`embedding-host/`、`updateService.ts`。

**`renderer/` 关键子系统**：
- `layout/` — 布局引擎（`LayoutRoot.tsx`、`PanelDragController.tsx`）。
- `panels/` — 顶层面板注册（`registry.ts`、`builtinPanels.tsx`、`PanelChrome.tsx`）。
- `features/` — 功能 UI：`cc-agent`（聊天/agent + Orca 分屏）、`billing`、`device-link`、`scheduler`、`skillhub`、`plugin` 等。
- `cindy-brain/` — 插件面板、权限列表、主题注入（渲染侧）。
- `state/`、`contexts/`、`hooks/`、`themes/`、`i18n/`、`analytics/`。

**`shared/`** — 跨进程协议/类型/纯函数（无 IO）。关键：`layoutTree.ts`、`ghost.ts`、`endpoints.ts`、`brandRegion.ts`、`deviceLinkIpc.ts`、`ipc-errors.ts`。

## 3. IPC 与进程边界

信任模型（权威：`docs/dev-rules/electron-security-and-process-boundaries.md`）：渲染=不可信 UI，preload=最小桥，**main=信任边界，IPC=授权边界**。

- **通道注册表/allowlist**：`main/maker-ipc/channels.ts`（所有 `maker:*` 常量；禁止字符串硬编码）。
- **注册装配**：`main/maker-ipc/register.ts`（`registerMakerIpc`：单进程级 Maker 实例，把每会话事件流转发到所有窗口）；`ipcHandlerRegistry.ts` + `electronIpcRegistry.ts` 提供可单测的 Electron 无关注册表。
- **preload/contextBridge**：`preload/preload.ts` 只暴露语义化方法，绝不暴露裸 `ipcRenderer`；payload 到渲染前剥掉 `IpcRendererEvent`。
- **sender 守卫**：handler 校验 `event.senderFrame` 来自 Cindy 自己的顶层帧；身份（userId/ghostId/window-id）从 `event.sender` 反查，绝不信 payload。
- **device-link 隧道**：`main/device-link/invoke-registry.ts` 在启动早期 monkey-patch `ipcMain.handle` 捕获全量 channel→handler 映射，受控设备经 allowlist（`packages/device-link/src/allowlist.ts`）远程 invoke。

## 4. Agent 编排（核心）

权威：`docs/dev-rules/maker-core-and-agent-behavior.md`、`orca-team-architecture.md`。

- **核心抽象全在 `packages/maker-core`（无 Electron 依赖）**：`Maker`（`src/maker.ts`）= 会话注册表 + agent 路由，按 `AgentKind` 持有 `BaseAgent`，按 `(agentKind, workDir)` 建 `Session`。`BaseAgent`（`src/agents/base-agent.ts`）是统一抽象；具体 harness = `agents/claude-code/`（Claude Code SDK）与 `agents/codex/`。`agents/*/translator.ts` 把厂商 SDK 事件无损映射成 `AgentEvent`；`agents/shared/usage-tracker.ts` 管缓存率/token 计量。事件循环用非阻塞 `AsyncQueue`。
- **数据流**：渲染 → `maker:*` IPC → 进程级 `Maker` 路由到会话的 `BaseAgent`（Claude Code / Codex）→ harness 组装字节稳定的 system-prompt 前缀（SDK 预设 → `MAKER_SYSTEM_PROMPT_APPEND` → memory 规则 → 宿主 `runtimeConfig.systemPrompt` → 每 workdir 的 MEMORY.md → 每次 user prompt）→ 驱动厂商 SDK → 工具/MCP（`main/mcp-integrations/` + `packages/lizi-mcps`）→ 事件经 translator 回流 → 以 `maker:event:*` 推给渲染。
- **Orca 多 agent**（Lead 派 Worker）：main 侧 `maker-ipc/orca*Service.ts`（lifecycle/team/inter-agent dispatcher/diagnostics）；控制面 = `cindy_orca` MCP（`packages/lizi-mcps/src/orca/server.ts`，16 工具）+ 渲染 `features/cc-agent/CCAgentSessionView.tsx`；Worker↔Lead 用 `packages/orca-workflow` 的 `orca_worker_bridge` + `renderOrca*SystemPrompt`；状态存 DB `orca_teams`/`orca_workers`。

## 5. 关键 packages（一句话）

| 包 | 作用 |
|---|---|
| `auth-client` | Cindy auth-server 的 zod 客户端契约（平台无关） |
| `device-link` | 跨设备远控协议层 + WS 客户端（信封协议、IPC 隧道 allowlist、重连/心跳），零依赖 |
| `model-providers` | 模型供应目录 + 路由抽象（Anthropic/OpenAI/XD），纯逻辑 |
| `embedding-client` | 兼容 OpenAI `/v1/embeddings` 的客户端（经 XD 网关） |
| `heartbeat-client` | 周期在线心跳（上报 uid），零依赖 |
| `browser-control-runtime` | 浏览器自动化运行时（playwright-core + MCP） |
| `file-browser-core` | workdir 扫描/ignore/ripgrep 检索（桌面与远程守护共用） |
| `github-client`/`gitlab-client` | GitHub/GitLab REST 客户端 |
| `lizi-mcps` | 可复用 MCP 服务器（Google 套件、GitHub/GitLab、browser、scheduler、`orca`） |
| `lizi-im` | 可复用 IM 传输（如飞书 WS）：凭证/附件/统一出站 |
| `project-context` | agent 维护的项目知识层（commit 驱动 markdown + frontmatter CLI） |
| `voice-input-core` | 供应商无关的听写状态机 |
| `maker-shared` | 桌面+移动共享展示/契约模型（零 React/Electron/Expo）；**含 `branding.ts`(BRAND_NAME) 与 `brandIdentity.ts`(标识符)** |
| `anthropic-compat-proxy` | 回环 HTTP 代理，剥 Anthropic-only 字段让 Claude Code SDK 走非 Anthropic 后端 |
| `responses-chat-bridge` / `anthropic-responses-bridge` | OpenAI Responses↔Chat / Anthropic Messages↔OpenAI Responses 的进程内桥 |
| `remote-file-service` / `maker-remote-ssh` | 远程 SSH：NDJSON-RPC 文件守护 + 连接池/凭证 |
| `maker-cc-manager` | cc-remote NDJSON-RPC 守护（包 Claude Agent SDK，多会话 detach/reattach） |
| `maker-scheduler` | cron 引擎 + 存储/runner/notifier |
| `cindy-tools` | Ghost 系统内部 MCP 工具（含 `ghost_list`/`ghost_call`） |

## 6. 插件系统（`.cindy` / Ghost）

权威：`docs/dev-rules/plugin-security-and-authoring.md`。每个 `.cindy` 包有 `ghost.json` 身份卡（`kind:'chip'`），由 `apps/desktop/src/shared/ghost.ts` 校验（管子协议 `cindy.send`/`cindy.onHostMessage`）。

- **运行时/沙箱**：`main/cindy-brain/runtime/GhostRuntime.ts` — 每插件独立 Electron 沙箱进程 + 独立 session 分区，状态机 `off→starting→running→stopping`、`crashed`、`fused`（60s 内崩 3 次熔断）。沙箱无 Node/宿主 FS/网络；沙箱创建经 `SandboxHostAdapter` 注入。`GhostManager.ts` 管已装插件。
- **能力 slot**：`networkSlot`/`notifySlot`/`fsSlot`/`cindySlot`/`skillSlot`（`skill` 是唯一逃出沙箱、以用户全权限跑的）、`previewSlot`/`pickSlot`/`workspaceSlot`/`agentSlot`。
- **编写手册**：`main/cindy-brain/forge.ts` 的 `FORGE_GUIDE`（经 `ghost_forge_guide` 工具下发）。
- **面板/主题**：`renderer/cindy-brain/ghostPanelTheme.ts`（白名单 token、`cindy-ghost://` 协议）；插件窗口宿主 `main/ghost-panel-window/window.ts`。

**布局/面板注册**（权威：`docs/dev-rules/architecture-invariants.md`）：
- 布局树：`shared/layoutTree.ts`（全局递归 split/pane 树）。`PanelKind` 开放命名空间（内建 `session-list`/`chat-main`/`right-tabs`；插件注册为 `ghost:<id>`）。`chat-main` 恒一个、常显、不可关、min 400px。未知 panelKind 隐藏但保留。
- 持久化：`main/layout/LayoutStore.ts`。注册（渲染）：`renderer/panels/registry.ts`（`registerPanelKind`）+ `builtinPanels.tsx`。身份绝不由屏幕位置派生。

## 7. 本地数据库（`apps/desktop/src/main/localDb`）

权威：`docs/dev-rules/database-and-migrations.md`。Drizzle-ORM over better-sqlite3（仅主进程）。

- **引擎入口** `localDb/index.ts`：按 userId 一个库文件；WAL 崩溃恢复；`SQLITE_CORRUPT` 回退（`backup.ts`）；schema 漂移检测/修复。运行期访问契约 = 异步 `DbClient`（`localDb/client/` + `worker/`）。
- **schema** `localDb/schema.ts`：与服务端 Prisma 对齐；时间戳 unix-ms、JSON 列 TEXT。表含 `sessions`/`messages`/`orca_teams`/`orca_workers`/`migration_meta`/`media_blobs`/向量表 `vec_table_meta`/`embedding_meta` 等。
- **迁移** `apps/desktop/drizzle/`：**82** 个 append-only `NNNN_*.sql` + **25** 个 companion 脚本；事务化 runner `localDb/migrationRunner.ts`；冻结基线 + `scripts/validate-migrations.mjs`（`db:validate`）。
- **sqlite-vec** `localDb/sqliteVecLoader.ts`：按平台解析 `vec0.*`，缺失优雅降级（`loaded:false`，非致命）。**本 fork 里这些二进制是 LFS 指针（未回填），向量搜索默认禁用。**

## 8. 配置与端点

权威：`docs/dev-rules/configuration-and-overrides.md`。Loader：`apps/desktop/src/main/clientEndpointsService.ts`。

- 语义 = **清单唯一真值 + 阻塞式**：在 `app.ready` 内、`createWindow` 前解析；失败弹阻塞对话框（重试/退出），无静默回退。
- **来源解析**（`resolveEndpointSource`）：打包/`--endpoints-cdn` → 从区域化 hotfix CDN 拉；dev 默认 → 读仓内 `config/endpoint.json`（`XDT_ENDPOINT_MANIFEST_FILE` 可覆盖；`restart:desktop:local` 指 `config/endpoint.local.json`）。
- **区域/本地模式**：`CURRENT_CINDY_REGION`（`shared/brandRegion.ts`，构建期由 `VITE_CINDY_AUTH_REGION` 烘焙）；区域也切 userData 目录（`main/regionUserData.ts`）。
- **门禁**：`scripts/check-endpoint-literals.mjs`（`check:endpoints`）强制所有运行期地址只出现在 `config/endpoint*.json`——**所以改端点只改那两个文件即可，全仓无漏网 URL。**

## 9. 构建 / 发布

- **electron-forge** `apps/desktop/forge.config.ts`：makers `MakerZIP`+`MakerDeb`（**本 fork 加了 best-effort `MakerDMG`**）；plugins `Vite`/`AutoUnpackNatives`/`Fuses`。品牌身份由 `@cindy/maker-shared/brand-identity` 按 `CINDY_AUTH_REGION` 解析（appId `com.xd.cindy*`、exe 名、深链 scheme）。pnpm `node-linker=hoisted`，原生模块物理拷进包内再 `@electron/rebuild` + AutoUnpackNatives 解包 `.node`；Fuses 强制安全不变量。
- **打包脚本** `apps/desktop/scripts/package-desktop.mjs`：统一打包入口（只打包不发布）。`--platform/--arch/--region/--version`；`--no-sign`/`--allow-unsigned` 无签名降级。产物 `release/artifacts/<region>/<version>/<platform-arch>/`。
- **Vite 配置**：`vite.main.config.ts`/`vite.preload.config.ts`/`vite.ghost-preload.config.ts`/`vite.renderer.config.ts`/`vite.db-worker.config.ts`。渲染仍走 `file://`（历史架构）。

---

## 10. ⭐ ZeroCraft fork 相对上游 Cindy 的改动清单（接手必读）

| 改动 | 位置 | 说明 |
|---|---|---|
| 外部展示名 → ZeroCraft | `packages/maker-shared/src/branding.ts`（`BRAND_NAME`） | **单点**改一处，Dock/菜单/关于/Finder 显示名（CFBundleDisplayName）/应用内/LLM 可见名全变。**内部标识符（`brandIdentity.ts` 的 executableName/appId/scheme/userData）刻意不动。** |
| 端点去 Cindy、自托管 | `config/endpoint.json`、`config/endpoint.global.json` | 全部业务地址改 localhost 占位；接自己的后端只改这两文件。`check:endpoints` + 端点单测已过。 |
| 禁用遥测 | `apps/desktop/src/renderer/index.tsx` | 移除启动 `initTapdb()`；`analytics/tapdbClient.ts` 模块与测试保留。 |
| macOS 打包 | `apps/desktop/forge.config.ts` | 加 `isMac` + best-effort `MakerDMG`（卷名=ZeroCraft，try/require 守卫，不入 lockfile）。指南 `docs/BUILD-MACOS.md`。 |
| CI 精简 | `.github/workflows/ci.yml` | 换成 `zerocraft-ci`（装桌面依赖 + typecheck）；删依赖 submodule 的上游 CI 与两个 PR 门禁。 |
| 协议 vendored | `cindy-protocol/`（去 `.gitmodules`） | 由 submodule 改普通文件，自包含。 |
| 云端能力 | 未删代码 | `auth-client`/`device-link`/`heartbeat-client`/`remote-file-service` 等**保留**，本地优先下默认不走。 |

**尚未做**：默认自动进本地模式（现仍需登录页手选「本地模式」）；`@cindy/*` 内部命名空间的系统化改名（有意保留）；sqlite-vec 等 LFS 二进制回填；Phase 3 整合 Apollo 引擎。

## 11. 权威文档索引（改动前对号入座读）

`docs/dev-rules/`：`repo-map.md`、`architecture-invariants.md`、`electron-security-and-process-boundaries.md`、`maker-core-and-agent-behavior.md`、`orca-team-architecture.md`、`database-and-migrations.md`、`plugin-security-and-authoring.md`、`configuration-and-overrides.md`、`desktop-development.md`、`credentials-and-local-storage.md`、`media-storage-and-protocols.md`、`protocol-and-submodules.md`、`remote-and-mobile-adaptation.md`、`development-workflow.md`、`engineering-conventions.md`、`cindy-updater.md`。产品：`docs/product-rules/core-product-principles.md`。设计：`docs/design-rules/DESIGN.md`。
