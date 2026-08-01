// Game I · 输入实验室（底座能力展示·「输入」模块）
//
// 展示引擎的输入底座：RawInputData（运行时注入的原始信号）→ KeyBinding（数据驱动的键位映射·
// 最弱 LLM 能填、可重绑）→ signal（与设备无关的语义动作）。下游 caster/effect 等按名消费。
//
// 红线（同声音台）：绑定表与解析是纯数据 + 确定性纯函数（可单测）；真正「抓 DOM 事件」是运行时职责，
// 由宿主（game-i.ts）那薄薄一层监听胶水做——不是游戏数据。本文件不碰 DOM。

import type { LayoutNode } from '@ui/components/index.js';
import type { RawInputData, KeyBinding } from '@engine/protocol/components/input.js';

export type { RawInputData };

// ── 数据：键位/指针 → 语义 signal（这就是 KeyBinding 的 assembly 层绑定·纯数据） ──
export const LAB_BINDINGS: KeyBinding[] = [
  { type: 'KeyBinding', key: 'ArrowUp', signal: 'move-up', phase: 'down' },
  { type: 'KeyBinding', key: 'ArrowDown', signal: 'move-down', phase: 'down' },
  { type: 'KeyBinding', key: 'ArrowLeft', signal: 'move-left', phase: 'down' },
  { type: 'KeyBinding', key: 'ArrowRight', signal: 'move-right', phase: 'down' },
  { type: 'KeyBinding', key: 'w', signal: 'move-up', phase: 'down' },
  { type: 'KeyBinding', key: 'a', signal: 'move-left', phase: 'down' },
  { type: 'KeyBinding', key: 's', signal: 'move-down', phase: 'down' },
  { type: 'KeyBinding', key: 'd', signal: 'move-right', phase: 'down' },
  { type: 'KeyBinding', key: ' ', signal: 'jump', phase: 'down' },
  { type: 'KeyBinding', key: 'Enter', signal: 'confirm', phase: 'down' },
  { type: 'KeyBinding', key: 'Escape', signal: 'cancel', phase: 'down' },
  // 指针（key 用相位语义名）：按下=开火、抬起=松手。
  { type: 'KeyBinding', key: 'pointer', signal: 'fire', phase: 'down' },
  { type: 'KeyBinding', key: 'pointer', signal: 'release', phase: 'up' },
];

/**
 * keybind 解释器（确定性·纯函数）：复刻引擎 i2 逻辑——只读一条 RawInputData + 字符串/相位比较 → signal。
 * 键盘按 raw.key 匹配；指针按固定键名 'pointer' 匹配（相位区分开火/松手）。命中返回 signal，否则 null。
 */
export function resolveSignal(raw: RawInputData, bindings: KeyBinding[] = LAB_BINDINGS): string | null {
  const matchKey = raw.source === 'pointer' ? 'pointer' : raw.key;
  if (matchKey === undefined) return null;
  for (const b of bindings) {
    if (b.key !== matchKey) continue;
    if (b.phase !== undefined && b.phase !== raw.phase) continue;
    return b.signal;
  }
  return null;
}

// ── 状态（纯数据·宿主持有） ──
export interface LogRow { source: string; phase: string; key: string; signal: string }
export interface InputLabState {
  held: string[];                          // 当前按住的语义 signal（去重·move-* 等）
  lastSignal: string | null;               // 最近一次解析出的 signal
  pointer: { x: number; y: number; down: boolean };
  log: LogRow[];                           // 最近若干条事件（新在前）
}
export const INITIAL_INPUT: InputLabState = {
  held: [], lastSignal: null, pointer: { x: 0, y: 0, down: false }, log: [],
};

const LOG_MAX = 8;

