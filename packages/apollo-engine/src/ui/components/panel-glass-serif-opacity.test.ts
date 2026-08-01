// REQ-UI-骰途逐像素（主程 2026-07-01·PI《骰途》逐像素复刻需求·3 项通用能力）：
// Panel 磨砂玻璃 + Label 衬线字体槽 + 通用 opacity。均闭集/数字字段·跨游戏通用（HUD 浮 3D 磨砂 / 衬线标题混排 / 装饰半透）。
import { describe, it, expect } from 'vitest';
import { renderNode } from './render.js';
import { SHELL } from '../shell-theme.js';
import { validateLayoutNode } from './validate.js';
import type { LayoutNode, UITheme } from './types.js';

const panel = (props: Record<string, unknown>): LayoutNode => ({ type: 'Panel', id: 'p', props, children: [] } as LayoutNode);

describe('UI Components · Panel.glass 磨砂玻璃（①）', () => {
  it('glass=true → backdrop-blur + 半透玻璃底', () => {
    const html = renderNode(panel({ glass: true }), SHELL);
    expect(html).toContain('backdrop-filter:blur(10px)');
    expect(html).toContain('-webkit-backdrop-filter:blur(10px)');
    expect(html).toContain('rgba(20,24,32,0.5)'); // 默认半透玻璃底
  });
  it('glass + bg → bg 覆盖默认玻璃底（要别的色调）', () => {
    const html = renderNode(panel({ glass: true, bg: 'rgba(255,0,0,0.3)' }), SHELL);
    expect(html).toContain('backdrop-filter:blur(10px)');
    expect(html).toContain('rgba(255,0,0,0.3)');
    expect(html).not.toContain('rgba(20,24,32,0.5)');
  });
  it('缺省（无 glass）→ 不加 backdrop-filter·用主题实底', () => {
    const html = renderNode(panel({}), SHELL);
    expect(html).not.toContain('backdrop-filter');
    expect(html).toContain(SHELL.bg1);
  });
});

describe('UI Components · Label font:serif 衬线槽（②）', () => {
  const label = (props: Record<string, unknown>, theme: UITheme = SHELL): string =>
    renderNode({ type: 'Label', id: 'l', props } as LayoutNode, theme);
  it('font=serif + 主题 fontSerif → 用衬线字体', () => {
    const theme: UITheme = { ...SHELL, fontSerif: 'Noto Serif SC, serif' };
    expect(label({ text: '骰途', font: 'serif' }, theme)).toContain('font-family:Noto Serif SC, serif');
  });
  it('font=serif 但主题无 fontSerif → 回退 fontUi（同 pixel/display 先例）', () => {
    expect(label({ text: '骰途', font: 'serif' }, SHELL)).toContain(`font-family:${SHELL.fontUi}`);
  });
});

describe('UI Components · LayoutConstraints.opacity 通用不透明度（③）', () => {
  it('opacity=0.92 → opacity:0.92（Image 塔剪影半透）', () => {
    const html = renderNode({ type: 'Image', id: 'i', props: { src: 'tower.png' }, layout: { opacity: 0.92 } } as LayoutNode, SHELL);
    expect(html).toContain('opacity:0.92');
  });
  it('opacity 非数字 → 回退 1（防注入·不透明安全）', () => {
    const html = renderNode(
      { type: 'Panel', id: 'p', props: {}, layout: { opacity: '.5;x:evil' as unknown as number }, children: [] } as LayoutNode,
      SHELL,
    );
    expect(html).toContain('opacity:1');
  });
});

describe('UI Components · validate 收 serif / glass 闭集', () => {
  it('font=serif + glass 合法通过', () => {
    expect(validateLayoutNode({ type: 'Label', id: 'l', props: { text: 'x', font: 'serif' } } as LayoutNode).filter((i) => i.kind === 'bad-enum')).toHaveLength(0);
    expect(validateLayoutNode(panel({ glass: true })).filter((i) => i.kind === 'bad-enum')).toHaveLength(0);
  });
  it('font 非法值 → bad-enum', () => {
    // 'comic' 等 18 款艺术字现是合法 font 槽（catalog 已补全机读真相）→ 用真·闭集外的值验拦截。
    const issues = validateLayoutNode({ type: 'Label', id: 'l', props: { text: 'x', font: 'wingdings' } } as unknown as LayoutNode);
    expect(issues.some((i) => i.kind === 'bad-enum' && i.detail.includes('font'))).toBe(true);
  });
});
