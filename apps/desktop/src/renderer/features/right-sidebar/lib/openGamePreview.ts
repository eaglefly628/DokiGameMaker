/**
 * openGamePreview —— 「运行游戏预览」的 renderer 侧动作。
 *
 * 一体化要求(docs/REQUIREMENTS.md §7):游戏跑在 ZeroCraft 右侧栏,不另开浏览器。
 * 这里就是那条链的 renderer 半边:
 *
 *   1. 请 main 起 ZeroCraft 引擎的 dev server(端口上已经有服务就复用,见
 *      main/game-preview/devServer.ts);
 *   2. 拿回 URL,再校验一次是 loopback http —— main 已经守过一次,这里是纵深防御,
 *      别把一个意外的远程地址塞进 webview;
 *   3. 走既有的 `openUrlInSidebarBrowser` 落地成 web-browser 页签(它内部处理
 *      attached / detached 路由与"把侧栏叫出来")。
 *
 * 与应用内其它"在侧边栏打开链接"的入口一致:**每次都是新页签**,不做去重 ——
 * 侧栏页签是用户自己的空间,由用户决定留几个。
 *
 * 错误一律抛出,由调用方(RightSidebarShell)按 IPC 错误码出 toast 文案;本模块
 * 不碰 i18n,也不吞错。
 */

import { isLoopbackHttpUrl } from '../../../../shared/gamePreviewIpc';
import { openUrlInSidebarBrowser } from './openInSidebarBrowser';

/** main 起不来 / 返回了不可信地址时抛这个;调用方按 IPC 错误码兜底文案。 */
export class GamePreviewUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GamePreviewUnavailableError';
  }
}

/**
 * 起引擎预览并在右侧栏打开。
 *
 * @param sessionId 落点会话(页签挂在这个 session 的桶里)。
 * @param workdir   当前会话工作目录 —— 只作为 main「从哪里往上找仓库」的线索,
 *                  不是命令,也不决定要执行什么(见 shared/gamePreviewIpc.ts)。
 */
export async function openGamePreviewInSidebar(
  sessionId: string,
  workdir: string,
): Promise<string> {
  const api = window.electronAPI?.gamePreview;
  if (!api) throw new GamePreviewUnavailableError('game preview bridge is unavailable');
  const status = await api.start({ workdir });
  const url = status?.url;
  if (!status?.running || typeof url !== 'string' || !isLoopbackHttpUrl(url)) {
    throw new GamePreviewUnavailableError('game preview server returned an unusable address');
  }
  await openUrlInSidebarBrowser(sessionId, url);
  return url;
}
