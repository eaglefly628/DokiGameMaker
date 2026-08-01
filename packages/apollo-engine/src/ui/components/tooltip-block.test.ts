// PG 回执（2026-06-27）：把 Tooltip 包到 grid 卡墙的卡上 → 触发元素是 inline-flex span，作 grid item 不随 1fr
// 拉伸 → 卡塌陷/重叠。修：Tooltip.block → 触发元素 display:block + width:100%，能作 grid/flex item 撑满不塌。
import { describe, it, expect } from 'vitest';
import { renderNode } from './index.js';
import type { LayoutNode } from './index.js';

const tip = (block?: boolean): string => renderNode({
  type: 'Tooltip', id: 'tt', props: { content: '简介', ...(block ? { block: true } : {}) },
  children: [{ type: 'PlayingCard', id: 'c', props: { rank: 'A', suit: '♠', fluid: true } }],
} as LayoutNode);

describe('Tooltip.block（grid 卡墙里包牌不塌陷）', () => {
  // 只看触发元素（最外层 span）的 style，别被内部 fluid 卡自带的 inline-flex 干扰。
  const wrapStyle = (h: string): string => /data-tooltip[^>]*tabindex="0" style="([^"]*)"/.exec(h)![1]!;
  it('block:true → 触发元素 display:block + width:100%（能作 1fr grid item 撑满）', () => {
    const s = wrapStyle(tip(true));
    expect(s).toContain('display:block');
    expect(s).toContain('width:100%');
    expect(s).not.toContain('inline-flex');
  });
  it('缺省 → 触发元素仍 inline-flex（向后兼容·非 grid 场景不变）', () => {
    expect(wrapStyle(tip())).toContain('display:inline-flex');
  });
  it('两档都仍是合法悬浮触发（data-tooltip + 富气泡 fluid 卡在内）', () => {
    expect(tip(true)).toContain('data-tooltip');
    expect(tip(true)).toContain('aspect-ratio:5/7'); // fluid PlayingCard 在触发元素内、未被吞掉
  });
});
