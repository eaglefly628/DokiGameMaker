// @vitest-environment happy-dom
// 三项新声明式能力：① rotate/scale 变换 ② anim 具名动画 ③ draggable/dropZone 拖放。
// 全是 LayoutConstraints 上的数据字段（弱模型能填）；手势由 mountUI 解释器接（同 hover/accordion 套路）。
import { describe, it, expect } from 'vitest';
import { renderNode } from './render.js';
import { mountUI } from './server.js';
import type { LayoutNode } from './types.js';

describe('UI Components · 声明式 transform / anim', () => {
  it('rotate + scale → CSS transform', () => {
    const html = renderNode({ type: 'Badge', id: 'b', props: { text: 'x' }, layout: { rotate: 8, scale: 1.1 } });
    expect(html).toContain('transform:rotate(8deg) scale(1.1)');
  });

  it('anim 预设 → animation:apollo-<name>（含时长/延迟）', () => {
    const html = renderNode({ type: 'Card', id: 'c', props: { title: 't' }, layout: { anim: 'dealIn', animMs: 500, animDelay: 120 } });
    expect(html).toContain('animation:apollo-dealIn 500ms 120ms both ease-out');
  });

  it('draggable / dropZone → 元素开标签注入 draggable + data-drag / data-drop（不加包裹层）', () => {
    const drag = renderNode({ type: 'Card', id: 'card1', props: { title: 'c' }, layout: { draggable: true } });
    expect(drag).toMatch(/^<div draggable="true" data-drag="card1"/);
    const zone = renderNode({ type: 'Panel', id: 'bin', props: {}, layout: { dropZone: 'dropHere' }, children: [] });
    expect(zone).toMatch(/^<div data-drop="dropHere"/);
  });

  it('XSS/CSS 注入硬化：恶意 layout 数值/anim 不进 style 串', () => {
    // 弱模型/外部数据运行时塞字符串型恶意值（类型谎称 number/string）
    const bad = renderNode({
      type: 'Badge', id: 'x', props: { text: 'x' },
      layout: ({ x: '0;background:url(http://evil)', width: '99px;position:fixed', anim: 'evil"></style>' } as never),
    });
    expect(bad).not.toContain('evil');            // 恶意片段被挡
    expect(bad).not.toContain('url(');
    expect(bad).toContain('left:0px');            // 非法数值降级为 0
    expect(bad).not.toContain('animation:apollo-evil'); // 非白名单 anim 不渲染
  });
});

describe('UI Components · mountUI 拖放（HTML5 DnD·引擎内建）', () => {
  const tree: LayoutNode = {
    type: 'Panel', id: 'root', props: {}, layout: { direction: 'row' },
    children: [
      { type: 'Card', id: 'cardA', props: { title: 'A' }, layout: { draggable: true } },
      { type: 'Panel', id: 'bin', props: { title: '弃牌区' }, layout: { dropZone: 'discard' }, children: [] },
    ],
  };

  it('拖 cardA → drop 到弃牌区 → 调 discard(被拖节点 id)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let got: string | undefined;
    const teardown = mountUI(host, tree, { discard: (a) => { got = a; } });

    const card = host.querySelector('[data-drag="cardA"]') as HTMLElement;
    const bin = host.querySelector('[data-drop="discard"]') as HTMLElement;
    card.dispatchEvent(new Event('dragstart', { bubbles: true }));
    bin.dispatchEvent(new Event('drop', { bubbles: true }));
    expect(got).toBe('cardA');

    teardown();
    host.remove();
  });

  it('mountUI 注入动画关键帧（document 级·一次）', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const teardown = mountUI(host, { type: 'Label', id: 'l', props: { text: 'x' } });
    expect(document.getElementById('apollo-ui-keyframes')).toBeTruthy();
    teardown();
    host.remove();
  });
});
