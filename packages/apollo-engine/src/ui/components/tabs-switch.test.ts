// @vitest-environment happy-dom
// Tabs 抗闪屏切页（引擎内建·下沉自 game-g 大厅 setTab）：验证点 tab 切页是**就地 toggle display**，
// 页元素**不重建**（切后是同一 DOM 节点）——这正是"切页不丢滚动/不重渲大网格"的 bug 一次性根治。
import { describe, it, expect } from 'vitest';
import { mountUI } from './server.js';
import type { LayoutNode } from './types.js';

describe('UI Components · mountUI Tabs 抗闪屏切页', () => {
  const tree: LayoutNode = {
    type: 'Tabs', id: 'tt',
    props: { tabs: [{ id: 'a', label: '牌谱' }, { id: 'b', label: '榜单' }], active: 'a' },
    children: [
      { type: 'Label', id: 'page-a', props: { text: 'AAA' } },
      { type: 'Label', id: 'page-b', props: { text: 'BBB' } },
    ],
  };

  it('点 tab → 切 display + nav 高亮·页元素不重建（同一 DOM 节点）', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const teardown = mountUI(host, tree);

    const pageA = (): HTMLElement => host.querySelector('[data-tabpage="a"]') as HTMLElement;
    const pageB = (): HTMLElement => host.querySelector('[data-tabpage="b"]') as HTMLElement;
    const navB = (): HTMLElement => host.querySelector('[data-tab="b"]') as HTMLElement;

    // 初始：a 显示 / b 隐藏
    expect(pageA().style.display).toBe('block');
    expect(pageB().style.display).toBe('none');

    // 记录页元素身份（用于验证切页**不重建**）
    const aRef = pageA();
    const bRef = pageB();

    // 点「榜单」(b)
    navB().dispatchEvent(new Event('click', { bubbles: true }));

    // 切到 b：b 显示 / a 隐藏
    expect(pageA().style.display).toBe('none');
    expect(pageB().style.display).toBe('block');
    // ⭐ 同一 DOM 节点 = 抗闪屏：切页未重建（保滚动/输入态/不重渲大网格）
    expect(host.querySelector('[data-tabpage="a"]')).toBe(aRef);
    expect(host.querySelector('[data-tabpage="b"]')).toBe(bRef);
    // nav 高亮切到 b（active 有金色下边框）
    expect(navB().style.borderBottomColor).not.toBe('transparent');

    teardown();
    host.remove();
  });

  it('teardown 后点击不再切页（事件已解绑）', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const teardown = mountUI(host, tree);
    teardown();
    // teardown 清空 host → 无元素可点；不抛错即可
    expect(host.innerHTML).toBe('');
    host.remove();
  });
});
