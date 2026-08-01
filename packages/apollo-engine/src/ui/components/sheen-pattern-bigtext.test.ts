// @vitest-environment happy-dom
// REQ-UI-Label大号字 + REQ-UI-G流光底纹（PG 同步·2026-06-26）：主页比例/质感对齐原版撞到的缺口。
//   · Label.size xxl(28)/xxxl(34) —— 原版 felt 标题 34px 超 xl(22) 上限。
//   · layout.sheen —— 通用流光（原 hero 键内置 sheen 通用化·CSS 注入 ::after）。
//   · Panel.pattern stripe/checker + PlayingCard.backPattern —— 程序化纹理质感。
import { describe, it, expect } from 'vitest';
import { renderNode, mountUI } from './index.js';
import type { LayoutNode } from './index.js';

describe('REQ-UI-Label大号字 · Label 大号档', () => {
  it('size xxl=28 / xxxl=34（大标题）', () => {
    expect(renderNode({ type: 'Label', id: 'l', props: { text: '命运牌桌', size: 'xxl' } })).toContain('font-size:28px');
    expect(renderNode({ type: 'Label', id: 'l', props: { text: '命运牌桌', size: 'xxxl' } })).toContain('font-size:34px');
  });
  it('旧档不回归（xl 仍 22）', () => {
    expect(renderNode({ type: 'Label', id: 'l', props: { text: 'x', size: 'xl' } })).toContain('font-size:22px');
  });
});

describe('REQ-UI-G流光底纹 · 通用 sheen / Panel pattern / PlayingCard backPattern', () => {
  it('① layout.sheen → 元素出 data-sheen + mountUI 注入 ::after 流光规则', () => {
    const html = renderNode({ type: 'Button', id: 'b', props: { label: '刷新', kind: 'primary' }, layout: { sheen: true } });
    expect(html).toContain('data-sheen');
    const host = document.createElement('div'); document.body.appendChild(host);
    const teardown = mountUI(host, { type: 'Button', id: 'b', props: { label: '刷新' }, layout: { sheen: true } } as LayoutNode);
    const kf = document.getElementById('apollo-ui-keyframes')?.textContent ?? '';
    expect(kf).toContain('[data-sheen]::after'); expect(kf).toContain('apollo-sheen-sweep');
    expect(kf).toContain('[data-fx~="sheen-hover"]:hover::after'); // 悬停触发流光变体（REQ-FX-SHEEN-HOVER）
    teardown(); host.remove();
  });
  it('① 无 sheen → 不加 data-sheen（不回归）', () => {
    expect(renderNode({ type: 'Button', id: 'b', props: { label: 'x' } })).not.toContain('data-sheen');
  });
  it('③ Panel.pattern stripe → 45°斜条纹叠层；checker → 棋盘格', () => {
    const stripe = renderNode({ type: 'Panel', id: 'p', props: { pattern: 'stripe' }, children: [] });
    expect(stripe).toContain('repeating-linear-gradient(45deg');
    const checker = renderNode({ type: 'Panel', id: 'p', props: { pattern: 'checker' }, children: [] });
    expect(checker).toContain('repeating-conic-gradient');
  });
  it('③ 无 pattern → 不叠（不回归）', () => {
    expect(renderNode({ type: 'Panel', id: 'p', props: {}, children: [] })).not.toContain('repeating-linear-gradient(45deg');
  });
  it('② PlayingCard.backPattern：牌背(faceUp:false)叠纹理；正面不叠', () => {
    const back = renderNode({ type: 'PlayingCard', id: 'c', props: { rank: 'A', suit: '♥', faceUp: false, backPattern: 'checker' } });
    expect(back).toContain('repeating-conic-gradient');
    const front = renderNode({ type: 'PlayingCard', id: 'c', props: { rank: 'A', suit: '♥', faceUp: true, backPattern: 'checker' } });
    expect(front).not.toContain('repeating-conic-gradient'); // 正面不叠牌背纹理
  });
});
