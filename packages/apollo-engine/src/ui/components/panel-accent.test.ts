// Panel.accent：高亮框（jade 描边 + 柔光投影）——活动视口/强调面板用。纯表现，缺省细线边。
import { describe, it, expect } from 'vitest';
import { renderNode } from './render.js';
import { SHELL } from '../shell-theme.js';
import type { LayoutNode } from './types.js';

describe('UI Components · Panel.accent 高亮框', () => {
  it('accent=true → jade 描边 + box-shadow 柔光', () => {
    const node: LayoutNode = { type: 'Panel', id: 'p', props: { accent: true }, children: [] };
    const html = renderNode(node, SHELL);
    expect(html).toContain(`border:1px solid ${SHELL.jadeLine}`);
    expect(html).toContain('box-shadow:');
  });
  it('缺省（无 accent）→ 普通细线边·无投影', () => {
    const html = renderNode({ type: 'Panel', id: 'p', props: {}, children: [] }, SHELL);
    expect(html).toContain(`border:1px solid ${SHELL.line}`);
    expect(html).not.toContain('box-shadow:');
  });
});
