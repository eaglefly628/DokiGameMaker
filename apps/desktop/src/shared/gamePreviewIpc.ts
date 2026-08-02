/**
 * gamePreviewIpc —— 「游戏跑进右侧栏」的跨进程契约(main / preload / renderer 共用)。
 *
 * 背景:ZeroCraft 引擎的本地预览是一个 Vite dev server(仓库根 `pnpm dev:engine`
 * = `packages/apollo-engine` 里跑 `vite`)。在此之前用户必须自己开终端起服务、再另开
 * 浏览器访问 —— 与「一体化」的产品要求相悖(见 docs/REQUIREMENTS.md §7)。
 *
 * 现在的分工:
 *   - **谁起 dev server**:main 进程。renderer 只能说"给我起预览",不能指定命令行 ——
 *     可执行文件路径由 main 从仓库结构自行推导(见 main/game-preview/enginePackage.ts),
 *     renderer 传来的 workdir 只是「从哪里开始往上找仓库」的线索,不是命令。
 *   - **谁触发 addTab**:renderer。main 起好后返回 URL,renderer 走既有的
 *     `openUrlInSidebarBrowser`(web-browser 页签)落地,不新增推送通道。
 *
 * 端口固定 5180(`packages/apollo-engine/vite.config.ts` 的 `strictPort`),这里的
 * 常量与那份配置同形;改端口必须两处同步,否则「起来了但打开的是空页」。
 */

export const GAME_PREVIEW_INVOKE = {
  START: 'game-preview:start',
  STOP: 'game-preview:stop',
  STATUS: 'game-preview:status',
} as const;

/**
 * 引擎 dev server 的固定地址。与 `packages/apollo-engine/vite.config.ts` 的
 * `server.port = 5180` + `strictPort: true` 同源 —— strictPort 保证「端口被占就
 * 报错」而不是静默换口,所以这个地址在服务活着时恒成立。
 */
export const GAME_PREVIEW_DEV_PORT = 5180;
export const GAME_PREVIEW_DEV_URL = `http://localhost:${GAME_PREVIEW_DEV_PORT}/`;

/**
 * - `spawned`:本次由 Cindy main 拉起的子进程(退出应用时一并回收);
 * - `external`:端口上已经有人在服务(用户自己 `pnpm dev:engine` 或上一次会话
 *   遗留的进程)。**复用而不是抢占** —— strictPort 下抢占只会两败俱伤,
 *   而且用户自己起的服务不该被我们杀掉。
 */
export type GamePreviewOrigin = 'spawned' | 'external';

export interface GamePreviewStatus {
  running: boolean;
  /** running 时必然是 loopback http URL;否则 null。 */
  url: string | null;
  origin: GamePreviewOrigin | null;
}

export const GAME_PREVIEW_STOPPED: GamePreviewStatus = {
  running: false,
  url: null,
  origin: null,
};

/**
 * 预览地址守门:只收本机 loopback 的 http(s),且不接受内嵌凭证。
 *
 * 用途有二:main 解析 Vite stdout 里自报的 "Local:" 地址时校验一次(stdout 是
 * 子进程输出,不能当可信来源直接塞给 webview),renderer 拿到 URL 后再校验一次。
 */
export function isLoopbackHttpUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.username !== '' || parsed.password !== '') return false;
  // URL 会把 IPv6 主机名保留成 `[::1]` 形式;两种写法都放行。
  const host = parsed.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}
