// REQ-UI-fontPixel令牌（PI 同步·2026-06-27）：默认主题(SHELL)/ZeroCraft 基座补 fontPixel 令牌，
// 让 Label.font:'pixel' 真生效，不再静默 fallback 成 sans-serif fontUi（像素字体槽形同虚设的洞）。
import { describe, it, expect } from 'vitest';
import { renderNode } from './index.js';
import { SHELL } from '../shell-theme.js';
import { apolloOnyx } from './apollo-kit.js';

describe('REQ-UI-fontPixel令牌 · 默认主题像素字体槽生效', () => {
  it('font:pixel 用 SHELL.fontPixel（含 Silkscreen·非 sans-serif fontUi）', () => {
    const html = renderNode({ type: 'Label', id: 'l', props: { text: 'NOW', font: 'pixel' } }); // 缺省 SHELL
    expect(html).toContain('Silkscreen');
    expect(html).not.toContain(SHELL.fontUi); // 不再 fallback 成 UI 字体
  });
  it('SHELL + apolloOnyx 都有 fontPixel 令牌（基座主题不留死槽）', () => {
    expect(SHELL.fontPixel).toContain('Silkscreen');
    expect(apolloOnyx.fontPixel).toContain('Silkscreen');
  });
});
