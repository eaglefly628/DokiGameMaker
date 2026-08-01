// @vitest-environment happy-dom
// REQ-UI-web字体加载（数据化）+ Label ink 令牌（主程 2026-07-02·P3D 报「对齐 Cloud Design 撞到·全 app 从不加载 web 字体」）：
//  ① UITheme.webfonts 声明「要哪款字体 + woff2 URL」→ mountUI/ensureWebfonts 生成并注入 @font-face（去重·全局一次）。
//     （下沉自 game-g/fonts.ts 的自托管 @font-face 打法·通用化进 UI 库·全 app 受益。）
//  ③ Label color:'ink' 深墨字令牌（金按钮/浅底上的深色文字·原型 #3a2406 on gold）→ 解析 UITheme.ink·缺省回退 bg0。
import { describe, it, expect, beforeEach } from 'vitest';
import { renderNode } from './render.js';
import { mountUI, ensureWebfonts } from './server.js';
import { SHELL } from '../shell-theme.js';
import type { LayoutNode, UITheme, WebFont } from './types.js';

const FONTS: WebFont[] = [
  { family: 'Noto Sans SC', url: '/f/notosans.woff2', weight: '400 900' }, // 可变字重单文件
  { family: 'Cinzel', url: '/f/cinzel.woff2', weight: '700' },
];

describe('UI Components · ① web 字体加载（@font-face 数据化注入）', () => {
  beforeEach(() => { document.head.innerHTML = ''; document.body.innerHTML = ''; });

  it('ensureWebfonts 建一个全局 <style id=apollo-webfonts>·每款字体一条 @font-face', () => {
    ensureWebfonts(FONTS);
    const st = document.getElementById('apollo-webfonts');
    expect(st).not.toBeNull();
    const css = st!.textContent ?? '';
    expect(css).toContain("font-family:'Noto Sans SC'");
    expect(css).toContain("font-family:'Cinzel'");
    expect(css).toContain('url(/f/notosans.woff2)');
    expect(css).toContain('font-display:swap');        // FOIT→FOUT·字体到前先显系统字体
    expect(css).toContain('font-weight:400 900');       // 可变字重原样透传
  });

  it('去重：重复调用 / 多主题共存同一面只注入一次（不叠加）', () => {
    ensureWebfonts(FONTS);
    ensureWebfonts(FONTS);                               // 整份重来
    ensureWebfonts([{ family: 'Noto Sans SC', url: '/f/notosans.woff2', weight: '400 900' }]); // 重复子集
    const css = document.getElementById('apollo-webfonts')!.textContent ?? '';
    const notoCount = css.split("font-family:'Noto Sans SC'").length - 1;
    expect(notoCount).toBe(1);                           // 只一条·幂等
  });

  it('mountUI 自动注入 theme.webfonts（挂载即生效·全 app 受益的"一处"）', () => {
    const theme = { ...SHELL, webfonts: FONTS } as UITheme;
    const host = document.createElement('div'); document.body.appendChild(host);
    const h = mountUI(host, { type: 'Label', id: 'l', props: { text: 'x' } } as LayoutNode, {}, theme);
    expect(document.getElementById('apollo-webfonts')!.textContent).toContain("font-family:'Cinzel'");
    h();
  });

  it('无 webfonts 的主题 → 不建 style（不污染 head·老主题零变化）', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const h = mountUI(host, { type: 'Label', id: 'l', props: { text: 'x' } } as LayoutNode, {}, SHELL);
    expect(document.getElementById('apollo-webfonts')).toBeNull(); // SHELL 无 webfonts
    h();
  });
});

describe('UI Components · ③ Label ink 深墨字令牌', () => {
  it("color:'ink' → 解析 theme.ink（金按钮上的深墨字）", () => {
    const theme = { ...SHELL, ink: '#3a2406' } as UITheme;
    const html = renderNode({ type: 'Label', id: 'l', props: { text: '开始', color: 'ink' } } as LayoutNode, theme);
    expect(html).toContain('#3a2406');
  });

  it('主题未填 ink → 回退最深底 bg0（不崩·仍是深色可读）', () => {
    const noInk = { ...SHELL, ink: undefined } as UITheme;
    const html = renderNode({ type: 'Label', id: 'l', props: { text: 'x', color: 'ink' } } as LayoutNode, noInk);
    expect(html).toContain(SHELL.bg0);
  });

  it('SHELL 自带 ink 默认值（color:ink 全 app 开箱可用）', () => {
    expect((SHELL as UITheme).ink).toBeTruthy();
  });
});
