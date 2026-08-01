// @vitest-environment happy-dom
// Tooltip 悬浮显隐（引擎内建·内联样式表达不了 :hover）：mouseover 触发元素 → 气泡显；移出 → 隐。
// 移到同一触发元素内部（child ↔ 气泡）不隐藏。所有游戏只填 content/placement，hover 逻辑引擎一次做完。
import { describe, it, expect } from 'vitest';
import { mountUI } from './server.js';
import type { LayoutNode } from './types.js';

describe('UI Components · mountUI Tooltip 悬浮显隐', () => {
  const tree: LayoutNode = {
    type: 'Tooltip', id: 'tip', props: { content: '提示文本' },
    children: [{ type: 'Badge', id: 'trg', props: { text: '?' } }],
  };

  it('mouseover 触发元素 → 气泡显；移出 → 隐', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const teardown = mountUI(host, tree);

    const trigger = host.querySelector('[data-tooltip]') as HTMLElement;
    const bubble = host.querySelector('[data-tooltip-bubble]') as HTMLElement;
    const child = host.querySelector('#trg') as HTMLElement;

    expect(bubble.style.display).toBe('none'); // 初始隐藏

    child.dispatchEvent(new Event('mouseover', { bubbles: true }));
    expect(bubble.style.display).toBe('block'); // hover → 显

    // 移出到 host 外部（relatedTarget 不在 trigger 内）→ 隐
    const out = new MouseEvent('mouseout', { bubbles: true });
    Object.defineProperty(out, 'relatedTarget', { value: document.body });
    child.dispatchEvent(out);
    expect(bubble.style.display).toBe('none');

    teardown();
    host.remove();
  });

  it('在触发元素内部移动（child → 气泡）不隐藏', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const teardown = mountUI(host, tree);

    const trigger = host.querySelector('[data-tooltip]') as HTMLElement;
    const bubble = host.querySelector('[data-tooltip-bubble]') as HTMLElement;
    const child = host.querySelector('#trg') as HTMLElement;

    child.dispatchEvent(new Event('mouseover', { bubbles: true }));
    expect(bubble.style.display).toBe('block');

    // 从 child 移到气泡（仍在 trigger 内）→ 不隐
    const move = new MouseEvent('mouseout', { bubbles: true });
    Object.defineProperty(move, 'relatedTarget', { value: bubble });
    child.dispatchEvent(move);
    expect(bubble.style.display).toBe('block');

    teardown();
    host.remove();
  });
});
