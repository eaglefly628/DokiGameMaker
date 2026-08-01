// @vitest-environment happy-dom
// Combobox 搜索下拉（引擎内建）：focus 开面板、input 过滤项、点项回填+发 action、点外合。
import { describe, it, expect } from 'vitest';
import { mountUI } from './server.js';
import type { LayoutNode } from './types.js';

describe('UI Components · mountUI Combobox 搜索下拉', () => {
  const tree: LayoutNode = {
    type: 'Combobox', id: 'cb',
    props: { options: [{ value: 'gx', label: '关羽' }, { value: 'zf', label: '张飞' }, { value: 'zy', label: '赵云' }], action: 'pick' },
  };

  it('focus 开面板 → input 过滤 → 点项回填 + 发 action + 合面板', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let picked: string | undefined;
    const teardown = mountUI(host, tree, { pick: (v) => { picked = v; } });

    const input = host.querySelector('[data-combo-search]') as HTMLInputElement;
    const panel = host.querySelector('[data-combo-panel]') as HTMLElement;
    const opts = (): HTMLElement[] => Array.from(host.querySelectorAll('[data-combo-opt]'));

    expect(panel.style.display).toBe('none'); // 初始隐

    input.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(panel.style.display).toBe('block'); // focus 开

    // 过滤「赵」→ 只剩赵云
    input.value = '赵';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const visible = opts().filter((o) => o.style.display !== 'none');
    expect(visible.length).toBe(1);
    expect(visible[0]?.dataset['comboOpt']).toBe('zy');

    // 点关羽项 → 回填 + 发 action + 合
    const guanyu = opts().find((o) => o.dataset['comboOpt'] === 'gx') as HTMLElement;
    guanyu.dispatchEvent(new Event('click', { bubbles: true }));
    expect(picked).toBe('gx');
    expect(input.value).toBe('关羽');
    expect(panel.style.display).toBe('none');

    teardown();
    host.remove();
  });

  it('点面板外 → 合面板', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const teardown = mountUI(host, tree, {});
    // outside 必须在 mountUI 之后挂（mountUI 会 host.innerHTML= 重置内容）；放进 host 内才能冒泡到监听器。
    const outside = document.createElement('button');
    host.appendChild(outside);

    const input = host.querySelector('[data-combo-search]') as HTMLInputElement;
    const panel = host.querySelector('[data-combo-panel]') as HTMLElement;
    input.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(panel.style.display).toBe('block');

    outside.dispatchEvent(new Event('click', { bubbles: true }));
    expect(panel.style.display).toBe('none'); // 点外合

    teardown();
    host.remove();
  });
});
