// @vitest-environment happy-dom
// REQ-UI-Label字阶裸数字（owner 2026-06-28「字阶难道不该所有档都有吗·从8到24甚至更大」）：
//   具名档(xs..xxxl)是 curated 模数阶梯·保和谐；但复刻像素稿需要原版自由 px(12/14/15/17..)。
//   解法：Label.size 兼收 具名令牌 | 裸 px 数字。数字直用、令牌查表；具名档不回归；validator 数字放行、令牌拼写仍拦。
import { describe, it, expect } from 'vitest';
import { renderNode } from './index.js';
import { validateLayoutNode } from './validate.js';

describe('Label.size 裸 px 数字（复刻精确字号）', () => {
  it('数字直用：原版缺的 12 / 14 / 15 / 17 / 20 都能精确出', () => {
    for (const px of [8, 12, 14, 15, 17, 20, 26, 48]) {
      expect(renderNode({ type: 'Label', id: 'l', props: { text: 'x', size: px } })).toContain(`font-size:${px}px`);
    }
  });
  it('具名档不回归（sm=11 / md=13 / xxxl=34 仍查表）', () => {
    expect(renderNode({ type: 'Label', id: 'l', props: { text: 'x', size: 'sm' } })).toContain('font-size:11px');
    expect(renderNode({ type: 'Label', id: 'l', props: { text: 'x', size: 'md' } })).toContain('font-size:13px');
    expect(renderNode({ type: 'Label', id: 'l', props: { text: 'x', size: 'xxxl' } })).toContain('font-size:34px');
    expect(renderNode({ type: 'Label', id: 'l', props: { text: 'x' } })).toContain('font-size:13px'); // 缺省 md
  });
  it('validator：裸数字放行（不报 bad-enum）', () => {
    const is = validateLayoutNode({ type: 'Label', id: 'l', props: { text: 'x', size: 14 as never } });
    expect(is.some((i) => i.kind === 'bad-enum')).toBe(false);
  });
  it('validator：令牌拼写错仍拦（size=mdd → bad-enum）', () => {
    const is = validateLayoutNode({ type: 'Label', id: 'l', props: { text: 'x', size: 'mdd' as never } });
    expect(is.some((i) => i.kind === 'bad-enum' && i.detail.includes('size'))).toBe(true);
  });
});