/** 纯 reducer：吃一条 RawInputData → 新状态（解析 signal·维护按住集·指针位·事件流）。 */
export function applyRawInput(s: InputLabState, raw: RawInputData): InputLabState {
  const signal = resolveSignal(raw);

  // 按住集：键盘 down 加入、up 移除（用「该键的 down 绑定」对应的 signal 作为持续动作名）。
  let held = s.held;
  if (raw.source === 'keyboard' && raw.key !== undefined) {
    const downSig = resolveSignal({ source: 'keyboard', key: raw.key, phase: 'down' });
    if (downSig) {
      if (raw.phase === 'down' && !held.includes(downSig)) held = [...held, downSig];
      else if (raw.phase === 'up') held = held.filter((n) => n !== downSig);
    }
  }

  const pointer = raw.source === 'pointer'
    ? {
        x: Math.round(raw.x ?? s.pointer.x),
        y: Math.round(raw.y ?? s.pointer.y),
        down: raw.phase === 'down' ? true : raw.phase === 'up' ? false : s.pointer.down,
      }
    : s.pointer;

  const row: LogRow = {
    source: raw.source,
    phase: raw.phase ?? '—',
    key: raw.source === 'pointer' ? `(${Math.round(raw.x ?? 0)},${Math.round(raw.y ?? 0)})` : (raw.key ?? '—'),
    signal: signal ?? '—',
  };
  const log = [row, ...s.log].slice(0, LOG_MAX);

  return { held, lastSignal: signal ?? s.lastSignal, pointer, log };
}

// ── 视图（纯数据·LayoutNode）：捕获板 + 按住动作 + 指针态 + 事件流表 ──
// 捕获板（id=input-pad）保持子树稳定（只放静态说明）→ 宿主在它上面挂监听/设 tabindex，监听不被 reconcile 冲掉；
// 读数全部放在捕获板的兄弟节点里，更新时只补丁读数、不动捕获板。
const HINT = '点这块板让它获得焦点，然后按方向键 / WASD / 空格 / 回车 / Esc，或在板上移动、按下鼠标。';

export function buildInputLab(s: InputLabState): LayoutNode {
  const heldTags: LayoutNode = s.held.length
    ? { type: 'Panel', id: 'il-held', props: {}, layout: { direction: 'row', gap: 6, padding: 0 },
        children: s.held.map((sig) => ({ type: 'Tag', id: `il-held-${sig}`, props: { label: sig, tone: 'accent' } })) }
    : { type: 'Label', id: 'il-held-empty', props: { text: '（无按住动作）', color: 'dim', size: 'sm' } };

  return {
    type: 'Panel', id: 'input-lab', props: { title: '🎮 输入底座 · RawInput → KeyBinding → 语义信号' },
    layout: { direction: 'column', gap: 12, padding: 16 },
    children: [
      { type: 'Label', id: 'il-desc', props: {
        text: '原始信号由运行时（DOM 监听）注入，KeyBinding 把它翻成与设备无关的语义动作——键位映射是数据，可重绑、最弱 LLM 能填。',
        color: 'sub', size: 'sm' } },

      // 捕获板（稳定子树·宿主挂监听）
      { type: 'Panel', id: 'input-pad', props: { title: '捕获板（point & focus）' },
        layout: { direction: 'column', gap: 6, padding: 24, align: 'center' },
        children: [
          { type: 'Label', id: 'il-pad-hint', props: { text: HINT, color: 'dim', size: 'sm' } },
        ] },

      // 读数区（兄弟节点·更新只补丁这里）
      { type: 'Panel', id: 'il-read', props: {}, layout: { direction: 'column', gap: 10, padding: 12 },
        children: [
          { type: 'Label', id: 'il-held-lbl', props: { text: '当前按住（持续动作）', color: 'dim', size: 'xs', bold: true } },
          heldTags,
          { type: 'Divider', id: 'il-d1', props: {} },
          { type: 'Label', id: 'il-last', props: {
            text: `最近信号：${s.lastSignal ?? '—'}`, color: s.lastSignal ? 'jade' : 'dim', bold: true } },
          { type: 'Label', id: 'il-ptr', props: {
            text: `指针：x=${s.pointer.x}  y=${s.pointer.y}  ${s.pointer.down ? '● 按下' : '○ 抬起'}`,
            color: 'sub', size: 'sm', mono: true } },
        ] },

      // 事件流表
      { type: 'Table', id: 'il-log', props: {
          title: '事件流（新 → 旧）',
          columns: [
            { key: 'source', label: '源' },
            { key: 'phase', label: '相位' },
            { key: 'key', label: '键 / 坐标' },
            { key: 'signal', label: '信号', align: 'right' },
          ],
          rows: s.log.map((r, i) => ({
            cells: { source: r.source, phase: r.phase, key: r.key, signal: r.signal },
            tone: r.signal !== '—' ? 'accent' : 'normal',
            id: `il-log-${i}`,
          })),
          empty: '（还没有输入事件，去捕获板上按一下）',
        } },
    ],
  };
}
