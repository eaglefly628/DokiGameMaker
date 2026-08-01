# 规则去 Cindy 化迁移计划（KEEP / REWRITE / DROP）

> **读取时机**：改动 `AGENTS.md`、`CLAUDE.md`、`docs/dev-rules/`、`docs/product-rules/`、
> `docs/design-rules/` 或任何规则文档之前。
>
> **执行角色**：`.claude/agents/rule-migrator.md`。
>
> **本文件是这条工作线的进度真相**：每处理完一条就在表里更新「状态」列。

## 背景

本仓的整套规则体系继承自上游 Cindy（心动网络 X.D. Network，Apache-2.0）。其中混着三类
东西，必须分开处置：

- 真正 load-bearing 的工程纪律（本仓有对应门禁在跑）
- 机制还在、但口径是上游公司的（内部把关人、上游服务、上游分支纪律）
- 上游公司内务，本仓既无人执行也无意义

## 三分法与判据

| 类别 | 判据 | 动作 |
| --- | --- | --- |
| **KEEP** | 描述的机制在本仓真实存在，且本仓真的在执行 | 保留，只改品牌与主语 |
| **REWRITE** | 机制在，口径是上游的 | 改写成 ZeroCraft 口径，责任人 = owner |
| **DROP** | 机制在本仓已不存在，或纯属上游内务 | 删除，并在本表记录理由与日期 |

### 🔴 判定纪律

1. **以代码为准，不以文档为准。** 要 DROP 一条规则之前，先 grep 确认它描述的脚本 /
   门禁 / 配置项在本仓确实不存在。**凭印象删规则是这条工作线最大的风险。**
2. **`LICENSE` / `NOTICE` / `docs/legal/notices/` 的 Apache-2.0 归属不在本计划范围内，
   永不删改。** 去 Cindy 化改的是规则与品牌，不是版权归属。
3. **一次一个主题、小步可回滚**，不做一次性大重写。

---

## 一、规则文档处置表

状态取值：`待处理` / `进行中` / `已完成`。

### `docs/dev-rules/`

| 文档 | 类别 | 理由 | 状态 |
| --- | --- | --- | --- |
| `repo-map.md` | REWRITE | 地图本身有用，但没有 `packages/apollo-engine` 与三条工作线；需补引擎面 | 待处理 |
| `architecture-invariants.md` | KEEP | 包依赖方向 / main 模块加载 / 布局树，本仓仍全部生效 | — |
| `electron-security-and-process-boundaries.md` | KEEP | 信任模型与 IPC 授权边界，本仓安全底线 | — |
| `database-and-migrations.md` | KEEP | 82 个 append-only migration + `db:validate` 仍在跑 | — |
| `credentials-and-local-storage.md` | KEEP | 凭证落盘纪律，安全底线 | — |
| `media-storage-and-protocols.md` | KEEP | 协议解析 / 缓存 / 回收仍生效 | — |
| `engineering-conventions.md` | KEEP | 日志 / IPC 错误 / 跨平台 / i18n 落地 | — |
| `development-workflow.md` | REWRITE | 提交与 review 纪律保留；「Cindy 内嵌 worktree 会话」段落按本仓实际改写 | 待处理 |
| `environment-setup.md` | REWRITE | 命令有效，但 clone 地址仍指向 `makecindy/cindy` | 待处理 |
| `desktop-development.md` | REWRITE | 同上，品牌与仓库口径 | 待处理 |
| `mobile-development.md` | REWRITE | 冷更边界规则**保留**（技术判据真实有效）；「由仓库指定的把关人确认」改为「由 owner 确认」——本仓没有那个上游把关人角色 | 待处理 |
| `configuration-and-overrides.md` | REWRITE | 端点机制保留；区域 / 上游账号相关口径按本地优先改写 | 待处理 |
| `maker-core-and-agent-behavior.md` | KEEP | Agent 编排是本产品继续在用的核心 | — |
| `orca-team-architecture.md` | KEEP | 多 agent 协同仍在用（且是接 Apollo 的马达） | — |
| `plugin-security-and-authoring.md` | KEEP | Ghost 沙箱与能力 slot，安全底线 | — |
| `remote-and-mobile-adaptation.md` | REWRITE | workdir / IPC 部分保留；云端远控部分标注「本地优先下默认不走」 | 待处理 |
| `protocol-and-submodules.md` | REWRITE | **已核实：本仓无 `.gitmodules`，`cindy-protocol` 已 vendored 为普通文件**，文档仍按 submodule 写（第 20/27/30/35 行），口径过期；协议兼容纪律本身保留 | 待处理 |
| `cindy-updater.md` | REWRITE | **已核实：`apps/desktop/cindy-updater/` 与 `updateService.ts` 都还在**，不能 DROP；但更新源指向上游，需改写为「本仓自托管更新链路未启用 / 待定」并保留高风险标注 | 待处理 |
| `README.md`（索引） | REWRITE | 随上述改动同步 | 待处理 |

### `docs/product-rules/` `docs/design-rules/` `i18n/`

