// 世界绑定解析（收编 GameShell stat/bar/image-bind 入 LayoutNode）：resolveBindings 用注入的
// UIDataSource 把 bind 节点填成字面值，纯函数、不改原树、未命中原样透传。
import { describe, it, expect } from 'vitest';
import { resolveBindings, isVisible, type UIDataSource } from './bindings.js';
import { renderNode } from './render.js';
import type { LayoutNode } from './types.js';

const ds: UIDataSource = {
  resource: (id) => ({ hp: { current: 30, max: 120 }, score: { current: 1450 } }[id]),
  value: (id) => ({ portrait: 'guanyu.png' }[id]),
};

describe('UI Components · resolveBindings 世界绑定', () => {
  it('Label.bind → text 接 Resource.current（text 作前缀）', () => {
    const out = resolveBindings({ type: 'Label', id: 'l', props: { text: '战功 ', bind: 'score' } }, ds);
    expect((out.props as { text: string }).text).toBe('战功 1450');
  });

  it('ProgressBar.bind → value/max 取自 Resource', () => {
    const out = resolveBindings({ type: 'ProgressBar', id: 'b', props: { value: 0, bind: 'hp', tone: 'danger' } }, ds);
    const p = out.props as { value: number; max?: number };
    expect(p.value).toBe(30); expect(p.max).toBe(120);
    expect(renderNode(out)).toContain('width:25%'); // 30/120 渲染成 25%
  });

  it('Image.bind → src 取自 value（StringVar）', () => {
    const out = resolveBindings({ type: 'Image', id: 'i', props: { src: '', bind: 'portrait' } }, ds);
    expect((out.props as { src: string }).src).toBe('guanyu.png');
  });

  it('无 bind / 未命中 → 原样透传；递归子节点；不改原树', () => {
    const tree: LayoutNode = {
      type: 'Panel', id: 'p', props: {}, children: [
        { type: 'Label', id: 'a', props: { text: '纯文本' } },               // 无 bind
        { type: 'Label', id: 'b', props: { text: 'X', bind: '不存在' } },     // 未命中
        { type: 'ProgressBar', id: 'c', props: { value: 5, bind: 'hp' } },    // 命中（递归到子）
      ],
    };
    const out = resolveBindings(tree, ds);
    const kids = out.children!;
    expect((kids[0]!.props as { text: string }).text).toBe('纯文本');        // 无 bind 不动
    expect((kids[1]!.props as { text: string }).text).toBe('X');             // 未命中不动
    expect((kids[2]!.props as { value: number }).value).toBe(30);            // 子节点也解析
    expect((tree.children![2]!.props as { value: number }).value).toBe(5);   // 原树未被改（纯函数）
  });
});

describe('UI Components · visibleWhen 条件显隐（数据替代代码重建树）', () => {
  const fds: UIDataSource = { flag: (id) => ({ locked: true, owned: false }[id]) };

  it('isVisible：flag 真→显、假→隐；`!` 取反；缺 flag 读取器 / 无 visibleWhen → 恒显', () => {
    const N = (id: string, vw?: string): LayoutNode => ({ type: 'Label', id, props: { text: '' }, ...(vw ? { visibleWhen: vw } : {}) });
    expect(isVisible(N('a', 'locked'), fds)).toBe(true);   // locked=true → 显
    expect(isVisible(N('b', 'owned'), fds)).toBe(false);   // owned=false → 隐
    expect(isVisible(N('c', '!owned'), fds)).toBe(true);   // 取反 → 显
    expect(isVisible(N('d', '!locked'), fds)).toBe(false); // 取反 → 隐
    expect(isVisible(N('e', 'missing'), fds)).toBe(false); // 未命中 flag = falsy → 隐
    expect(isVisible(N('f', 'locked'), {})).toBe(true);    // 无 flag reader → 恒显（安全默认）
    expect(isVisible(N('g'), fds)).toBe(true);             // 无 visibleWhen → 恒显
    expect(isVisible(N('h', '!'), fds)).toBe(true);        // 空 flag id（裸 "!"）→ 不误删
  });

  it('resolveBindings：children 里 visibleWhen 不满足的子树被剔除（其余顺序保留）', () => {
    const tree: LayoutNode = { type: 'Panel', id: 'p', props: {}, children: [
      { type: 'Label', id: 'always', props: { text: 'A' } },                            // 无条件
      { type: 'Label', id: 'lockTag', props: { text: '🔒' }, visibleWhen: 'locked' },    // 显
      { type: 'Button', id: 'buyBtn', props: { label: '购买' }, visibleWhen: '!owned' }, // 显（未拥有）
      { type: 'Button', id: 'useBtn', props: { label: '使用' }, visibleWhen: 'owned' },  // 隐（未拥有）
    ] };
    const out = resolveBindings(tree, fds);
    expect(out.children!.map((c) => c.id)).toEqual(['always', 'lockTag', 'buyBtn']); // useBtn 被剔除
  });

  it('隐藏子树不进渲染（不留 DOM·替代 display:none）；原树不被改（纯函数）', () => {
    const tree: LayoutNode = { type: 'Panel', id: 'p', props: {}, children: [
      { type: 'Button', id: 'useBtn', props: { label: '使用道具' }, visibleWhen: 'owned' }, // owned=false → 隐
    ] };
    const html = renderNode(resolveBindings(tree, fds));
    expect(html).not.toContain('使用道具');
    expect(html).not.toContain('useBtn');
    expect(tree.children!.length).toBe(1); // 原树仍含被隐节点（只是过滤出了新 children 数组）
  });
});
