// 输入实验室：keybind 解析（RawInputData → signal）+ reducer（按住集/指针/事件流）纯逻辑守护。
// 全是确定性纯函数，无 DOM——抓事件是宿主运行时职责，不在此测。
import { describe, it, expect } from 'vitest';
import { resolveSignal, applyRawInput, buildInputLab, INITIAL_INPUT, LAB_BINDINGS } from './input-lab.js';
import type { LayoutNode } from '@ui/components/index.js';

describe('Game I · 输入底座 · keybind 解析', () => {
  it('键盘 down 命中绑定 → 对应 signal', () => {
    expect(resolveSignal({ source: 'keyboard', key: 'ArrowUp', phase: 'down' })).toBe('move-up');
    expect(resolveSignal({ source: 'keyboard', key: 'a', phase: 'down' })).toBe('move-left');
    expect(resolveSignal({ source: 'keyboard', key: ' ', phase: 'down' })).toBe('jump');
  });
  it('相位不匹配 → 不命中（ArrowUp 只绑 down）', () => {
    expect(resolveSignal({ source: 'keyboard', key: 'ArrowUp', phase: 'up' })).toBeNull();
  });
  it('未绑定的键 → null', () => {
    expect(resolveSignal({ source: 'keyboard', key: 'z', phase: 'down' })).toBeNull();
  });
  it('指针按相位区分开火/松手（固定键名 pointer）', () => {
    expect(resolveSignal({ source: 'pointer', x: 1, y: 2, phase: 'down' })).toBe('fire');
    expect(resolveSignal({ source: 'pointer', x: 1, y: 2, phase: 'up' })).toBe('release');
    expect(resolveSignal({ source: 'pointer', x: 1, y: 2, phase: 'move' })).toBeNull();
  });
  it('绑定表是纯数据（KeyBinding[]·可重绑）', () => {
    expect(LAB_BINDINGS.every((b) => b.type === 'KeyBinding' && typeof b.key === 'string' && typeof b.signal === 'string')).toBe(true);
  });
});

describe('Game I · 输入底座 · reducer', () => {
  it('按住集：down 加入、up 移除（同一物理键映射到同一 signal）', () => {
    let s = INITIAL_INPUT;
    s = applyRawInput(s, { source: 'keyboard', key: 'ArrowLeft', phase: 'down' });
    expect(s.held).toContain('move-left');
    expect(s.lastSignal).toBe('move-left');
    s = applyRawInput(s, { source: 'keyboard', key: 'ArrowLeft', phase: 'up' });
    expect(s.held).not.toContain('move-left');
  });
  it('按住集去重（同键重复 down 不堆叠）', () => {
    let s = INITIAL_INPUT;
    s = applyRawInput(s, { source: 'keyboard', key: 'w', phase: 'down' });
    s = applyRawInput(s, { source: 'keyboard', key: 'w', phase: 'down' });
    expect(s.held.filter((n) => n === 'move-up')).toHaveLength(1);
  });
  it('指针：坐标与按下态随相位更新', () => {
    let s = INITIAL_INPUT;
    s = applyRawInput(s, { source: 'pointer', x: 40, y: 12, phase: 'down' });
    expect(s.pointer).toEqual({ x: 40, y: 12, down: true });
    s = applyRawInput(s, { source: 'pointer', x: 41, y: 13, phase: 'up' });
    expect(s.pointer.down).toBe(false);
  });
  it('事件流：新事件在前，封顶 8 条', () => {
    let s = INITIAL_INPUT;
    for (let i = 0; i < 12; i++) s = applyRawInput(s, { source: 'keyboard', key: 'd', phase: 'down' });
    expect(s.log).toHaveLength(8);
    expect(s.log[0]!.signal).toBe('move-right');
  });
});

describe('Game I · 输入底座 · 视图纯数据', () => {
  it('buildInputLab 出纯 LayoutNode·含捕获板 + 事件流表', () => {
    const tree: LayoutNode = buildInputLab(INITIAL_INPUT);
    const ids: string[] = [];
    const walk = (n: LayoutNode): void => { ids.push(n.id); (n.children ?? []).forEach(walk); };
    walk(tree);
    expect(ids).toContain('input-pad');  // 捕获板（宿主挂监听的稳定锚点）
    expect(ids).toContain('il-log');     // 事件流表
  });
});
