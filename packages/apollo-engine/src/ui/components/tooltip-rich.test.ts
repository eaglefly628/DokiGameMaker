// 富 Tooltip 气泡（owner 2026-06-26）：bubble=LayoutNode 子树（标题/效果/数值行）→ 富词条浮窗，
// 收编 game-g 原版地煞/天罡/装备的 <h4>+rows 富 tooltip。无 bubble 则退回简单单行文本气泡（向后兼容）。
import { describe, it, expect } from 'vitest';
import { renderNode } from './index.js';
import type { LayoutNode } from './index.js';

describe('UI Components · Tooltip 富气泡（bubble=LayoutNode）', () => {
  it('bubble 富内容渲进气泡（标题 + 效果行）；宽气泡可换行', () => {
    const tree: LayoutNode = {
      type: 'Tooltip', id: 'tip', props: { placement: 'left', bubble: {
        type: 'Panel', id: 'tb', props: { bare: true }, layout: { direction: 'column', gap: 4 }, children: [
          { type: 'Label', id: 't', props: { text: '锋矢阵', color: 'gold', bold: true } },
          { type: 'Label', id: 'e', props: { text: '攻击 +120 · 暴击 +15%', color: 'sub' } },
        ],
      } },
      children: [{ type: 'Badge', id: 'b', props: { text: '?' } }],
    };
    const html = renderNode(tree);
    expect(html).toContain('data-tooltip-bubble');
    expect(html).toContain('锋矢阵'); expect(html).toContain('攻击 +120 · 暴击 +15%'); // 富内容进气泡
    expect(html).toMatch(/data-tooltip-bubble[^>]*display:none/);  // 缺省隐藏（mountUI hover 显）
    expect(html).toMatch(/<div data-tooltip-bubble[^>]*width:240px/); // 富气泡=宽 div（非简单单行 span·可换行）
    expect(html).toContain('right:calc(100% + 6px)');              // placement=left
    expect(html).toContain('>?<');                                 // 触发元素仍在
  });

  it('富气泡支持 spans 多段着色（词条高亮）', () => {
    const html = renderNode({
      type: 'Tooltip', id: 'tip', props: { bubble: {
        type: 'Label', id: 'l', props: { spans: [{ text: '天罡 ', color: 'gold', bold: true }, { text: '破·可克', color: 'jade' }] },
      } }, children: [{ type: 'Label', id: 'x', props: { text: '?' } }],
    });
    expect(html).toContain('天罡'); expect(html).toContain('破·可克');
  });

  it('无 bubble → 退回简单文本气泡（不回归·单行 nowrap）', () => {
    const html = renderNode({ type: 'Tooltip', id: 'tip', props: { content: '简单提示' }, children: [{ type: 'Badge', id: 'b', props: { text: '?' } }] });
    expect(html).toContain('简单提示'); expect(html).toContain('white-space:nowrap');
  });
});
