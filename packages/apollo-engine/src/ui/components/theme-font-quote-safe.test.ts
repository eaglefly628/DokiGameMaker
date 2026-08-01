// REQ-UI-BUG-style属性引号截断（主程 2026-07-01·PI 报·⚠️严重：吞 Tabs 页签 color→黑字不可读 + Label glow/tracking/pre-line）：
// 根因=主题字体栈含**双引号**字体名，拼进 `style="…font-family:…,"Segoe UI"…"` → 浏览器在第一个 `"` 处提前闭合 style 属性、
// 其后属性全丢。修法=字体名一律**单引号**（在 style="" 双引号属性里合法·不闭合）。本测守「字体栈不含双引号」这条不变量·防复发。
import { describe, it, expect } from 'vitest';
import { renderNode } from './render.js';
import { SHELL } from '../shell-theme.js';
import type { LayoutNode, UITheme } from './types.js';

describe('UI Components · #1 主题字体栈引号安全（防 style 属性提前闭合）', () => {
  it('SHELL 各字体槽不含双引号（双引号会截断 style=""）', () => {
    const th = SHELL as UITheme;
    for (const f of [th.fontUi, th.fontMono, th.fontDisplay, th.fontPixel, th.fontSerif]) {
      expect(String(f ?? '')).not.toContain('"');
    }
  });

  it('渲染出的 style 里字体名用单引号·不再是会截断的双引号', () => {
    const html = renderNode({ type: 'Label', id: 'l', props: { text: '字', tracking: 3, glow: true, color: 'gold' } } as LayoutNode, SHELL);
    expect(html).toContain("'Segoe UI'");     // 单引号字体名（安全）
    expect(html).not.toContain('"Segoe UI"'); // 不再是提前闭合 style 的双引号
    expect(html).toContain('letter-spacing:3px'); // font-family 之后的属性仍在（不被截断）
  });

  it('Tabs 页签 color 在 font-family 之后仍有效（回归 PI 实测的黑字不可读）', () => {
    const html = renderNode({
      type: 'Tabs', id: 't',
      props: { tabs: [{ id: 'a', label: '综合' }, { id: 'b', label: '战斗' }] },
      children: [{ type: 'Label', id: 'p1', props: { text: 'x' } }, { type: 'Label', id: 'p2', props: { text: 'y' } }],
    } as LayoutNode, SHELL);
    expect(html).not.toContain('"Segoe UI"'); // 页签样式里的字体栈不含截断双引号 → 其后的 color 存活
  });
});
