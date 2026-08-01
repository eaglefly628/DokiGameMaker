// @vitest-environment happy-dom
// LayoutNode 缺口补齐验收（owner 2026-06-25「有 LayoutNode 缺口的提主程·要求和原版一样的 UI 效果」）：
// G1 PlayingCard face:'light'（经典白扑克牌·对决卡）/ G2 Button kind:'hero'（金色倒角 sheen 大 CTA）/ G3 Panel bg+vignette（绿呢牌桌）。
import { describe, it, expect } from 'vitest';
import { renderNode } from './index.js';

describe('LayoutNode 缺口补齐 · 保真原版 UI', () => {
  it('G1 PlayingCard face=light：白牌底 + 红黑对比（♥红 ♠黑）', () => {
    const red = renderNode({ type: 'PlayingCard', id: 'r', props: { rank: 'A', suit: '♥', face: 'light' } });
    const blk = renderNode({ type: 'PlayingCard', id: 'b', props: { rank: 'A', suit: '♠', face: 'light' } });
    expect(red).toContain('#fefdfb');   // 白牌底渐变
    expect(red).toContain('#c0392b');   // ♥ 经典红
    expect(blk).toContain('#1a1a1a');   // ♠ 经典黑
  });
  it('G1 默认 dark 面不受影响（无白底）', () => {
    const dark = renderNode({ type: 'PlayingCard', id: 'd', props: { rank: 'K', suit: '♦' } });
    expect(dark).not.toContain('#fefdfb');
  });
  it('G2 Button kind=hero：金色倒角(clip-path) + sheen 流光(apollo-sheen) + 副标', () => {
    const html = renderNode({ type: 'Button', id: 'cta', props: { label: '⚔ 出征 · 第 3 关', kind: 'hero', sub: '挑战 曹操 · 难度 ★★', action: 'play' } });
    expect(html).toContain('clip-path:polygon'); // 倒角
    expect(html).toContain('apollo-sheen');       // 流光动画
    expect(html).toContain('出征'); expect(html).toContain('挑战 曹操 · 难度 ★★');
    expect(html).toContain('data-action="play"');
  });
  it('G2 hero 不影响 primary/ghost（仍走原样式·无 clip-path）', () => {
    const prim = renderNode({ type: 'Button', id: 'p', props: { label: 'x', kind: 'primary' } });
    expect(prim).not.toContain('clip-path');
  });
  it('G3 Panel bg 令牌（绿呢牌桌 var(--felt)）+ vignette 暗角叠层', () => {
    const felt = renderNode({ type: 'Panel', id: 'felt', props: { bg: 'var(--felt)', vignette: true }, children: [] });
    expect(felt).toContain('background:var(--felt)'); // 自定义底
    expect(felt).toContain('radial-gradient(120% 100% at 50% 30%'); // vignette 暗角
  });
  it('G3 Panel 无 bg 时仍用主题底（不回归）', () => {
    const plain = renderNode({ type: 'Panel', id: 'pl', props: { title: 'x' }, children: [] });
    expect(plain).not.toContain('var(--felt)');
  });

  it('G4 LayoutConstraints maxWidth：响应式封顶 + 自动外边距块居中（整页居中 chrome）', () => {
    const html = renderNode({ type: 'Panel', id: 'chrome', props: {}, layout: { maxWidth: 1340 }, children: [] });
    expect(html).toContain('max-width:1340px');   // 上限封顶
    expect(html).toContain('margin-left:auto');    // 块居中
    expect(html).toContain('margin-right:auto');
    expect(html).toContain('width:100%');          // 无显式宽 → 填满到上限
  });
  it('G4 maxWidth 有显式 width 则不强加 width:100%（尊重显式宽）', () => {
    const html = renderNode({ type: 'Panel', id: 'c', props: {}, layout: { maxWidth: 800, width: 400 }, children: [] });
    expect(html).toContain('max-width:800px'); expect(html).toContain('width:400px');
    expect(html).not.toContain('width:100%');
  });
  it('G4 无 maxWidth 不受影响（不回归）', () => {
    const html = renderNode({ type: 'Panel', id: 'n', props: {}, children: [] });
    expect(html).not.toContain('max-width');
    expect(html).not.toContain('margin-left:auto');
  });

  it('G5 PlayingCard art：正面居中显立绘(img·替代中央大花色)；角标点数仍在', () => {
    const html = renderNode({ type: 'PlayingCard', id: 'pc', props: { rank: 'K', suit: '♠', art: '/heroes/guanyu.svg', label: '关羽' } });
    expect(html).toContain('src="/heroes/guanyu.svg"'); // 立绘
    expect(html).toContain('object-fit:contain');
    expect(html).toContain('K');                          // 角标点数仍在
    expect(html).toContain('关羽');
  });
  it('G5 无 art 时回中央大花色(不渲 img·不回归)', () => {
    const html = renderNode({ type: 'PlayingCard', id: 'p2', props: { rank: 'A', suit: '♥' } });
    expect(html).not.toContain('<img');
  });
  it('G5 背面 + art：牌背不露立绘（仅正面显 art）', () => {
    const html = renderNode({ type: 'PlayingCard', id: 'bk', props: { rank: 'A', suit: '♠', faceUp: false, art: '/x.svg' } });
    expect(html).not.toContain('<img'); // 背面不显立绘
  });

  it('G6 layout.justify：主轴分布映射 CSS（消顶部堆叠/底部留白·竖向铺满）', () => {
    const between = renderNode({ type: 'Panel', id: 'b', props: { bare: true }, layout: { direction: 'column', justify: 'between' }, children: [] });
    expect(between).toContain('justify-content:space-between');
    const center = renderNode({ type: 'Panel', id: 'c', props: { bare: true }, layout: { justify: 'center' }, children: [] });
    expect(center).toContain('justify-content:center');
    const around = renderNode({ type: 'Panel', id: 'a', props: { bare: true }, layout: { justify: 'around' }, children: [] });
    expect(around).toContain('justify-content:space-around');
  });
  it('G6 无 justify 不受影响（不回归）', () => {
    const plain = renderNode({ type: 'Panel', id: 'n', props: { bare: true }, children: [] });
    expect(plain).not.toContain('justify-content');
  });
});
