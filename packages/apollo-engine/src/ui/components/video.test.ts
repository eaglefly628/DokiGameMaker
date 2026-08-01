// Video 控件：数据驱动 <video>（爱诗 AIGP 短视频等）。src/poster esc·controls 缺省开·autoplay 补 muted。
import { describe, it, expect } from 'vitest';
import { renderNode } from './render.js';
import { SHELL } from '../shell-theme.js';
import type { LayoutNode } from './types.js';

describe('UI Components · Video 控件', () => {
  it('出 <video>·带 src/poster/controls', () => {
    const node: LayoutNode = { type: 'Video', id: 'v', props: { src: 'https://x/a.mp4', poster: 'p.png' } };
    const html = renderNode(node, SHELL);
    expect(html).toMatch(/^<video id="v"/);
    expect(html).toContain('src="https://x/a.mp4"');
    expect(html).toContain('poster="p.png"');
    expect(html).toContain(' controls');
  });
  it('autoplay 自动补 muted（浏览器自动播放策略）', () => {
    const html = renderNode({ type: 'Video', id: 'v', props: { autoplay: true } }, SHELL);
    expect(html).toContain('autoplay muted');
  });
  it('controls:false → 不带 controls', () => {
    const html = renderNode({ type: 'Video', id: 'v', props: { controls: false } }, SHELL);
    expect(html).not.toContain(' controls');
  });
  it('src 转义防属性注入', () => {
    const html = renderNode({ type: 'Video', id: 'v', props: { src: '"></video><script>x' } }, SHELL);
    expect(html).not.toContain('<script>');
  });
});
