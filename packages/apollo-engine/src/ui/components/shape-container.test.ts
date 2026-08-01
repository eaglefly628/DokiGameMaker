// @vitest-environment happy-dom
// 异形容器 Panel.shape（REQ-UI-异型容器①）+ faceArtSlice 画框修缮（REQ-FACEART①）· PUI 渲染守卫。
import { describe, it, expect } from 'vitest';
import { renderNode } from './index.js';
import type { LayoutNode } from './index.js';
import { apolloOnyx as T } from './apollo-kit.js';

// SHAPE_CSS 闭集真值（与 render.ts 同源·防漂移）。
const CLIP: Record<string, string> = {
  hexagon: 'clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)',
  diamond: 'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)',
  shield: 'clip-path:polygon(0 0,100% 0,100% 62%,50% 100%,0 62%)',
};

describe('Panel.shape · 异形容器（复用 Button 同套 clip-path 闭集·非矩形容器不必贴图硬凑）', () => {
  it('各 shape token → 面板 style 注入对应 clip-path（六边/菱/盾）', () => {
    for (const [shape, clip] of Object.entries(CLIP)) {
      const html = renderNode(
        { type: 'Panel', id: 'p', props: { shape: shape as never }, layout: { width: 120, height: 120 } } as LayoutNode,
        T,
      );
      expect(html).toContain(clip);
    }
  });
  it('缺省无 shape → 零 clip-path（既有矩形行为字节不变·向后兼容）', () => {
    const html = renderNode({ type: 'Panel', id: 'p', props: {}, children: [] }, T);
    expect(html).not.toContain('clip-path');
  });
  it('shape 与 skin/edge 可叠（clip 在最外层裁形·不吃掉皮/描边）', () => {
    const html = renderNode(
      { type: 'Panel', id: 'p', props: { shape: 'hexagon', edge: 'gold' } as never, layout: { width: 120, height: 120 } } as LayoutNode,
      T,
    );
    expect(html).toContain(CLIP.hexagon);
    expect(html).toContain(T.gold); // edge 描边仍在
  });
});

describe('PlayingCard.faceArtSlice · 9-slice 画框修缮（REQ-FACEART①·border-image 渲染前提）', () => {
  it('faceArtSlice 给了 → 必带 border-style:solid + border-width:<slice>px（否则真浏览器一像素不画）', () => {
    const html = renderNode(
      { type: 'PlayingCard', id: 'pc', props: { rank: 'A', suit: 'spades', faceArt: 'data:image/png;base64,AAAA', faceArtSlice: 16 } },
      T,
    );
    expect(html).toContain('border-style:solid');
    expect(html).toContain('border-width:16px');
    expect(html).toContain('border-image:url(data:image/png;base64,AAAA) 16 fill / 16px / 0 stretch');
  });
  it('faceArt 无 slice → 仍走 <img cover>（零 border-image·不受影响）', () => {
    const html = renderNode(
      { type: 'PlayingCard', id: 'pc', props: { rank: 'A', suit: 'spades', faceArt: 'data:image/png;base64,AAAA' } },
      T,
    );
    expect(html).toContain('object-fit:cover');
    expect(html).not.toContain('border-image');
  });
});
