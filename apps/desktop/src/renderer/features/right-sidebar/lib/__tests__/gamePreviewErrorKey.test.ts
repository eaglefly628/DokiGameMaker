import { describe, expect, it } from 'vitest';

import { gamePreviewErrorKey } from '../gamePreviewErrorKey';

describe('gamePreviewErrorKey', () => {
  it('把 PRECONDITION_FAILED 里的 previewCode 映射到各自文案', () => {
    expect(gamePreviewErrorKey(new Error('[PRECONDITION_FAILED] DEPS_MISSING'))).toBe(
      'rightSidebar.gamePreview.errors.depsMissing',
    );
    expect(gamePreviewErrorKey(new Error('[PRECONDITION_FAILED] START_TIMEOUT'))).toBe(
      'rightSidebar.gamePreview.errors.startTimeout',
    );
    expect(gamePreviewErrorKey(new Error('[PRECONDITION_FAILED] OTHER_PROJECT_RUNNING'))).toBe(
      'rightSidebar.gamePreview.errors.otherProjectRunning',
    );
  });

  it('识别 Electron invoke 包装后的错误串', () => {
    expect(
      gamePreviewErrorKey(
        new Error("Error invoking remote method 'game-preview:start': Error: [NOT_FOUND] nope"),
      ),
    ).toBe('rightSidebar.gamePreview.errors.notEngineRepo');
  });

  it('未知 previewCode / 未知错误落到通用文案', () => {
    expect(gamePreviewErrorKey(new Error('[PRECONDITION_FAILED] SOMETHING_NEW'))).toBe(
      'rightSidebar.gamePreview.errors.generic',
    );
    expect(gamePreviewErrorKey(new Error('boom'))).toBe(
      'rightSidebar.gamePreview.errors.generic',
    );
    expect(gamePreviewErrorKey(null)).toBe('rightSidebar.gamePreview.errors.generic');
  });

  it('sender 闸拒绝时给出专门文案', () => {
    expect(gamePreviewErrorKey(new Error('[PERMISSION_DENIED] nope'))).toBe(
      'rightSidebar.gamePreview.errors.permissionDenied',
    );
  });
});
