// 主题级面板底纹 panelTexture 契约测试（REQ-STYLESET apollo-toon 纸纹面）：
// 设了 → 面板背景合成纸纹层（叠在填色之上）；没设 → 面板字节不变（老主题零回归）；bare 面板不吃纹理。

import { describe, it, expect } from 'vitest';
import { renderNode } from './index.js';
import type { LayoutNode, UITheme } from './index.js';
import { apolloToon } from '../apollo-toon-theme.js';

const GRAIN = 'url(data:image/svg+xml,%3Csvg) 0 0 / 40px repeat'; // 探针纹理值（简化·仅验合成路径）
const withGrain: UITheme = { ...apolloToon, panelTexture: GRAIN };
const noGrain: UITheme = { ...apolloToon, panelTexture: undefined };

const panel: LayoutNode = { type: 'Panel', id: 'p', props: {}, children: [] };
const barePanel: LayoutNode = { type: 'Panel', id: 'p', props: { bare: true }, children: [] };

describe('UITheme.panelTexture', () => {
  it('设了 → 非 bare 面板背景合成纸纹层', () => {
    const html = renderNode(panel, withGrain);
    expect(html).toContain(GRAIN);
    // 纸纹在填色之前（叠于填色之上）。
    expect(html.indexOf(GRAIN)).toBeLessThan(html.indexOf(withGrain.bg1));
  });

  it('没设 → 面板不含纹理层（老主题字节不变）', () => {
    const html = renderNode(panel, noGrain);
    expect(html).not.toContain('40px repeat');
    // 与「主题无该字段」渲染完全一致（byte-for-byte）。
    const { panelTexture, ...stripped } = apolloToon;
    void panelTexture;
    expect(renderNode(panel, stripped as UITheme)).toBe(html);
  });

  it('bare 面板不吃 panelTexture（纯布局容器无框无纹）', () => {
    expect(renderNode(barePanel, withGrain)).not.toContain(GRAIN);
  });
});
