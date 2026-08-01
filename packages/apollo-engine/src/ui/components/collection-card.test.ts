// @vitest-environment happy-dom
// REQ-UI-G收藏卡（PG 同步·2026-06-26）：game-g 收藏页对齐原版流式卡墙撞到的 2 缺口下沉。
//   ① PlayingCard flipOnHover + backFace —— 悬停翻面露英雄列传（原版 .pcard-wrap:hover scaleX 翻）。
//   ② 固定列数 grid cols:N + PlayingCard fluid —— 原版 repeat(6,1fr)+卡 width:100%·aspect 5/7，消卡间空隙。
import { describe, it, expect } from 'vitest';
import { renderNode, mountUI } from './index.js';
import type { LayoutNode } from './index.js';

describe('UI Components · ② 固定列数 grid cols + PlayingCard fluid（消卡间空隙）', () => {
  it('Panel grid cols:6 → repeat(6,1fr)（覆盖 auto-fill）', () => {
    const html = renderNode({ type: 'Panel', id: 'g', props: {}, layout: { direction: 'grid', cols: 6, gap: 14 }, children: [] });
    expect(html).toContain('grid-template-columns:repeat(6,1fr)');
    expect(html).not.toContain('auto-fill');
  });
  it('无 cols → 仍 auto-fill(minmax)（不回归）', () => {
    const html = renderNode({ type: 'Panel', id: 'g', props: {}, layout: { direction: 'grid', minCol: 120 }, children: [] });
    expect(html).toContain('repeat(auto-fill,minmax(120px,1fr))');
  });
  it('PlayingCard fluid → width:100% + aspect-ratio 5/7（充满父格·替代固定档）', () => {
    const html = renderNode({ type: 'PlayingCard', id: 'c', props: { rank: 'A', suit: '♠', fluid: true } });
    expect(html).toContain('width:100%'); expect(html).toContain('aspect-ratio:5/7');
    expect(html).not.toContain('width:64px'); // 不再固定 md 档宽
  });
  it('PlayingCard 非 fluid → 仍固定档宽（不回归）', () => {
    expect(renderNode({ type: 'PlayingCard', id: 'c', props: { rank: 'A', suit: '♠', size: 'md' } })).toContain('width:64px');
  });
});

describe('UI Components · ① PlayingCard 悬停翻面（flipOnHover + backFace）', () => {
  const hero: LayoutNode = { type: 'Panel', id: 'bk', props: { bare: true }, layout: { direction: 'column', gap: 3 }, children: [
    { type: 'Label', id: 'n', props: { text: '关羽', color: 'gold', bold: true } },
    { type: 'Label', id: 'd', props: { text: '蜀 · 五虎上将', color: 'sub', size: 'xs' } },
  ] };

  it('flipOnHover + backFace → 出 data-flipcard + front(牌面) + back(信息子树)', () => {
    const html = renderNode({ type: 'PlayingCard', id: 'pc', props: { rank: 'K', suit: '♥', flipOnHover: true, backFace: hero, action: 'view', actionArg: 'guanyu' } });
    expect(html).toContain('data-flipcard');
    expect(html).toContain('data-flip-front'); expect(html).toContain('data-flip-back');
    expect(html).toContain('K');              // 正面牌面点数
    expect(html).toContain('关羽'); expect(html).toContain('蜀 · 五虎上将'); // 背面信息子树
    expect(html).toContain('data-action="view"'); expect(html).toContain('data-arg="guanyu"'); // 整卡仍可点
  });
  it('无 flipOnHover/backFace → 普通静态卡（不回归·无 flip 结构）', () => {
    const html = renderNode({ type: 'PlayingCard', id: 'pc', props: { rank: 'A', suit: '♠' } });
    expect(html).not.toContain('data-flipcard'); expect(html).not.toContain('data-flip-back');
  });
  it('mountUI 注入了 flip 悬停规则（CSS·front↔back 真 3D rotateY 翻面·带 perspective）', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const teardown = mountUI(host, { type: 'PlayingCard', id: 'pc', props: { rank: 'K', suit: '♥', flipOnHover: true, backFace: hero } } as LayoutNode);
    const kf = document.getElementById('apollo-ui-keyframes')?.textContent ?? '';
    expect(kf).toContain('[data-flipcard]:hover [data-flip-front]');
    expect(kf).toContain('perspective:1000px'); // 真 3D：容器透视
    expect(kf).toContain('rotateY(-180deg)'); expect(kf).toContain('rotateY(0deg)'); // 绕 Y 轴真翻（非 scaleX 假压扁）
    expect(kf).toContain('backface-visibility:hidden'); // 背面隐藏
    teardown(); host.remove();
  });
});
