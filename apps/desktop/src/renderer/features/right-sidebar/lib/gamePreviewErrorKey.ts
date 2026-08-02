/**
 * 游戏预览失败 → 本地化文案 key。
 *
 * main 侧只回稳定错误码,不回可读文案(错误里不带绝对路径 / 堆栈,见
 * docs/dev-rules/electron-security-and-process-boundaries.md §5)。具体是哪种失败
 * 由 `PRECONDITION_FAILED` 的 message 承载 —— 那里放的是
 * `GamePreviewErrorCode`(main/game-preview/devServer.ts 的枚举),不是自由文本。
 */

import { extractIpcError } from '@/utils/ipcError';

const PREVIEW_CODE_KEYS: Record<string, string> = {
  DEPS_MISSING: 'rightSidebar.gamePreview.errors.depsMissing',
  START_FAILED: 'rightSidebar.gamePreview.errors.startFailed',
  START_TIMEOUT: 'rightSidebar.gamePreview.errors.startTimeout',
  OTHER_PROJECT_RUNNING: 'rightSidebar.gamePreview.errors.otherProjectRunning',
};

export function gamePreviewErrorKey(error: unknown): string {
  const ipcError = extractIpcError(error);
  switch (ipcError?.code) {
    case 'NOT_FOUND':
      return 'rightSidebar.gamePreview.errors.notEngineRepo';
    case 'PERMISSION_DENIED':
      return 'rightSidebar.gamePreview.errors.permissionDenied';
    case 'PRECONDITION_FAILED':
      return PREVIEW_CODE_KEYS[ipcError.message.trim()] ?? 'rightSidebar.gamePreview.errors.generic';
    default:
      return 'rightSidebar.gamePreview.errors.generic';
  }
}
