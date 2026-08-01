// @vitest-environment happy-dom
// Accordion 折叠切换（引擎内建）：点标题行 → 就地 toggle 折叠体 display + 箭头旋转（不重建）。
// 把"点标题开合"这类 UX 一次做进 mountUI，所有游戏只填 title/open/children。
import { describe, it, expect } from 'vitest';
import { mountUI } from './server.js';
import type { LayoutNode } from './types.js';

describe('UI Components · mountUI Accordion 折叠切换', () => {
  const tree: LayoutNode = {
    type: 'Accordion', id: 'ac', props: { title: '高级设置', action: 'toggled' },
    children: [{ type: 'Label', id: 'inner', props: { text: '折叠内容' } }],
  };

  it('点标题 → 开合 toggle + 箭头旋转；action 信号一并触发', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let toggles = 0;
    const teardown = mountUI(host, tree, { toggled: () => { toggles++; } });

    const head = host.querySelector('[data-accordion-head]') as HTMLElement;
    const body = host.querySelector('[data-accordion-body]') as HTMLElement;
    const caret = host.querySelector('[data-accordion-caret]') as HTMLElement;

    expect(body.style.display).toBe('none'); // 初始收起

    head.dispatchEvent(new Event('click', { bubbles: true }));
    expect(body.style.display).toBe('block');      // 展开
    expect(caret.style.transform).toContain('90'); // 箭头转 90°
    expect(toggles).toBe(1);                       // action 信号也发了

    head.dispatchEvent(new Event('click', { bubbles: true }));
    expect(body.style.display).toBe('none');       // 再点收起
    expect(toggles).toBe(2);

    teardown();
    host.remove();
  });
});
