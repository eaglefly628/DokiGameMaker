# 在 Mac 上打包 ZeroCraft 桌面版（Apple Silicon / M-series）

本文说明如何在你自己的 Mac（Apple 芯片，如 M5）上把 ZeroCraft Game Maker 的桌面端
**编译并打包成安装包**。桌面端基于 Electron（electron-forge），**必须在 macOS 本机**
打包 —— Linux/CI 只能做安装、类型检查与构建校验，出不了 Mac 产物。

> 现状：外壳基于 Cindy 开源客户端 fork。**外部展示名已改为 ZeroCraft**（Dock / 菜单栏 /
> 关于窗口 / Finder 显示名 / 应用内文案）；内部代码命名空间仍是 `@cindy/*`（有意保留，
> 只让「外面」是 ZeroCraft）。云端能力（账号 / 多端 / 远程托管）默认走**本地模式**。

## 一、前置要求

- **macOS**（Apple Silicon）
- **Xcode Command Line Tools**：`xcode-select --install`（编译原生模块 better-sqlite3 / node-pty 需要）
- **Node.js 22.x**（`.nvmrc` 已固定 `22.22.3`；建议用 nvm：`nvm install`）
- **pnpm 10.x**：`corepack enable && corepack prepare pnpm@10.33.2 --activate`
- 可选 **Git LFS**：`brew install git-lfs`（见下方「已知缺口」）

## 二、拉取与安装

`cindy-protocol` 已作为普通文件 vendored 进本仓，**不需要初始化 submodule**。

```bash
git clone https://github.com/eaglefly628/DokiGameMaker.git
cd DokiGameMaker
pnpm install          # 会自动下载 darwin-arm64 的 Electron 二进制并编译原生模块
```

> 不要加 `--frozen-lockfile` 之外的跳过开关；本机打包需要真实的 Electron 二进制
> （与无头 CI 的 `ELECTRON_SKIP_BINARY_DOWNLOAD=1` 不同）。

> **打包前置 —— agent 二进制**：`pnpm install` 的 postinstall 会「尽力（best-effort）」
> 下载 ripgrep / claude-code / codex 三个随包二进制，而打包的 `prePackage` 钩子**强制要求**
> 目标平台的这些二进制存在。若网络受限导致 best-effort 下载被跳过，`pnpm build` 会在
> 打包阶段报 `failed to ensure pinned ripgrep <平台>；run "pnpm update:ripgrep" ...`。
> 手动补齐即可：`pnpm install:agent-binaries`（或单独 `pnpm install:ripgrep`）。

## 三、打包安装包（本地 ad-hoc 签名，无需 Apple 开发者账号）

### 方式 A —— 最省事：ZIP（默认已可用）

```bash
pnpm build
# 产物：apps/desktop/out/make/zip/darwin/arm64/*.zip（解开即 ZeroCraft.app）
```

### 方式 B —— DMG 安装包（推荐分发用）

DMG 依赖 `@electron-forge/maker-dmg`（内含 macOS 原生 `appdmg`，故未放进
lockfile；在 Mac 上按需安装即可，forge 已配置好、装了就自动出 dmg）：

```bash
pnpm --filter desktop add -D @electron-forge/maker-dmg
pnpm build
# 产物：apps/desktop/out/make/**/ZeroCraft.dmg（卷名/文件名 = ZeroCraft）
```

### 方式 C —— 官方发布脚本（ad-hoc 降级，产物更规整）

```bash
pnpm release:package --no-sign
# 产物：apps/desktop/release/artifacts/<region>/unversioned/darwin-arm64/*.dmg / *.zip
# --no-sign / --allow-unsigned：无 Apple 签名凭据时降级为 ad-hoc 本地签名（脚本内置支持）
```

## 四、首次打开（未公证的 Gatekeeper 放行）

ad-hoc 签名、未经 Apple 公证的应用，别的 Mac 首次打开会被拦（提示「已损坏 / 无法验证
开发者」）。放行一次即可：

- **右键 → 打开**，或
- 终端执行：`xattr -cr /Applications/ZeroCraft.app`（把路径换成你的 .app 位置）

## 五、本地模式运行

登录页选择**「本地模式」**（无需 Cindy 账号），或开发期直接：

```bash
pnpm restart:desktop:local     # 本地模式启动桌面端（端点指向 localhost，不连云）
```

云端能力（账号 / 多端同步 / 远程托管）当前默认不启用，代码保留、只关默认。

## 六、已知缺口（不影响本地打包与运行）

- **sqlite-vec 向量扩展**：`apps/desktop/native/sqlite-vec/**/vec0.*` 在本 fork 里是
  **Git-LFS 指针**（未随本仓携带真实二进制）。代码对其**优雅降级**（加载失败即禁用
  向量/嵌入搜索，不影响启动与其它功能）。需要该功能时，从上游 `makecindy/cindy` 用
  `git lfs pull` 取回对应平台的 `vec0.dylib` 放回原路径即可。
- **内部代号仍是 `@cindy/*`**：约 1 万处内部字符串未改（有意为之，避免破坏
  `.cindy` 插件格式 / userData 路径 / 协议包名等契约）。用户可见处已是 ZeroCraft。

## 七、这份仓库已在无头环境验证过什么

- `pnpm install`（scoped 到 desktop，跳过二进制）→ 成功，原生模块编译通过。
- `pnpm --filter desktop typecheck`（`tsc --noEmit`）→ **0 error**。
- Mac GUI 实跑与 `electron-forge make` 出 .app/.dmg 需在你的 Mac 上完成（本文即为此写）。
