// @vitest-environment happy-dom
// 3D UI 表达（owner 2026-07-07）：LayoutConstraints 的 rotateX/rotateY/perspective/z → CSS 3D transform；
//   tilt3d → data-tilt3d（配 server.ts 注入的 :hover 立体抬起）。把 CoinFlip 已证明的 CSS-3D 通用成任意面板/卡的能力。
import { describe, it, expect } from 'vitest';
import { renderNode } from './index.js';
import type { LayoutNode } from './index.js';

const P = (layout: LayoutNode['layout']): string => renderNode({ type: 'Panel', id: 'p', props: {}, layout, children: [] });

describe('LayoutConstraints · 3D 变换', () => {
  it('rotateX/rotateY → transform 含 perspective（自动补）+ 对应旋转 + preserve-3d', () => {
    const html = P({ rotateX: 12, rotateY: -8 });
    expect(html).toContain('perspective(800px)'); // 有 3D 值自动补透视
    expect(html).toContain('rotateX(12deg)');
    expect(html).toContain('rotateY(-8deg)');
    expect(html).toContain('transform-style:preserve-3d');
  });
  it('perspective 可自定义·顺序在最前', () => {
    const html = P({ perspective: 500, rotateX: 20 });
    const tf = html.match(/transform:([^;"]+)/)![1];
    expect(tf.startsWith('perspective(500px)')).toBe(true); // perspective 必须最前
    expect(tf).toContain('rotateX(20deg)');
  });
  it('z=translateZ 景深叠层', () => {
    expect(P({ z: 24 })).toContain('translateZ(24px)');
    expect(P({ z: -10 })).toContain('translateZ(-10px)');
  });
  it('2D rotate/scale 与 3D 共存·顺序正确（perspective→3D→2D→z）', () => {
    const tf = P({ rotateY: 15, rotate: 5, scale: 1.1, z: 8 }).match(/transform:([^;"]+)/)![1];
    expect(tf).toBe('perspective(800px) rotateY(15deg) rotate(5deg) scale(1.1) translateZ(8px)');
  });
  it('无 3D 值 → 不补 perspective/preserve-3d（不回归）', () => {
    const html = P({ rotate: 10 });
    expect(html).toContain('transform:rotate(10deg)');
    expect(html).not.toContain('perspective');
    expect(html).not.toContain('preserve-3d');
  });
  it('tilt3d → data-tilt3d 标记（交互立体抬起）', () => {
    expect(P({ tilt3d: true })).toContain('data-tilt3d');
    expect(P({ rotate: 1 })).not.toContain('data-tilt3d');
  });

  // ── 休闲 3D UI 三补（rotateZ 既有=rotate·补循环自旋 / 状态翻面 / 按压反馈）──
  it('anim:"spin" → 匀速 linear 无限循环（转盘/加载环·区别于 ease-in-out 呼吸类）', () => {
    const html = P({ anim: 'spin' });
    expect(html).toMatch(/animation:apollo-spin \d+ms linear infinite/);
    // 呼吸类仍 ease-in-out（不回归）
    expect(P({ anim: 'float' })).toMatch(/animation:apollo-float \d+ms ease-in-out infinite/);
  });
  it('press3d → data-press3d 标记（按压 3D·:active 触屏可用）', () => {
    expect(P({ press3d: true })).toContain('data-press3d');
    expect(P({ tilt3d: true })).not.toContain('data-press3d');
  });
  it('PlayingCard.flipped → data-flipstate + data-flipped（状态驱动·非 hover·触屏翻面）', () => {
    const back: LayoutNode = { type: 'Label', id: 'b', props: { text: '背' } };
    const up = renderNode({ type: 'PlayingCard', id: 'c', props: { rank: 'A', suit: '♠', flipped: false, backFace: back } });
    const down = renderNode({ type: 'PlayingCard', id: 'c', props: { rank: 'A', suit: '♠', flipped: true, backFace: back } });
    expect(up).toContain('data-flipstate');
    expect(up).toContain('data-flipped="false"');
    expect(down).toContain('data-flipped="true"');
    expect(up).toContain('data-flip-front');
    expect(up).toContain('data-flip-back');
    // 状态翻面用 data-flipstate·不是 hover 的 data-flipcard
    expect(up).not.toContain('data-flipcard');
  });
  it('PlayingCard.flipOnHover 仍走 data-flipcard（悬停·不回归）', () => {
    const back: LayoutNode = { type: 'Label', id: 'b', props: { text: '背' } };
    const html = renderNode({ type: 'PlayingCard', id: 'c', props: { rank: 'A', suit: '♠', flipOnHover: true, backFace: back } });
    expect(html).toContain('data-flipcard');
    expect(html).not.toContain('data-flipstate');
  });
});
