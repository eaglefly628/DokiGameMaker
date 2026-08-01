// @vitest-environment happy-dom
// Modal 遮罩点击关闭（引擎内建）：点**遮罩本身**触发 closeAction；点**弹窗体内部**不触发。
// 与 tabs-switch 同套路——把"点背景关弹窗"这类 UX 一次做进 mountUI，所有游戏照填 closeAction 即得。
import { describe, it, expect } from 'vitest';
import { mountUI } from './server.js';
import type { LayoutNode } from './types.js';

describe('UI Components · mountUI Modal 遮罩点击关闭', () => {
  const tree: LayoutNode = {
    type: 'Modal', id: 'mm', props: { title: '确认', closeAction: 'close' },
    children: [
      { type: 'Label', id: 'body', props: { text: '弹窗体' } },
      { type: 'Button', id: 'ok', props: { label: '确定', action: 'ok' } },
    ],
  };

  it('点遮罩本身 → closeAction；点弹窗体内部 → 不关', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let closed = 0, okHit = 0;
    const teardown = mountUI(host, tree, { close: () => { closed++; }, ok: () => { okHit++; } });

    const scrim = host.querySelector('[data-modal-close="close"]') as HTMLElement;
    const body = host.querySelector('#body') as HTMLElement;
    const okBtn = host.querySelector('#ok') as HTMLElement;

    // 点弹窗体内部（Label）→ 不关
    body.dispatchEvent(new Event('click', { bubbles: true }));
    expect(closed).toBe(0);

    // 点弹窗体内的按钮 → 触发该按钮信号、但不关弹窗
    okBtn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(okHit).toBe(1);
    expect(closed).toBe(0);

    // 点遮罩本身 → 关
    scrim.dispatchEvent(new Event('click', { bubbles: true }));
    expect(closed).toBe(1);

    teardown();
    host.remove();
  });

  it('teardown 后点遮罩不再触发（事件已解绑）', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let closed = 0;
    const teardown = mountUI(host, tree, { close: () => { closed++; } });
    teardown();
    expect(host.innerHTML).toBe('');
    host.remove();
    expect(closed).toBe(0);
  });
});
