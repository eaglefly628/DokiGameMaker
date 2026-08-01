// @vitest-environment happy-dom
// 批32「图标统一风格升级」四个图文位（owner 07-15「game g 很多图标我都要统一风格升级」）：
// Button.icon / Tag.icon / Label spans[].img / Card.media URL 检测——emoji 记号可整套换成美术图标；
// 全部 additive：不填 = 输出与从前逐字节一致（零回归·golden 不动）。
import { describe, it, expect } from 'vitest';
import { renderNode } from './index.js';

describe('图标位 · Button.icon / Tag.icon（键/pill 首部内联图标）', () => {
  it('Button.icon → label 前 1em 内联图；无 icon 不回归', () => {
    const html = renderNode({ type: 'Button', id: 'b', props: { label: '出征', icon: '/i/battle.png' } });
    expect(html).toContain('src="/i/battle.png"');
    expect(html.indexOf('battle.png')).toBeLessThan(html.indexOf('出征'));
    expect(renderNode({ type: 'Button', id: 'b', props: { label: '出征' } })).not.toContain('<img');
  });
  it('hero 键 icon 进大字行；与 skin 皮并存', () => {
    const html = renderNode({ type: 'Button', id: 'h', props: { label: '出征', kind: 'hero', icon: '/i/b.png', skin: '/s.png' } });
    expect(html).toContain('src="/i/b.png"'); expect(html).toContain("url('/s.png')");
  });
  it('Tag.icon → label 前内联图（货币/生肖 pill）；无 icon 不回归', () => {
    const html = renderNode({ type: 'Tag', id: 't', props: { label: '128', icon: '/i/coin.png', size: 'lg' } });
    expect(html).toContain('src="/i/coin.png"');
    expect(renderNode({ type: 'Tag', id: 't', props: { label: '🪙 128' } })).not.toContain('<img');
  });
});

describe('图标位 · Panel.titleIcon / Tabs.tab.icon（REQ-UI-标题图标槽·PST game-g 全覆盖余口）', () => {
  it('Panel.titleIcon → 标题前 1.05em 内联图；无 titleIcon 不回归', () => {
    const html = renderNode({ type: 'Panel', id: 'p', props: { title: '地支牌', titleIcon: '/i/dizhi.png' } });
    expect(html).toContain('src="/i/dizhi.png"');
    expect(html.indexOf('dizhi.png')).toBeLessThan(html.indexOf('地支牌'));
    expect(renderNode({ type: 'Panel', id: 'p2', props: { title: '地支牌' } })).not.toContain('<img');
  });
  it('Tabs.tab.icon → 页签文字前内联图（active/非 active 都渲）；无 icon 不回归', () => {
    const html = renderNode({ type: 'Tabs', id: 't', props: { tabs: [{ id: 'a', label: '改造坊', icon: '/i/craft.png' }, { id: 'b', label: '收藏' }], active: 'b' }, children: [
      { type: 'Label', id: 'ta', props: { text: 'A' } }, { type: 'Label', id: 'tb', props: { text: 'B' } },
    ] });
    expect(html).toContain('src="/i/craft.png"'); // 非 active 页签也带图
    const plain = renderNode({ type: 'Tabs', id: 't2', props: { tabs: [{ id: 'a', label: '甲' }], active: 'a' }, children: [{ type: 'Label', id: 't2a', props: { text: 'A' } }] });
    expect(plain).not.toContain('<img');
  });
});

describe('图标位 · Label spans[].img / Card.media URL', () => {
  it('span.img → 段首 1em 内联图（有文字带右距·纯图段无右距）；无 img 段不回归', () => {
    const html = renderNode({ type: 'Label', id: 'l', props: { spans: [{ text: '128', img: '/i/coin.png' }, { text: ' 金币' }] } });
    expect(html).toContain('src="/i/coin.png"'); expect(html).toContain('margin-right:4px');
    const pure = renderNode({ type: 'Label', id: 'l2', props: { spans: [{ text: '', img: '/i/coin.png' }] } });
    expect(pure).toContain('src="/i/coin.png"'); expect(pure).not.toContain('margin-right:4px');
    expect(renderNode({ type: 'Label', id: 'l3', props: { spans: [{ text: '🪙 128' }] } })).not.toContain('<img');
  });
  it('Card.media：URL（/·http·data:）按图渲·字形/emoji 照旧（零回归）', () => {
    const img = renderNode({ type: 'Card', id: 'c', props: { media: '/i/diamond.png', title: '60' } });
    expect(img).toContain('src="/i/diamond.png"');
    const glyph = renderNode({ type: 'Card', id: 'c2', props: { media: '💎', title: '60' } });
    expect(glyph).toContain('💎'); expect(glyph).not.toContain('<img');
  });
});
