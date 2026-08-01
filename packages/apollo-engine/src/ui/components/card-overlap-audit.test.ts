// @vitest-environment happy-dom
// REQ game-a A-007（PUI 域）：纸牌类基座两件——
//  (a) layout.allowOverlap → 渲染 data-allow-overlap（扇形手牌/牌堆意图叠层·ui-audit 重叠豁免）；
//  (b) PlayingCard 根挂 data-audit-skip-contrast（牌面红黑花色=定色语义·ui-audit 免对比检查）。
import { describe, it, expect } from 'vitest';
import { renderNode } from './index.js';
import type { LayoutNode } from './types.js';

describe('A-007a · 意图叠层 layout.allowOverlap', () => {
  it('allowOverlap:true → 元素带 data-allow-overlap（绝对定位叠放豁免）', () => {
    const n: LayoutNode = { id: 'c1', type: 'PlayingCard', props: { rank: 'A', suit: '♠', face: 'light' }, layout: { x: 40, y: 10, rotate: -12, allowOverlap: true } };
    const html = renderNode(n);
    expect(html).toContain('data-allow-overlap');
    expect(html).toContain('position:absolute'); // 确是绝对定位件（叠层才有意义）
  });
  it('不填 → 无 data-allow-overlap（零回归·默认仍受重叠检查约束）', () => {
    const n: LayoutNode = { id: 'c2', type: 'PlayingCard', props: { rank: 'K', suit: '♥', face: 'light' }, layout: { x: 0, y: 0 } };
    expect(renderNode(n)).not.toContain('data-allow-overlap');
  });
  it('任意组件通用（Panel 牌堆容器也可标）', () => {
    const n: LayoutNode = { id: 'pile', type: 'Panel', props: {}, layout: { x: 5, y: 5, allowOverlap: true } };
    expect(renderNode(n)).toContain('data-allow-overlap');
  });
});

describe('A-007b · PlayingCard 定色原语免对比', () => {
  it('牌面渲染根带 data-audit-skip-contrast', () => {
    const n: LayoutNode = { id: 'pc', type: 'PlayingCard', props: { rank: 'Q', suit: '♦', face: 'light' } };
    expect(renderNode(n)).toContain('data-audit-skip-contrast');
  });
  it('翻面卡（flipped + backFace）根也带标记', () => {
    const n: LayoutNode = { id: 'pcf', type: 'PlayingCard', props: { rank: 'J', suit: '♣', flipped: false, backFace: { id: 'bf', type: 'Label', props: { text: '背' } } } };
    expect(renderNode(n)).toContain('data-audit-skip-contrast');
  });
  it('非 PlayingCard 文字不带该标记（不误免其它组件对比）', () => {
    const n: LayoutNode = { id: 'l', type: 'Label', props: { text: '普通文字' } };
    expect(renderNode(n)).not.toContain('data-audit-skip-contrast');
  });
});
