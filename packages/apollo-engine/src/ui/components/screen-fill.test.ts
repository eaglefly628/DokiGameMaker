// @vitest-environment happy-dom
// Screen.fill（REQ-SCREENFILL·去竖屏底部信箱空白）· PUI 渲染守卫。
// 缺省 min-height:100vh（吃视口·直挂页面对·零回归）；fill:true → min-height:100%（吃父定尺盒·mountHost 信箱盒填满）。
import { describe, it, expect } from 'vitest';
import { renderNode } from './index.js';
import type { LayoutNode } from './index.js';
import { apolloOnyx as T } from './apollo-kit.js';

function styleOf(html: string, id: string): string {
  const m = new RegExp(`id="${id}"[^>]*style="([^"]*)"`).exec(html);
  return m ? m[1] : '';
}

describe('Screen.fill · 填满宿主定尺盒（REQ-SCREENFILL）', () => {
  it('缺省（无 fill）→ min-height:100vh（吃视口·直挂页面零回归）', () => {
    const html = renderNode({ type: 'Screen', id: 's', props: {}, children: [] } as LayoutNode, T);
    expect(styleOf(html, 's')).toContain('min-height:100vh');
    expect(styleOf(html, 's')).not.toContain('min-height:100%');
  });
  it('fill:true → min-height:100%（吃父定尺盒·mountHost 场景盒填满去底部信箱）', () => {
    const html = renderNode({ type: 'Screen', id: 's', props: { fill: true }, children: [] } as LayoutNode, T);
    expect(styleOf(html, 's')).toContain('min-height:100%');
    expect(styleOf(html, 's')).not.toContain('100vh');
  });
  it('fill 与 center/bg/blur 可叠（只改高度语义·其余不动）', () => {
    const html = renderNode(
      { type: 'Screen', id: 's', props: { fill: true, center: true, blur: 4 }, children: [] } as LayoutNode,
      T,
    );
    const style = styleOf(html, 's');
    expect(style).toContain('min-height:100%');
    expect(style).toContain('align-items:center;justify-content:center;');
    expect(style).toContain('backdrop-filter:blur(4px)');
  });
});
