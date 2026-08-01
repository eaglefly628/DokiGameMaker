// lintLayoutNode 软建议（REQ-UI-积木接口完备性批·P3D 复核 Gemini review 采纳·2026-07-15）。
// 与 validateLayoutNode（硬门）分离：全 severity:'warn'·非阻塞·接口稳健性建议。
import { describe, it, expect } from 'vitest';
import { lintLayoutNode, validateLayoutNode } from './validate.js';
import type { LayoutNode } from './types.js';

describe('lintLayoutNode · 非阻塞软建议（不进硬门）', () => {
  it('② bg 裸串疑似拼错令牌 → naked-fill warn', () => {
    const w = lintLayoutNode({ type: 'Panel', id: 'p', props: { bg: 'panell' }, children: [] }); // 拼错 panel
    expect(w.some((i) => i.kind === 'naked-fill' && i.severity === 'warn')).toBe(true);
  });
  it('② 合法令牌/预设/custom/CSS 色形 → 不 warn', () => {
    const ok = (bg: unknown) => lintLayoutNode({ type: 'Panel', id: 'p', props: { bg } as never, children: [] });
    expect(ok('raised')).toHaveLength(0);          // 令牌
    expect(ok('jade-sheen')).toHaveLength(0);       // 预设
    expect(ok({ custom: '#abc' })).toHaveLength(0); // 显式逃生
    expect(ok('#141b27')).toHaveLength(0);          // raw hex（back-compat·不 warn）
    expect(ok('linear-gradient(180deg,#000,#111)')).toHaveLength(0);
  });
  it('③ layout 专用词误塞 props → bad-layout-placement warn（fx/rotate/z/tilt3d…）', () => {
    const w = lintLayoutNode({ type: 'Panel', id: 'p', props: { fx: [], rotateX: 10 } as never, children: [] });
    const kinds = w.filter((i) => i.kind === 'bad-layout-placement');
    expect(kinds.length).toBe(2); // fx + rotateX 各一
    expect(kinds.every((i) => i.severity === 'warn')).toBe(true);
  });
  it('③ radius 不误报（Image/ProgressBar 真 prop）', () => {
    const w = lintLayoutNode({ type: 'Image', id: 'i', props: { src: '/a.png', radius: 8 } });
    expect(w.some((i) => i.kind === 'bad-layout-placement')).toBe(false);
  });
  it('① scroll 祖先内的 3D 变换 → flatten-3d warn', () => {
    const tree: LayoutNode = { type: 'Panel', id: 'scr', props: { scroll: true }, children: [
      { type: 'Panel', id: 'card', props: {}, layout: { rotateY: 20, z: 30 }, children: [] },
    ] };
    const w = lintLayoutNode(tree);
    expect(w.some((i) => i.kind === 'flatten-3d' && i.severity === 'warn' && i.path.includes('children[0]'))).toBe(true);
  });
  it('① 无 scroll 祖先 → 3D 变换不 warn', () => {
    const tree: LayoutNode = { type: 'Panel', id: 'p', props: {}, children: [
      { type: 'Panel', id: 'card', props: {}, layout: { rotateY: 20 }, children: [] },
    ] };
    expect(lintLayoutNode(tree).some((i) => i.kind === 'flatten-3d')).toBe(false);
  });
  it('lint 与 validate 分离：合法树 validate 零 issue（硬门不受 lint 影响）', () => {
    const t: LayoutNode = { type: 'Panel', id: 'p', props: { bg: 'panell' } as never, children: [] };
    expect(validateLayoutNode(t)).toHaveLength(0); // 硬门不管 lint 建议
    expect(lintLayoutNode(t).length).toBeGreaterThan(0); // lint 才提
  });
});
