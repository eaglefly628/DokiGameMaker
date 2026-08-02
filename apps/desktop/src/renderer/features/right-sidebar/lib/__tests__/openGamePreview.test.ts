// @vitest-environment jsdom

/**
 * openGamePreview —— 「运行游戏预览」renderer 半边的三条判据:
 *  - 先 IPC 起服务、再开页签(次序不能反,否则会打开一个必然白屏的地址);
 *  - main 回来的地址仍要过 loopback 守门(纵深防御);
 *  - 桥不在 / 服务没起来时抛错,由上层出 toast,不静默吞。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../openInSidebarBrowser', () => ({
  openUrlInSidebarBrowser: vi.fn(async () => undefined),
}));

import { openUrlInSidebarBrowser } from '../openInSidebarBrowser';
import { GamePreviewUnavailableError, openGamePreviewInSidebar } from '../openGamePreview';

const start = vi.fn();

function installBridge(present = true): void {
  (window as unknown as { electronAPI?: unknown }).electronAPI = present
    ? { gamePreview: { start, stop: vi.fn(), status: vi.fn() } }
    : {};
}

describe('openGamePreviewInSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installBridge();
  });

  it('起好 dev server 后在右侧栏打开返回的地址', async () => {
    start.mockResolvedValue({ running: true, url: 'http://localhost:5180/', origin: 'spawned' });

    const url = await openGamePreviewInSidebar('s1', '/repo/packages/apollo-engine');

    expect(start).toHaveBeenCalledWith({ workdir: '/repo/packages/apollo-engine' });
    expect(openUrlInSidebarBrowser).toHaveBeenCalledWith('s1', 'http://localhost:5180/');
    expect(url).toBe('http://localhost:5180/');
  });

  it('复用外部已在跑的服务同样能落地', async () => {
    start.mockResolvedValue({ running: true, url: 'http://127.0.0.1:5180/', origin: 'external' });

    await openGamePreviewInSidebar('s1', '/repo');

    expect(openUrlInSidebarBrowser).toHaveBeenCalledWith('s1', 'http://127.0.0.1:5180/');
  });

  it('地址不是 loopback 时拒绝打开 —— 不把意外的远程地址塞进 webview', async () => {
    start.mockResolvedValue({ running: true, url: 'https://evil.example.com/', origin: 'spawned' });

    await expect(openGamePreviewInSidebar('s1', '/repo')).rejects.toBeInstanceOf(
      GamePreviewUnavailableError,
    );
    expect(openUrlInSidebarBrowser).not.toHaveBeenCalled();
  });

  it('main 说没跑起来时不开页签', async () => {
    start.mockResolvedValue({ running: false, url: null, origin: null });

    await expect(openGamePreviewInSidebar('s1', '/repo')).rejects.toBeInstanceOf(
      GamePreviewUnavailableError,
    );
    expect(openUrlInSidebarBrowser).not.toHaveBeenCalled();
  });

  it('IPC 抛错原样透出,交给上层按错误码出文案', async () => {
    start.mockRejectedValue(new Error('[PRECONDITION_FAILED] DEPS_MISSING'));

    await expect(openGamePreviewInSidebar('s1', '/repo')).rejects.toThrow('DEPS_MISSING');
    expect(openUrlInSidebarBrowser).not.toHaveBeenCalled();
  });

  it('preload 桥缺席(测试 / 未就绪)时抛错而不是 crash', async () => {
    installBridge(false);

    await expect(openGamePreviewInSidebar('s1', '/repo')).rejects.toBeInstanceOf(
      GamePreviewUnavailableError,
    );
  });
});