| 文档 | 类别 | 理由 | 状态 |
| --- | --- | --- | --- |
| `product-rules/core-product-principles.md` | REWRITE | Core / Skill / 插件的能力分层判据可复用，但本产品定位已变成「游戏制作工具 + 引擎」，需重写产品目标段 | 待处理 |
| `design-rules/DESIGN.md` | KEEP（限定作用域） | 它是**制作工具外壳**（`apps/desktop/src/renderer`）的视觉规范，仍然有效。**必须显式写明它不管游戏内 UI** —— 游戏内 UI 归 `packages/apollo-engine/docs/rules/apollo-ui-contract.md` | 待处理 |
| `i18n/GLOSSARY.md` + `glossary.json` | REWRITE | 门禁机制（`check:i18n-glossary`）保留；术语内容里的 Cindy 产品术语按 ZeroCraft 逐条重裁 | 待处理 |

### 根目录

| 文件 | 类别 | 理由 | 状态 |
| --- | --- | --- | --- |
| `AGENTS.md` | REWRITE | 规则正本。已改为 ZeroCraft 口径 + 三条工作线 + 角色路由 | 已完成（2026-08-01 首轮） |
| `CLAUDE.md` | KEEP | 只保留 `@AGENTS.md`，不两处维护 | — |
| `LICENSE` / `NOTICE` / `docs/legal/` | **永不动** | Apache-2.0 归属 | — |
| `CONTRIBUTING*.md` / `SECURITY*.md` / `SUPPORT*.md` / `CODE_OF_CONDUCT*.md` | REWRITE | 仍指向上游 security advisory 与社区渠道，需改成本仓渠道 | 待处理 |
| `README.md` / `README.zh-CN.md` | REWRITE | `README.zh-CN.md` 里还挂着上游 CI badge | 待处理 |

---

## 二、⚠️ 两套 UI 规范的边界（最容易串线的地方）

本仓同时存在两套 UI 规范，**它们都有效，管的不是同一片**：

| 你在改哪 | 适用规范 | 归属角色 |
| --- | --- | --- |
| `apps/desktop/src/renderer/**`（制作工具外壳） | `docs/design-rules/DESIGN.md`（继承自 Cindy） | `engine-host-bridge` |
| `packages/apollo-engine/src/ui/**`（游戏内 UI / HUD / 菜单） | `packages/apollo-engine/docs/rules/apollo-ui-contract.md` | `engine-ui` |

**双模式（Light / Dark）实现要求只适用于外壳侧**；游戏内 UI 走 `UITheme` 令牌系统，
是另一套主题机制。写规则时不要把两者合并成一条。

---

## 三、不因去 Cindy 化而放松的门禁（谁提都不删）

| 门禁 | 命令 |
| --- | --- |
| DCO 签名 | `pnpm check:dco` |
| 提交前单测 | `pnpm test:unit` |
| 涉及包 typecheck | `pnpm --filter <pkg> run --if-present typecheck` |
| 端点字面量 | `pnpm check:endpoints` |
| i18n / 术语 | `pnpm check:i18n`、`pnpm check:i18n-glossary` |
| 品牌术语 | `pnpm check:brand-terminology` |
| 开发文档契约 | `pnpm check:dev-docs` |

> ⚠️ `pnpm check:dev-docs`（`scripts/__tests__/dev-docs-contract.test.mjs`）会断言
> `AGENTS.md` 与两份 `CONTRIBUTING` 中必须出现 `docs/dev-rules/environment-setup.md`、
> `desktop-development.md`、`mobile-development.md` 三条路径，并校验文档里出现的
> `pnpm` 命令真实存在、本地链接可解析。**改规则文档前先知道这条约束，否则门禁必红。**

---

## 四、已知的上游遗留死链（引擎侧）

vendored 的 `packages/apollo-engine/docs/rules/*.md` 保留了上游专有路径，在本仓不存在：

| 文档里写的 | 本仓实际 |
| --- | --- |
| `scripts/scoped-gate.mjs` | `packages/apollo-engine/tools/scoped-gate.mjs` |
| `scripts/game-skill-audit.mjs` | `packages/apollo-engine/tools/game-skill-audit.mjs` |
| `docs/design/data-driven-manifesto.md` | 未搬入（近义正文见 `docs/rules/data-driven-uniqueness.md`） |
| `docs/design/ui-playbook.md` | 未搬入（近义正文见 `docs/playbooks/ui.md`） |
| `docs/llm-onboarding.md` | `docs/rules/llm-onboarding.md` |
| `src/launcher.tsx`、`docs/workflow/`、`docs/roles/` | 有意未搬入（见 `SYNC.json` excluded） |

处置归 `apollo-sync-porter`：下次同步时改成本仓真实路径，或在包 README 补一张映射表。

---

## 变更记录

| 日期 | 动作 |
| --- | --- |
| 2026-08-01 | 建立本计划；首轮改写根 `AGENTS.md`；建立 `.claude/agents/` 角色卡与 `UPSTREAM.json` 锚点 |
