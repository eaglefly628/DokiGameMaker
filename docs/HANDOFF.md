# ZeroCraft Game Maker · 会话交接书

> **新 session 开工第一件事：读 `docs/REQUIREMENTS.md`（需求唯一事实源）+ 本文件。**
> 本文件记录「当前进度 / 下一步该干什么 / 已知坑」，每次交接更新。
> 架构分期见 `docs/ROADMAP.md`；引擎同步锚点见 `packages/apollo-engine/SYNC.json`。

**分支**：`claude/ZeroMainBranch`（唯一开发分支，直推）
**最后交接**：2026-08-02 · 最后提交 `84a9a7c`

---

## 一、现在能跑什么（已验证）

| 能力 | 命令 / 位置 | 状态 |
| --- | --- | --- |
| 桌面端启动 | `pnpm --filter desktop dev`（绕开 ensure-deps，不触发安装） | ✅ |
| 引擎预览跑游戏 | `pnpm dev:engine` → `http://localhost:5180` | ✅ |
| 新建游戏 | `pnpm new:game <slug> -- --name "…" --pitch "…"` | ✅ |
| 八阶段流程板 | `node packages/apollo-engine/tools/game-pipeline.mjs board <slug>` | ✅ |
| 查积木清单（100 项） | `pnpm --filter @zerocraft/apollo-engine catalog -- --ids\|--grep <词>` | ✅ |
| 美术账本审计 | `pnpm --filter @zerocraft/apollo-engine ledger:audit` | ✅ |
| VS Code 点选运行 | `.vscode/launch.json`（9 项 + 1 compound） | ✅ |
| game-maker Skill | `.claude/skills/zerocraft-game-maker/SKILL.md`（项目目录自动扫描生效） | ✅ |

**引擎包体检**：320 测试文件 / 2686 测试通过、1 跳过；`tsc --noEmit` 0 error。

---

## 二、下一步待办（按优先级）

### 待办 1 —— 游戏跑进右侧栏（**owner 明确要的一体化，最高优先**）· ① IDE 框架线

现状：预览要另开浏览器 `localhost:5180`，不是一体化。

**调查已完成，两条路都可行，建议走 A：**

- **路线 A（内置·推荐）**：右侧栏本来就有 `web-browser` 面板（同级还有 terminal /
  file-browser / review / orca-workers）。程序化入口：
  ```ts
  // apps/desktop/src/renderer/features/right-sidebar/store.ts:381
  addTab(sessionId: string, kind: TabKindId, initialState: unknown): Promise<TabState>
  // 用法示意：addTab(sessionId, 'web-browser', { url: 'http://localhost:5180' })
  ```
  要解决的：谁负责起 dev server（agent 跑 `pnpm dev:engine`？还是宿主起）、
  以及起好后由谁触发 addTab。
- **路线 B（插件）**：`apps/desktop/src/main/cindy-brain/previewSlot.ts` —— 插件经管子
  上行 `{type:'preview-request', url, sessionId?}`，主机在右侧栏开标签；需 `preview`
  槽 + `preview.hosts` 白名单。TapTap Maker 用的就是这条。

### 待办 2 —— 用它真做一个游戏（验证流程是否好用）· ③ 游戏内容线

到现在为止**流程从未被真游戏检验过**。建议：owner 说一个玩法 → `new:game` 起手 →
按 `board` 一个阶段一个阶段推 → 走到 S4 做一次自证。**这一步很可能暴露 skill 的缺陷，
比继续加功能更有价值。**

### 待办 3 —— 安全闸的设置 UI · ① IDE 框架线

项目自动化总开关已实现（默认关、三重 fail-closed、7 条回归测试），但**没有界面入口**，
用户只能手改 `<userData>/project-automation-settings.json`。
文件：`apps/desktop/src/main/project-automation-settings-store.ts`。

### 待办 4 —— Apollo 侧守卫（**不在本仓，需 owner 在 Apollo 仓安排**）

把 `.cindy/**` 纳入「只归主程改」清单 + CI 拦截，防「谁能推仓库 = 谁能在本机定时执行
任意命令」。ZeroCraft 侧的闸已加（待办 3 的那个），这是纵深防御的另一半。

---

## 三、已知坑（别重新踩）

1. **两处测试红是容器环境限制，不是回归**——干净 HEAD 上同样复现，勿浪费时间排查：
   - `apps/desktop`：缺随包 ripgrep 二进制，本容器下不下来（GitHub API 401 +
     `cdnBaseUrl` 是占位域名 `cdn.zerocraft.example`）。owner 本机正常。
   - `packages/maker-remote-ssh`：测试用 `chmod 0o555` 模拟写失败，容器以 root 运行
     无视权限位 → 断言落空。
2. **别用 `pnpm dev:desktop`**——它先跑 `ensure-deps.mjs`，依赖漂移时**自动装依赖**，
   owner 明确不希望每次被拉去安装。用 `pnpm --filter desktop dev`。
3. **三处别名配置必须同形**：`packages/apollo-engine/` 的 `tsconfig.json` paths、
   `vitest.config.ts`、`vite.config.ts` 的 `resolve.alias`。漂移会出现「tsc 过但一跑就挂」。
4. **i18n 批量替换别碰 key**：曾把 `createWithCindy` / `slotCindy` 两个**键名**误改，
   导致 4 语言文案全丢。替换时只改值，且要查「中间含关键词的 key」，不只是开头。
5. **引擎是 vendored**：改 `src/engine` 等共享面会在下次上游同步时冲突，
   必须在改动说明里点出（`SYNC.json` 锚定上游 commit `f23f6ee`）。
6. **git push 别用管道判断结果**：`git push | tail` 会吞掉真实退出码造成假成功。

---

## 四、提交纪律

- 提交前跑仓库根 `pnpm test:unit`（全量单测）+ 改动涉及包的 `typecheck`；
  文档改动另跑 `node --test scripts/__tests__/dev-docs-contract.test.mjs` 与
  `node scripts/brand-terminology-guard.mjs`。
- 每个 commit 必须 `git commit -s`（DCO 签名，名字邮箱与 author 一致）。
- 推送：`git push -u origin claude/ZeroMainBranch`，网络失败按 2/4/8/16s 退避重试。
- **不得**通过跳过、删除或弱化测试制造通过；排除测试必须在配置里写明理由并记进
  `SYNC.json`。
