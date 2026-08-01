# 上游移植与同步锚点

> **读取时机**：从上游 Cindy 移植改动、或从上游 Apollo 重新同步引擎之前。
>
> **执行角色**：`.claude/agents/upstream-cindy-porter.md`、`.claude/agents/apollo-sync-porter.md`。

本仓有**两条**长期存在的上游移植线，它们的姿势不同，但共用同一条纪律：
**搬运必须留同步锚点。**

## 两条线与各自的锚点

| 线 | 上游 | 锚点文件 | 覆盖范围 |
| --- | --- | --- | --- |
| **外壳线** | [`makecindy/cindy`](https://github.com/makecindy/cindy)（Apache-2.0，心动网络） | 根 `UPSTREAM.json` | `apps/`、`packages/@cindy/*`、`cindy-protocol/`、`config/`、`scripts/`、`docs/dev-rules` 等 |
| **引擎线** | [`eaglefly628/ApolloGame`](https://github.com/eaglefly628/ApolloGame) 分支 `claude/mainbranch` | `packages/apollo-engine/SYNC.json` | `packages/apollo-engine/**` |

两个锚点各自记录「本仓的这份拷贝跟到上游哪个 commit」。**没更新锚点的移植 = 未完成。**

## 共用铁律

1. **搬运必须留同步锚点。** 这是 owner 2026-08-01 定的红线（见 `docs/ROADMAP.md` Phase 3）。
   无法追溯来源的漂移是这套 vendored 架构唯一会致命的失败模式。
2. **不做整包覆盖式同步。** 全量覆盖会一次性抹掉本仓所有 fork 改动。
3. **不在搬运里夹带改造。** 上游增量与本仓修改分成不同 commit——这是这条线还能长期
   做下去的前提，也是将来 diff 得清「哪些是上游的、哪些是我们的」的唯一办法。
4. **门禁不旁路。** 移植完照跑本仓全套门禁，不因为「这是上游代码」而豁免。
5. **归属不动。** `LICENSE` / `NOTICE` / `docs/legal/notices/` 的 Apache-2.0 归属永远保留。

## 外壳线：移植前必查的「不能被回退」清单

清单正本在 `UPSTREAM.json` 的 `forkChangesThatMustSurvive`（机读），逐条核对上游 diff
有没有碰到它。其中最要命的三条：

- **端点自托管**（`config/endpoint*.json`）—— 被覆盖会**回连上游服务器**。
- **项目自动化默认关**（`project-automation-settings-store.ts` + loader 三重 fail-closed）
  —— 被覆盖等于**本机任意命令执行闸门被顶开**。
- **内部标识符刻意不改**（`brandIdentity.ts`）—— 方向是反的：移植时**也不要顺手改名**，
  改了会废掉 `.cindy` 插件格式与用户数据目录。

## 引擎线：重新同步的四步

```bash
# 1. 取上游（本仓没有 apollo remote，需在仓外单独克隆）
git -C <apollo克隆> fetch origin claude/mainbranch

# 2. 只 diff SYNC.json included 里的那些面
git -C <apollo克隆> diff <SYNC.commit>..origin/claude/mainbranch -- \
  src/engine src/skills src/assembly src/renderer src/runtime src/net \
  src/services src/ui src/assets src/debug src/studio

# 3. 搬运 included；excluded（游戏内容 / 美术资源 / bench / launcher /
#    docs/workflow / docs/roles）一律不搬

# 4. 重施 vendor patch → 引用断链自检 → 更新 SYNC.json
```

`SYNC.json.notes` 里登记着**同步时需重新施加的 vendor patch**（当前一条：
`src/assets/asset-index.test.ts` 的真实索引自检改为 `it.skipIf(...)`）。忘记重施 = 门禁必红。

## 验收

移植完成后按改动面跑门禁，命令见 `docs/dev-rules/development-workflow.md` 与
`.claude/agents/gatekeeper.md`。最低线：

- 外壳线：`pnpm test:unit` + 涉及包 `typecheck` + `pnpm check:endpoints` + `pnpm check:dco`
- 引擎线：`pnpm --filter @zerocraft/apollo-engine typecheck` + 同包 `test` + `pnpm test:unit`

## 报告要求

每次移植的报告必须写清：**上游 commit 区间、搬了哪些面、主动放弃了哪些以及为什么、
锚点更新到哪个 commit、门禁跑了哪些（附退出码）**。
