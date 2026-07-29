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

## Phase 3 —— 引擎整合发布（规划中）

**目标**：将 Apollo 引擎（阿波罗引擎）的逻辑与数据迁移、整合进工具，形成一体化发布产物。

**关键工作**：

1. **逻辑整合**：把 Apollo 引擎的运行时逻辑接入到制作工具的预览 / 导出流程中。
2. **数据整合**：统一制作工具的工程数据格式与 Apollo 引擎的数据格式（或建立转换层）。
3. **一体化打包**：编辑器 + 引擎作为同一套产物发布，供 ZeroCraft 游戏使用。

**待决策项（需要确认）**：
- Apollo 引擎当前的形态（独立仓库 / 私有代码 / 数据文件？）
- 引擎与编辑器之间的数据契约（Schema）如何定义。
- 发布形态（纯前端静态站点 / Electron 桌面端 / 两者皆有？）

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
