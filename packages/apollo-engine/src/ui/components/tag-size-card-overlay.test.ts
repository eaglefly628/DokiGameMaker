// PG 牌组/大厅保真批（2026-06-27 · Lead 评审）：
//  ① REQ-UI-G货币pill：Tag 无 children 逃生、Label 无药丸 chrome → pill 缩放是真缺口 → 接受 Tag.size（本测验收）。
//  ② REQ-UI-G大Boss卡（buff 详情/行高/字 1.3x）：回驳-已覆盖 → Card.children + Label.size + 列间距 即得（本测证明）。
//  ③ REQ-UI-G牌面位置/选中标/hover：回驳-已覆盖 → Panel(relative)+x/y 叠层 + visibleWhen「选」+ Tooltip.bubble（本测证明）。
// 回驳必须附「等价数据写法 + 证明测试」（CLAUDE.md CORE RULE §3）——下面三块就是那份证明。
import { describe, it, expect } from 'vitest';
import { renderNode, validateLayoutNode, catalogSpec } from './index.js';
import type { LayoutNode } from './index.js';

describe('① Tag.size（真缺口·接受）', () => {
  const tag = (size?: 'sm' | 'md' | 'lg'): string =>
    renderNode({ type: 'Tag', id: 't', props: { label: '💎 1280', tone: 'accent', ...(size ? { size } : {}) } });

  it('lg=大气药丸（字 16px·padding 7×15·≈2x 体量）', () => {
    const h = tag('lg');
    expect(h).toContain('font-size:16px');
    expect(h).toContain('padding:7px 15px');
  });
  it('md=原默认（字 11px·向后兼容·缺省即 md）', () => {
    expect(tag('md')).toContain('font-size:11px');
    expect(tag()).toContain('font-size:11px');          // 不填 size → 仍是老样子
    expect(tag('md')).toContain('padding:3px 10px');
  });
  it('sm=紧凑（字 10px）', () => {
    expect(tag('sm')).toContain('font-size:10px');
  });
  it('lg 比 md 比 sm 严格递增（真有档差·不是摆设）', () => {
    const fs = (s: 'sm' | 'md' | 'lg'): number => Number(/font-size:(\d+)px/.exec(tag(s))![1]);
    expect(fs('lg')).toBeGreaterThan(fs('md'));
    expect(fs('md')).toBeGreaterThan(fs('sm'));
  });
  it('catalog 自描述 + 校验器都认这档（弱模型可见·枚举受控）', () => {
    const sizeSpec = catalogSpec('Tag')!.props.find((p) => p.name === 'size');
    expect(sizeSpec?.values).toEqual(['sm', 'md', 'lg']);
    expect(validateLayoutNode({ type: 'Tag', id: 't', props: { label: 'x', size: 'lg' } })).toEqual([]);
    // 乱填枚举要被校验器抓（受控合成·非自由字符串）
    const bad = validateLayoutNode({ type: 'Tag', id: 't', props: { label: 'x', size: 'huge' } } as unknown as LayoutNode);
    expect(bad.length).toBeGreaterThan(0);
  });
});

describe('② 大 Boss 地煞卡 = Card.children + Label.size（回驳「Card 无 size 档」的证明）', () => {
  // 等价数据写法：用 children 覆盖默认排版 → 自带卡壳(边框/底/tone/可点/corner) + 自排大字 buff 行（Label 全套 size 体系）。
  const bossCard: LayoutNode = {
    type: 'Card', id: 'boss', props: { tone: 'accent', corner: 'BOSS', action: 'inspectBoss', actionArg: 'sangmen' },
    children: [
      { type: 'Label', id: 'boss-name', props: { text: '地煞·丧门', size: 'xl', glow: true } },        // 标题 22px(≈1.3x×默认)
      { type: 'Panel', id: 'boss-buffs', props: { bare: true }, layout: { direction: 'column', gap: 6 }, children: [  // gap=行高/行距
        { type: 'Label', id: 'buff1', props: { text: '⚔ 全队攻击 +30%', size: 'lg' } },
        { type: 'Label', id: 'buff2', props: { text: '🛡 受到伤害 -20%', size: 'lg' } },
        { type: 'Label', id: 'buff3', props: { text: '☠ 每回合流血 5%', size: 'lg' } },
      ] },
    ],
  };
  it('合法（过校验器·整卡是数据）', () => {
    expect(validateLayoutNode(bossCard)).toEqual([]);
  });
  it('真出 buff 详情 + 大字 1.3x + 行距（无需 Card.size）', () => {
    const h = renderNode(bossCard);
    expect(h).toContain('font-size:22px');     // Label xl=22（默认 13 的 ≈1.3x 还有富余）
    expect(h).toContain('全队攻击 +30%');
    expect(h).toContain('受到伤害 -20%');
    expect(h).toContain('gap:6px');            // 列间距 = buff 行的「行高高」
  });
});

