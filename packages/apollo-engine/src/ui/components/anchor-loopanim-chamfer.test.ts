// @vitest-environment happy-dom
// 预探 game-g 原生 UI 缺口下沉（owner 2026-06-26：照原版逐项补 LayoutNode 缺口）：
//   · anchor   —— 新手引导锚点（→ data-anchor）：已有的 OnboardingOverlay/Coachmark 引擎现在能定位「数据 UI」元素。
//   · 循环动效 —— float/glow/pulse（infinite）：原版浮动对决卡 / 发光掷键 / gacha 脉冲。入场预设是一次性，这些是持续。
//   · chamfer  —— 倒角切角（clip-path）：原版 CTA/卡/面板的扑克 art-deco 切角，之前只有 hero 键有。
import { describe, it, expect } from 'vitest';
import { renderNode, mountUI } from './index.js';
import type { LayoutNode } from './index.js';

describe('LayoutConstraints · anchor 新手引导锚点（数据 UI 可被 spotlight）', () => {
  it('layout.anchor → 元素开标签注入 data-anchor', () => {
    expect(renderNode({ type: 'Button', id: 'b', props: { label: '出征' }, layout: { anchor: 'play_btn' } })).toContain('data-anchor="play_btn"');
  });
  it('Panel/容器也能锚（容器级引导）', () => {
    expect(renderNode({ type: 'Panel', id: 'p', props: {}, layout: { anchor: 'deck_panel' }, children: [] })).toContain('data-anchor="deck_panel"');
  });
  it('无 anchor → 不加（不回归）', () => {
    expect(renderNode({ type: 'Button', id: 'b', props: { label: 'x' } })).not.toContain('data-anchor');
  });
  it('anchor + draggable 并存（注入两者·与拖放同一出口）', () => {
    const html = renderNode({ type: 'Card', id: 'c', props: { title: 'x' }, layout: { anchor: 'a', draggable: true } });
    expect(html).toContain('data-anchor="a"'); expect(html).toContain('data-drag="c"');
  });
});

describe('LayoutConstraints · chamfer 倒角切角（clip-path·扑克 art-deco）', () => {
  it('chamfer:13 → clip-path 八边形切 13px', () => {
    const html = renderNode({ type: 'Panel', id: 'p', props: {}, layout: { chamfer: 13 }, children: [] });
    expect(html).toContain('clip-path:polygon(13px 0,100% 0,100% calc(100% - 13px),calc(100% - 13px) 100%,0 100%,0 13px)');
  });
  it('非法 chamfer 值降级为 0（防注入·过 num）', () => {
    const html = renderNode({ type: 'Panel', id: 'p', props: {}, layout: ({ chamfer: '9;background:url(evil)' } as never), children: [] });
    expect(html).not.toContain('evil');
    expect(html).toContain('clip-path:polygon(0px 0');
  });
});

describe('LayoutConstraints · 循环环境动效（float/glow/pulse·infinite）', () => {
  it('anim:float → apollo-float … ease-in-out infinite（持续浮动）', () => {
    expect(renderNode({ type: 'Card', id: 'c', props: { title: 'A♠' }, layout: { anim: 'float' } })).toMatch(/animation:apollo-float \d+ms ease-in-out infinite/);
  });
  it('anim:glow / pulse → infinite', () => {
    expect(renderNode({ type: 'Button', id: 'b', props: { label: '掷' }, layout: { anim: 'glow' } })).toContain('apollo-glow');
    expect(renderNode({ type: 'Button', id: 'b', props: { label: '掷' }, layout: { anim: 'glow' } })).toContain('infinite');
    expect(renderNode({ type: 'Card', id: 'c', props: { title: 'x' }, layout: { anim: 'pulse' } })).toContain('infinite');
  });
  it('入场预设仍一次性（both ease-out·不回归成 infinite）', () => {
    const html = renderNode({ type: 'Card', id: 'c', props: { title: 'x' }, layout: { anim: 'dealIn' } });
    expect(html).toContain('both ease-out'); expect(html).not.toContain('infinite');
  });
  it('非白名单 anim 仍被拒（不渲染 animation）', () => {
    expect(renderNode({ type: 'Card', id: 'c', props: { title: 'x' }, layout: ({ anim: 'evil' } as never) })).not.toContain('animation:apollo-evil');
  });
  it('mountUI 注入了 float/glow/pulse 关键帧', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const teardown = mountUI(host, { type: 'Card', id: 'c', props: { title: 'A♠' }, layout: { anim: 'float' } } as LayoutNode);
    const kf = document.getElementById('apollo-ui-keyframes')?.textContent ?? '';
    expect(kf).toContain('apollo-float'); expect(kf).toContain('apollo-glow'); expect(kf).toContain('apollo-pulse');
    teardown(); host.remove();
  });
});
