// @vitest-environment happy-dom
// UI 库 3 个 render/交互 bug 修复回归（主程 2026-07-01·PI/P3D 实测报·owner 拍板修）：
// #2 REQ-UI-BUG-fx与绝对定位不兼容 · #3 REQ-UI-BUG-Toggle视觉点击不更新 · #4 REQ-UI-BUG-Slider回调偶发undefined。
import { describe, it, expect } from 'vitest';
import { renderNode } from './render.js';
import { mountUI } from './server.js';
import { SHELL } from '../shell-theme.js';
import type { LayoutNode } from './types.js';

describe('UI Components · #2 fx 与绝对定位不兼容', () => {
  it('fx(sheen) + x/y → position:absolute 不被 fx 的 relative 覆盖', () => {
    const html = renderNode({ type: 'Label', id: 'l', props: { text: 'x' }, layout: { x: 100, y: 200, fx: [{ kind: 'sheen' }] } } as LayoutNode, SHELL);
    expect(html).toContain('position:absolute');
    expect(html).not.toContain('position:relative'); // 绝对定位赢·不跑位
  });
  it('fx(sheen) 无 x/y → 仍补 position:relative（fx ::after 需定位祖先）', () => {
    const html = renderNode({ type: 'Label', id: 'l', props: { text: 'x' }, layout: { fx: [{ kind: 'sheen' }] } } as LayoutNode, SHELL);
    expect(html).toContain('position:relative');
  });
});

describe('UI Components · #3 Toggle 点击视觉不更新（焦点保护误伤 checkbox）', () => {
  it('隐藏 checkbox 有焦点时 update → Toggle 视觉跟着更新（放行 outerHTML 重建）', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const handle = mountUI(host, { type: 'Toggle', id: 'tog', props: { label: 'AO', checked: false, action: 'x' } } as LayoutNode, {});
    const cb = host.querySelector('#tog-i') as HTMLInputElement;
    cb.focus(); // 模拟点击后隐藏 checkbox 抢焦点
    expect(document.activeElement).toBe(cb);
    handle.update({ type: 'Toggle', id: 'tog', props: { label: 'AO', checked: true, action: 'x' } } as LayoutNode);
    expect(host.innerHTML).toContain('left:18px'); // 圆钮移到 on 位（修复前焦点保护跳重建→卡 2px）
    handle(); host.remove();
  });
});

describe('UI Components · #4 Slider click 不透传脏 undefined', () => {
  it('range change 派发数值 / click 不派发（值控件只认 change）', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const args: Array<string | undefined> = [];
    const handle = mountUI(
      host,
      { type: 'Slider', id: 'sl', props: { min: 0, max: 1, step: 0.01, value: 0.5, action: 'setAo' } } as LayoutNode,
      { setAo: (a) => { args.push(a); } },
    );
    const range = host.querySelector('input[type=range]') as HTMLInputElement;
    range.value = '0.65';
    range.dispatchEvent(new Event('change', { bubbles: true }));
    range.dispatchEvent(new Event('click', { bubbles: true })); // 修复前：click 走 else 分支 → arg=data-arg=undefined → 再派发一发脏值
    expect(args).toEqual(['0.65']); // 只 change 那一次·click 不透传 undefined（防 Number(undefined)=NaN 击穿）
    handle(); host.remove();
  });
});
