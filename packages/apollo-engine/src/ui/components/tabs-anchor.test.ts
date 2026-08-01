// REQ-UI-Tabs每页签锚点（PG 同步·2026-06-26）：tabs[i].anchor → 对应 nav 按钮渲 data-anchor，
// OnboardingOverlay 可 spotlight 到「具体页签按钮」（之前 layout.anchor 只能加在整个 Tabs 节点上）。
import { describe, it, expect } from 'vitest';
import { renderNode } from './index.js';

describe('UI Components · Tabs 每页签锚点（tab.anchor → data-anchor）', () => {
  it('带 anchor 的页签 nav 按钮渲 data-anchor；无 anchor 的不渲', () => {
    const html = renderNode({ type: 'Tabs', id: 't', props: { tabs: [
      { id: 'deck', label: '我的牌组', anchor: 'nav-deck' },
      { id: 'home', label: '大厅' },
    ], active: 'home' }, children: [
      { type: 'Label', id: 'p1', props: { text: 'A' } },
      { type: 'Label', id: 'p2', props: { text: 'B' } },
    ] });
    expect(html).toMatch(/data-tab="deck"[^>]*data-anchor="nav-deck"/); // 牌组页签带锚点
    expect(html).not.toMatch(/data-tab="home"[^>]*data-anchor/);        // 大厅页签无锚点（不回归）
  });

  it('anchor 与 action 并存（页签既发切页信号又可被引导）', () => {
    const html = renderNode({ type: 'Tabs', id: 't', props: { action: 'nav', tabs: [
      { id: 'home', label: '大厅', anchor: 'nav-home' },
    ] }, children: [{ type: 'Label', id: 'p', props: { text: 'A' } }] });
    expect(html).toContain('data-action="nav"'); expect(html).toContain('data-arg="home"');
    expect(html).toContain('data-anchor="nav-home"');
  });
});
