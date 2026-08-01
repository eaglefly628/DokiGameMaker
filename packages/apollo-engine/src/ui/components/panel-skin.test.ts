// @vitest-environment happy-dom
// REQ-PANELSKIN：Panel.skin 面覆盖皮（复合贴图按钮·game-c 主行动键）——art 框 + children 叠其上（动态数额不烤进图）。
import { describe, it, expect } from 'vitest';
import { renderNode } from './index.js';
import type { LayoutNode } from './types.js';

// 复合主行动键：Panel(skin=框皮·action=可点) 装 children「Call」+ 动态数额「50」。
const actionBtn = (amt: number): LayoutNode => ({
  type: 'Panel', id: 'act-call', props: { skin: '/art/btn-frame.png', action: 'call', actionArg: String(amt) },
  layout: { direction: 'row', gap: 6, align: 'center', width: 120, height: 44 },
  children: [
    { type: 'Label', id: 'ac-l', props: { text: 'Call', color: 'text' } },
    { type: 'Label', id: 'ac-v', props: { text: String(amt), color: 'gold', bold: true } },
  ],
});

describe('Panel.skin · 复合贴图按钮框皮（REQ-PANELSKIN）', () => {
  it('skin → 整面 cover 覆盖·art 即框（压过默认底/边框）', () => {
    const html = renderNode(actionBtn(50));
    expect(html).toContain("background:url('/art/btn-frame.png') center/cover no-repeat");
    expect(html).toContain('border:0'); // art 即框·无默认边
  });
  it('children 照常渲在皮上·动态数额是实时 LayoutNode 文字（不烤进图）', () => {
    const html = renderNode(actionBtn(50));
    expect(html).toContain('Call'); expect(html).toContain('>50<'); // 数额活文字
    // 换数额=换 children 文字·皮不变（动态性证明）
    expect(renderNode(actionBtn(120))).toContain('>120<');
  });
  it('配 action → 整容器可点 + 手型（同 Button）', () => {
    const html = renderNode(actionBtn(50));
    expect(html).toContain('data-action="call"'); expect(html).toContain('data-arg="50"');
    expect(html).toContain('cursor:pointer');
  });
  it('skinSlice → 9-slice border-image 画框（框皮任意尺寸不糊）', () => {
    const framed: LayoutNode = { type: 'Panel', id: 'f', props: { skin: '/art/frame.png', skinSlice: 18 }, children: [] };
    const html = renderNode(framed);
    expect(html).toContain("border-image:url('/art/frame.png') 18 fill");
  });
  it('不填 skin → 原面板底/边框零回归', () => {
    const plain: LayoutNode = { type: 'Panel', id: 'p', props: { title: 'X' }, children: [] };
    const html = renderNode(plain);
    expect(html).not.toContain('center/cover');
    expect(html).toContain('border:1px'); // 原细线边
  });
});
