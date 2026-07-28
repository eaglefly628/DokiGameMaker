# ZeroCraft Game Maker

> 零手搓 —— 不用手搓代码，AI 帮你把游戏「组装」出来。ZeroCraft 系列 Web 游戏的一体化开发端。

**ZeroCraft Game Maker** 是一款一体化的 Web 游戏开发端：可视化制作工具 + 内置运行引擎，让开发者（和 AI）在同一个工具里完成游戏的编辑、预览与发布。

- **开发端外壳**：fork 自开源 AI Agent 客户端 [Cindy](https://github.com/makecindy/cindy)（Apache-2.0），复用其 Electron 桌面外壳、面板化 UI、插件系统与多模型 Agent 编排。
- **游戏内核**：整合自研的 **Apollo（阿波罗）引擎** —— 数据驱动的原子化 ECS 引擎（「游戏是数据，不是代码」）—— 作为运行时与统一数据格式。
- **理念**：「零手搓」= 你用自然语言 / 数据描述玩法，AI 组装成可运行游戏，无需手写引擎代码。

## 当前状态

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| Phase 1 | 仓库初始化 | ✅ |
| Phase 2 | fork Cindy 开源客户端作为开发端基座；去品牌化为 ZeroCraft、本地优先、跑通编译 | 🚧 进行中 |
| Phase 3 | 整合 Apollo 引擎逻辑与数据，一体化发布 | ⏳ |

详细路线图见 [`docs/ROADMAP.md`](docs/ROADMAP.md)。

## 与上游 Cindy 的关系

本仓库是 Cindy 开源客户端的定制分支，当前处于「导入 + 改造」阶段：

- 已 vendored 上游源码（`makecindy/cindy` @ `8bb72510`），保留 Apache-2.0 [`LICENSE`](LICENSE) 与 [`NOTICE`](NOTICE) 归属。
- **产品层已改名 ZeroCraft**；内部 `@cindy/*` 代码命名空间与大量字符串**暂未改名**——待有可编译基线后再系统化替换，避免破坏构建。
- 方向：默认「本地模式」+ 自带模型，剥离账号 / 多端 / 远程托管等云端默认连接（**代码保留、只关默认**）。

## 环境要求

- **Node.js** 22.x · **pnpm** 10.x · **Git LFS**

## 开发 / 构建（简版）

```bash
pnpm install
pnpm restart:desktop:local    # 本地模式启动桌面端（开发中）
pnpm build                    # 桌面端构建
pnpm release:package          # 打桌面分发包（macOS 版需在 Mac 上执行）
```

> 桌面端 GUI 实跑与 macOS 打包需在本机（尤其 Mac）执行；无头 CI / 容器只做安装、类型检查、测试与构建校验。工程细节沿用上游文档 [`CONTRIBUTING.en.md`](CONTRIBUTING.en.md)、[`AGENTS.md`](AGENTS.md)、[`docs/`](docs/)。

## 许可证

源代码依据 [Apache License 2.0](LICENSE) 授权，fork 自 Cindy，归属见 [`NOTICE`](NOTICE)。第三方组件保留各自许可，SBOM 见 [`docs/legal/`](docs/legal/)。
