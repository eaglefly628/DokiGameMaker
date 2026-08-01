// @vitest-environment happy-dom
// 打字机逐字显（收编 VN DialogBox）：mountUI 挂载时把带 data-typewriter 的 Label 逐字揭示；teardown 清定时器。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountUI } from './server.js';
import type { LayoutNode } from './types.js';

describe('UI Components · mountUI 打字机逐字显', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const tree: LayoutNode = {
    type: 'Panel', id: 'box', props: {}, children: [
      { type: 'Label', id: 'line', props: { text: '赤壁', typewriter: 20 } }, // 2 字 · 20ms/字
    ],
  };

  it('挂载后逐字揭示；满后停', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const teardown = mountUI(host, tree);
    const el = (): HTMLElement => host.querySelector('#line') as HTMLElement;

    expect(el().textContent).toBe(''); // 初始清空

    vi.advanceTimersByTime(20);
    expect(el().textContent).toBe('赤');   // 第 1 字

    vi.advanceTimersByTime(20);
    expect(el().textContent).toBe('赤壁');  // 第 2 字（满）

    vi.advanceTimersByTime(100);
    expect(el().textContent).toBe('赤壁');  // 满后不再变（interval 已清）

    teardown();
    host.remove();
  });

  it('teardown 清定时器（之后推进不再改 DOM）', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const teardown = mountUI(host, tree);
    vi.advanceTimersByTime(20); // 揭 1 字
    teardown();                 // 清掉
    // teardown 后 host 已清空；再推进不应抛错/不应有定时器残留
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();
    host.remove();
  });
});
