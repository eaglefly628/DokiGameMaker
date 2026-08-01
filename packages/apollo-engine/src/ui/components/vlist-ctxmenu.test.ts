// @vitest-environment happy-dom
// VirtualList 滚动重渲窗口 + ContextMenu 右键弹/合（引擎内建运行时）。
import { describe, it, expect } from 'vitest';
import { mountUI } from './server.js';
import type { LayoutNode } from './types.js';

describe('UI Components · mountUI VirtualList 虚拟滚动', () => {
  const rows = Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, cells: { name: `第 ${i} 行` } }));
  const tree: LayoutNode = {
    type: 'VirtualList', id: 'vl',
    props: { rows, rowHeight: 20, height: 100, columns: [{ key: 'name', label: '名' }] },
  };

  it('滚动 → 只渲新位置附近的窗口行（不渲全部）', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const teardown = mountUI(host, tree);

    const el = host.querySelector('[data-vlist]') as HTMLElement;
    const spacer = host.querySelector('[data-vlist-spacer]') as HTMLElement;

    expect(spacer.textContent).toContain('第 0 行');       // 初始窗口在顶
    expect(spacer.textContent).not.toContain('第 98 行');

    el.scrollTop = 2000;                                    // 滚到 ~第 100 行
    el.dispatchEvent(new Event('scroll', { bubbles: true }));

    expect(spacer.textContent).toContain('第 98 行');       // 新窗口
    expect(spacer.textContent).not.toContain('第 0 行');    // 顶部行已不在 DOM（虚拟化）
    expect(host.querySelectorAll('[data-vlist-row]').length).toBeLessThan(20); // 仍只一窗口

    teardown();
    host.remove();
  });
});

describe('UI Components · mountUI ContextMenu 右键菜单', () => {
  const tree: LayoutNode = {
    type: 'ContextMenu', id: 'cm',
    props: { items: [{ id: 'del', label: '删除', action: 'doDelete' }] },
    children: [{ type: 'Label', id: 'trg', props: { text: '右键我' } }],
  };

  it('右键触发元素 → 光标处弹菜单；点项发 action 并合；点外合', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let deleted: string | undefined;
    const teardown = mountUI(host, tree, { doDelete: (arg) => { deleted = arg; } });

    const trigger = host.querySelector('#trg') as HTMLElement;
    const pop = host.querySelector('[data-ctxmenu-pop]') as HTMLElement;
    const item = host.querySelector('[data-ctxmenu-item]') as HTMLElement;

    expect(pop.style.display).toBe('none');

    trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 60 }));
    expect(pop.style.display).toBe('block');  // 弹出
    expect(pop.style.left).toBe('50px');      // 光标处
    expect(pop.style.top).toBe('60px');

    item.dispatchEvent(new Event('click', { bubbles: true }));
    expect(deleted).toBe('del');              // 项 action 发了(arg=item.id)
    expect(pop.style.display).toBe('none');   // 点后合

    teardown();
    host.remove();
  });
});
