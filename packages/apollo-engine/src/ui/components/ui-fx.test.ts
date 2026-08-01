// UI 特效库（owner 2026-06-27）：把 UI 层通用特效抽象成「一个可叠加的闭集 fx 合集」，而非每效一个布尔旗标。
// 与「战场/实体特效库」(prefab+caster+tween+lifetime) 正交、可叠加。详见 docs/design/effects-architecture.md。
import { describe, it, expect } from 'vitest';
import { renderNode, validateLayoutNode } from './index.js';
import type { LayoutNode, VisualEffect } from './index.js';

const panel = (fx: VisualEffect[]): string =>
  renderNode({ type: 'Panel', id: 'p', props: { bare: true }, layout: { fx } } as LayoutNode);

describe('UI 特效库 · fx 合集（一个字段·闭集·可叠加·可参数化）', () => {
  it('shake：intensity→抖幅 var，once→播一次(both)', () => {
    const h = panel([{ kind: 'shake', intensity: 2, once: true }]);
    expect(h).toContain('--fx-amp:8px');
    expect(h).toMatch(/animation:apollo-fx-shake \d+ms ease-in-out both/);
  });
  it('pulse 缺省循环(infinite)', () => {
    expect(panel([{ kind: 'pulse' }])).toMatch(/animation:apollo-pulse \d+ms ease-in-out infinite/);
  });
  it('glow：color→主题令牌 drop-shadow（不把色串裸插）', () => {
    const h = panel([{ kind: 'glow', color: 'danger' }]);
    expect(h).toContain('filter:drop-shadow(0 0 4px');
    expect(h).toContain('drop-shadow(0 0 10px');
  });
  it('可叠加：glow + shake 同时（filter 与 animation 各管各、组合出来）', () => {
    const h = panel([{ kind: 'glow', color: 'gold' }, { kind: 'shake' }]);
    expect(h).toContain('filter:drop-shadow');
    expect(h).toContain('animation:apollo-fx-shake');
  });
  it('flash：叠层 token data-fx="flash" + 闪色/时长 var', () => {
    const h = panel([{ kind: 'flash', color: 'gold', ms: 300 }]);
    expect(h).toContain('data-fx="flash"');
    expect(h).toContain('--fx-flash:');
    expect(h).toContain('--fx-flash-ms:300ms');
  });
  it('sheen：叠层 token data-fx="sheen"', () => {
    expect(panel([{ kind: 'sheen' }])).toContain('data-fx="sheen"');
  });
  it('sheen-hover：叠层 token data-fx="sheen-hover"（悬停触发变体·REQ-FX-SHEEN-HOVER）', () => {
    const h = panel([{ kind: 'sheen-hover' }]);
    expect(h).toContain('data-fx="sheen-hover"');
    expect(h).toContain('position:relative'); // ::after 锚定
  });
  it('sheen-hover 是合法闭集 kind（validator 收）', () => {
    const node = { type: 'Panel', id: 'p', layout: { fx: [{ kind: 'sheen-hover' }] } } as LayoutNode;
    expect(validateLayoutNode(node)).toEqual([]);
  });
  it('叠层效果挂 position:relative（::after/::before 锚定）', () => {
    expect(panel([{ kind: 'sheen' }])).toContain('position:relative');
  });
});

describe('UI 特效库 · 校验器把关闭集（受控合成·防拼错/注入）', () => {
  const valid: LayoutNode = { type: 'Panel', id: 'p', layout: { fx: [{ kind: 'glow', color: 'jade' }, { kind: 'shake' }] } } as LayoutNode;
  it('合法 fx 零 issue', () => {
    expect(validateLayoutNode(valid)).toEqual([]);
  });
  it('乱填 kind → bad-enum', () => {
    const bad = { type: 'Panel', id: 'p', layout: { fx: [{ kind: 'explode' }] } } as unknown as LayoutNode;
    const issues = validateLayoutNode(bad);
    expect(issues.some((i) => i.kind === 'bad-enum' && i.detail.includes('fx[0].kind'))).toBe(true);
  });
  it('乱填 color → bad-enum', () => {
    const bad = { type: 'Panel', id: 'p', layout: { fx: [{ kind: 'glow', color: 'rgb(1,2,3)' }] } } as unknown as LayoutNode;
    expect(validateLayoutNode(bad).some((i) => i.kind === 'bad-enum' && i.detail.includes('fx[0].color'))).toBe(true);
  });
});

describe('向后兼容：旧 sheen 布尔仍生效（已并入 fx·别名保留）', () => {
  it('layout.sheen:true → data-sheen', () => {
    expect(renderNode({ type: 'Panel', id: 'p', props: { bare: true }, layout: { sheen: true } } as LayoutNode)).toContain('data-sheen');
  });
});
