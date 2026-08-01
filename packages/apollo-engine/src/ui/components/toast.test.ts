// @vitest-environment happy-dom
// showToast —— 飘字提示挂载器 API：挂到 host 底部堆叠容器、duration 后自动移除；可手动提前关。
// 把"弹个提示、过会自己消失"这类 UX 一次做进引擎，所有游戏只调 showToast(host, text, {tone})。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showToast } from './server.js';

describe('UI Components · showToast 定时飘字', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('挂出 toast → duration 后自动移除 + 容器收尾', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    showToast(host, '保存成功', { tone: 'ok', duration: 2000 });
    const stack = host.querySelector('[data-toast-stack]') as HTMLElement;
    expect(stack).toBeTruthy();
    expect(stack.childElementCount).toBe(1);
    expect(host.textContent).toContain('保存成功');

    vi.advanceTimersByTime(1999);
    expect(host.querySelector('[data-toast-stack]')?.childElementCount).toBe(1); // 未到点·还在

    vi.advanceTimersByTime(1);
    expect(host.querySelector('[data-toast-stack]')).toBeNull(); // 到点·toast 移除 + 空容器收尾

    host.remove();
  });

  it('多个 toast 堆叠；手动关闭函数提前移除', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    showToast(host, 'A');
    const closeB = showToast(host, 'B');
    expect((host.querySelector('[data-toast-stack]') as HTMLElement).childElementCount).toBe(2);

    closeB(); // 手动关 B
    const stack = host.querySelector('[data-toast-stack]') as HTMLElement;
    expect(stack.childElementCount).toBe(1);
    expect(stack.textContent).toContain('A');
    expect(stack.textContent).not.toContain('B');

    closeB(); // 重复关无副作用（done 守卫）
    expect((host.querySelector('[data-toast-stack]') as HTMLElement).childElementCount).toBe(1);

    host.remove();
  });
});
