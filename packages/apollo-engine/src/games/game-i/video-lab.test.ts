// 爱诗视频样例：视图纯数据（含 Video 控件）+ 端口生成流程（NullAishePort → ready 句柄）。
import { describe, it, expect } from 'vitest';
import { renderNode } from '@ui/components/index.js';
import { buildVideoLab, INITIAL_AISHE, SAMPLE_PROMPT, POSTER_URI } from './video-lab.js';
import { NullAishePort } from '@services/aigp/index.js';
import { SHELL } from '@ui/shell-theme.js';
import type { LayoutNode } from '@ui/components/index.js';

describe('Game I · 爱诗视频样例', () => {
  it('视图纯数据·含 Video 控件 + 生成按钮', () => {
    const tree: LayoutNode = buildVideoLab(INITIAL_AISHE);
    const ids: string[] = [];
    const walk = (n: LayoutNode): void => { ids.push(n.id); (n.children ?? []).forEach(walk); };
    walk(tree);
    expect(ids).toContain('vl-video');
    expect(ids).toContain('vl-gen');
    const html = renderNode(tree, SHELL);
    expect(html).toContain('<video');           // Video 控件出 <video>
    expect(html).toContain('data-action="aisheGen"'); // 生成按钮发信号
  });

  it('占位海报是自包含 data-URI（不发网络）', () => {
    expect(POSTER_URI.startsWith('data:image/svg+xml,')).toBe(true);
  });

  it('NullAishePort：generate(提示词) → ready 占位句柄（回显提示词）', async () => {
    const port = new NullAishePort();
    const h = await port.generate(SAMPLE_PROMPT, { aspect: '9:16' });
    expect(h.status).toBe('ready');
    expect(h.prompt).toBe(SAMPLE_PROMPT);
    expect(h.url).toBeTruthy();
  });

  it('就绪态视图把句柄 url 接到 Video.src', () => {
    const tree = buildVideoLab({ handle: { id: 'a1', status: 'ready', prompt: 'p', url: 'about:aishe#1' }, generating: false });
    const html = renderNode(tree, SHELL);
    expect(html).toContain('src="about:aishe#1"');
  });
});
