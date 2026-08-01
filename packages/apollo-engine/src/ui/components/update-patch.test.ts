// @vitest-environment happy-dom
// mountUI().update —— 局部更新（diff/patch）：只替换真变了的子树，其余 DOM 原样保留。
// 标准 UI 做法；替代整树 innerHTML 重挂（后者丢 Tab/滚动/native 输入态 + 触发合成层陈旧重绘）。
import { describe, it, expect } from 'vitest';
import { mountUI } from './server.js';
import { SHELL } from '../shell-theme.js';
import type { LayoutNode } from './types.js';

const tree = (label: string, n: number): LayoutNode => ({
  type: 'Panel', id: 'root', props: {}, layout: { direction: 'column' },
  children: [
    { type: 'Label', id: 'a', props: { text: label } },
    { type: 'Panel', id: 'mid', props: {}, layout: { direction: 'row' }, children: [
      { type: 'Badge', id: 'b', props: { text: `n=${n}` } },
    ] },
  ],
});

describe('UI Components · mountUI().update 局部更新', () => {
  it('只替换变了的节点·未变节点保持同一 DOM 实例（身份不丢）', () => {
    const host = document.createElement('div');
    const handle = mountUI(host, tree('hi', 1));
    const aBefore = host.querySelector('#a') as HTMLElement;
    aBefore.dataset['mark'] = 'keep'; // 标记未变节点，验证 update 后仍是同一元素

    handle.update(tree('hi', 2)); // 只有 #b 文本变

    const aAfter = host.querySelector('#a') as HTMLElement;
    const bAfter = host.querySelector('#b') as HTMLElement;
    expect(aAfter.dataset['mark']).toBe('keep');     // #a 未被替换（身份保留）
    expect(bAfter.textContent).toContain('n=2');      // #b 已更新
  });

  it('换皮（theme 变）整树按新主题重渲·内容在', () => {
    const host = document.createElement('div');
    const handle = mountUI(host, tree('hi', 1));
    handle.update(tree('hi', 1), { ...SHELL, text: '#ff0000' });
    expect(host.querySelector('#a')).toBeTruthy();
    expect(host.innerHTML).toContain('#ff0000');
  });

  it('换根：新根 id ≠ 旧根 id → 整根重挂切新屏（REQ-UIRECON·A-012 跨屏死机回归）', () => {
    const host = document.createElement('div');
    const play: LayoutNode = { id: 'a-play', type: 'Panel', props: {}, children: [{ id: 'p-felt', type: 'Label', props: { text: '牌桌' } }] };
    const result: LayoutNode = { id: 'a-result', type: 'Panel', props: {}, children: [{ id: 'r-win', type: 'Label', props: { text: '结算·你赢了' } }] };
    const handle = mountUI(host, play);
    expect(host.querySelector('#a-play')).toBeTruthy();

    handle.update(result); // 换根 id：a-play → a-result（旧代码 reconcileNode 找不到新 id 静默 no-op=死机）

    expect(host.querySelector('#a-result')).toBeTruthy(); // 新屏出来了
    expect(host.querySelector('#a-play')).toBeFalsy();     // 旧屏走了
    expect(host.textContent).toContain('结算·你赢了');

    // 换根后**后续 update 仍活**（旧 bug：curRoot 推进成新 id 后每次 update 永久 no-op）。
    const result2: LayoutNode = { id: 'a-result', type: 'Panel', props: {}, children: [{ id: 'r-win', type: 'Label', props: { text: '结算·再来一局' } }] };
    handle.update(result2);
    expect(host.textContent).toContain('再来一局');

    // 再换回牌桌（结算→重开）也活。
    handle.update(play);
    expect(host.querySelector('#a-play')).toBeTruthy();
  });

  it('焦点保护：update 改聚焦 Input 的 value 时不销毁重建（保焦点/光标）', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const tree = (v: string): LayoutNode => ({
      type: 'Panel', id: 'root', props: {}, children: [
        { type: 'Input', id: 'in', props: { value: v, action: 'set' } },
      ],
    });
    const handle = mountUI(host, tree('a'));
    const inp = host.querySelector('#in') as HTMLInputElement;
    (inp as HTMLElement & { _mark?: string })._mark = 'keep';
    inp.focus();
    expect(document.activeElement).toBe(inp);

    handle.update(tree('ab')); // value 变（受控输入·像每次按键）

    const after = host.querySelector('#in') as HTMLInputElement & { _mark?: string };
    expect(after._mark).toBe('keep');           // 同一 DOM 实例（未重建）
    expect(after.value).toBe('ab');             // 值已就地覆写
    expect(document.activeElement).toBe(after);  // 焦点仍在
    host.remove();
  });

  // 动态列表键控增删（owner 2026-07-23「每次打牌桌面牌全部闪」根因·图片重载闪屏）：父自身未变、只增/删/换位子节点 →
  //   稳定子节点 DOM 身份必须**保留**（不销毁重建→不重载图片→不闪）。
  const list = (ids: string[]): LayoutNode => ({
    type: 'Panel', id: 'root', props: {}, layout: { direction: 'row' },
    children: ids.map((id) => ({ type: 'Image', id, props: { src: `/t/${id}.png` } })),
  });
  it('键控增子：新增一张牌·原有牌 DOM 身份保留（不重载=不闪）', () => {
    const host = document.createElement('div');
    const handle = mountUI(host, list(['t0', 't1', 't2']));
    ['t0', 't1', 't2'].forEach((id) => { (host.querySelector(`#${id}`) as HTMLElement).dataset['keep'] = id; });
    handle.update(list(['t0', 't1', 't2', 't3'])); // 河里多一张（子数 3→4）
    ['t0', 't1', 't2'].forEach((id) => expect((host.querySelector(`#${id}`) as HTMLElement).dataset['keep']).toBe(id)); // 原牌未重建
    expect(host.querySelector('#t3')).toBeTruthy();  // 新牌加上了
    expect(host.querySelectorAll('img').length).toBe(4);
    // 顺序正确：t0,t1,t2,t3
    expect(Array.from(host.querySelectorAll('img')).map((e) => e.id)).toEqual(['t0', 't1', 't2', 't3']);
  });
  it('键控删子（窗口滑动）：删首、加尾·中间牌身份保留', () => {
    const host = document.createElement('div');
    const handle = mountUI(host, list(['t4', 't5', 't6']));
    ['t5', 't6'].forEach((id) => { (host.querySelector(`#${id}`) as HTMLElement).dataset['keep'] = id; });
    handle.update(list(['t5', 't6', 't7'])); // 滑窗：删 t4、加 t7
    ['t5', 't6'].forEach((id) => expect((host.querySelector(`#${id}`) as HTMLElement).dataset['keep']).toBe(id)); // 留存牌未重建
    expect(host.querySelector('#t4')).toBeFalsy(); // 首牌走了
    expect(host.querySelector('#t7')).toBeTruthy(); // 尾牌来了
    expect(Array.from(host.querySelectorAll('img')).map((e) => e.id)).toEqual(['t5', 't6', 't7']);
  });

  it('teardown 仍可直接调用（向后兼容）', () => {
    const host = document.createElement('div');
    const handle = mountUI(host, tree('x', 1));
    handle();                       // 作为函数调用 = teardown
    expect(host.innerHTML).toBe('');
  });
});