describe('③ 牌组扑克牌面 = Panel(relative)+x/y 叠层 + visibleWhen + Tooltip（回驳牌面位置/选中标/hover 的证明）', () => {
  const W = 64, H = 90; // PlayingCard md 牌面尺寸 → 叠层按它算角位
  const pokerCard: LayoutNode = {
    type: 'Tooltip', id: 'pc-tip', props: {                                 // hover→悬浮简介（Tooltip.bubble 富气泡）
      bubble: { type: 'Panel', id: 'pc-bub', props: { bare: true }, layout: { direction: 'column', gap: 4 }, children: [
        { type: 'Label', id: 'pc-bn', props: { text: '天罡·武曲', size: 'md', glow: true } },
        { type: 'Label', id: 'pc-bd', props: { text: '出战时全队战力 +5%，克金系。', size: 'sm' } },
      ] },
    },
    children: [
      { type: 'Panel', id: 'pc-wrap', props: { bare: true }, layout: { width: W, height: H }, children: [  // relative 锚框（render.ts:196）
        { type: 'PlayingCard', id: 'pc-face', props: { rank: 'A', suit: '♠', art: '/heroes/wuqu.png', selected: true, action: 'pickCard', actionArg: 'wuqu' } },
        { type: 'Tag',   id: 'pc-cost', props: { label: '3', size: 'sm', tone: 'accent' }, layout: { x: W - 22, y: 4 } },  // 耗费 右下→右上
        { type: 'Label', id: 'pc-pow',  props: { text: '1280', size: 'sm', glow: true },   layout: { x: 22, y: 4 } },       // 战力 中下→中上
        { type: 'Label', id: 'pc-sel',  props: { text: '选' }, visibleWhen: 'cardPicked',   layout: { x: 24, y: 38 } },      // 选中→中央「选」字
      ] },
    ],
  };
  it('合法（过校验器·含 visibleWhen 条件节点·叠层 x/y）', () => {
    expect(validateLayoutNode(pokerCard)).toEqual([]);
  });
  it('叠层落成绝对定位 + 角位正确（cost 右上 / power 中上 / 选 居中）', () => {
    const h = renderNode(pokerCard);
    expect(h).toContain('position:absolute');
    expect(h).toContain(`left:${W - 22}px`); // 耗费在右上角（x=W-22=42）
    expect(h).toContain('top:4px');
    expect(h).toContain('>3<');               // 耗费数
    expect(h).toContain('1280');              // 战力
    expect(h).toContain('选');                // 选中标（renderNode 恒渲·真显隐由 mount 时 isVisible(visibleWhen) 决定）
  });
  it('hover 悬浮简介 = Tooltip 富气泡（无需 PlayingCard 新增 hover 槽）', () => {
    const h = renderNode(pokerCard);
    expect(h).toContain('data-tooltip-bubble');
    expect(h).toContain('天罡·武曲');
    expect(h).toContain('全队战力 +5%');
  });
  it('「选」节点带 visibleWhen（条件显隐是数据·非代码 if）', () => {
    const wrap = pokerCard.children![0];
    const sel = wrap.children!.find((c) => c.id === 'pc-sel')!;
    expect(sel.visibleWhen).toBe('cardPicked');
  });
});
