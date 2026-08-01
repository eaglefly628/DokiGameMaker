// @vitest-environment happy-dom
// Label 字体槽/磷光/字距 下沉验收（render-only·不进 sim hash）：
//   · font：具名字体槽 ui/mono/pixel/display → 取 UITheme 对应槽（pixel/display 缺省回退 ui/mono）。
//   · glow：text-shadow 柔光（琥珀时钟磷光）。
//   · tracking：letter-spacing（Silkscreen 全大写微标）。
// 折进 Label 扩字段而非新建控件（manifesto：扩字段优先于加控件类型）。下沉自 game-x《残响》像素 UI。
import { describe, it, expect } from 'vitest';
import { renderNode } from './index.js';
import { apolloOnyx } from './apollo-kit.js';
import { ART_FONT_CJK_CSS } from './art-fonts-cjk.js';
import type { UITheme } from './types.js';

const theme: UITheme = { ...apolloOnyx, fontPixel: "'Silkscreen'", fontDisplay: "'VT323'" };

describe('UI Components · Label.font 具名字体槽', () => {
  it('font:display → 取 UITheme.fontDisplay（VT323）', () => {
    const html = renderNode({ type: 'Label', id: 'clk', props: { text: '21:47', font: 'display' } }, theme);
    expect(html).toContain("font-family:'VT323'");
  });
  it('font:pixel → 取 UITheme.fontPixel（Silkscreen）', () => {
    const html = renderNode({ type: 'Label', id: 'lb', props: { text: 'NOW', font: 'pixel' } }, theme);
    expect(html).toContain("font-family:'Silkscreen'");
  });
  it('pixel/display 槽缺省回退 fontUi/fontMono（主题无新槽不崩）', () => {
    // 基座主题(SHELL/apollo)现都带 fontPixel（REQ-UI-fontPixel令牌），故用显式去槽主题验回退安全。
    const noSlots: UITheme = { ...apolloOnyx, fontPixel: undefined, fontDisplay: undefined };
    expect(renderNode({ type: 'Label', id: 'lb', props: { text: 'x', font: 'pixel' } }, noSlots)).toContain(`font-family:${apolloOnyx.fontUi}`);
    expect(renderNode({ type: 'Label', id: 'lc', props: { text: 'x', font: 'display' } }, noSlots)).toContain(`font-family:${apolloOnyx.fontMono}`);
  });
  it('未填 font 时按 mono 布尔回退（旧调用方行为不变）', () => {
    const mono = renderNode({ type: 'Label', id: 'a', props: { text: 'x', mono: true } }, theme);
    expect(mono).toContain(`font-family:${theme.fontMono}`);
    const ui = renderNode({ type: 'Label', id: 'b', props: { text: 'x' } }, theme);
    expect(ui).toContain(`font-family:${theme.fontUi}`);
  });
});

describe('UI Components · Label.font CJK 艺术字（中/日·owner 2026-07-23）', () => {
  it('4 款 CJK 槽解到真族名 + 带 CJK 兜底链（缺字回退系统字·非拉丁艺术字回退主字体）', () => {
    const cases: Array<[string, string]> = [
      ['cnbrush', "'Ma Shan Zheng'"], ['cnwen', "'ZCOOL XiaoWei'"],
      ['jpbrush', "'Yuji Syuku'"], ['jppen', "'Klee One'"],
    ];
    for (const [slug, fam] of cases) {
      const html = renderNode({ type: 'Label', id: `t-${slug}`, props: { text: '雀宴', font: slug as 'cnbrush' } }, theme);
      expect(html).toContain(`font-family:${fam}, 'PingFang SC'`); // 族名在前·系统 CJK 兜底其后
    }
  });
  it('CJK @font-face = url() 引用（非 base64·浏览器惰性下载）· 覆 4 族', () => {
    expect(ART_FONT_CJK_CSS).toContain("url(/ui-fonts/cjk/cnbrush.woff2)");
    expect(ART_FONT_CJK_CSS).toContain("font-family:'Klee One'");
    expect(ART_FONT_CJK_CSS).not.toContain('base64'); // CJK 走 url·不内嵌（区别拉丁 18 款）
    expect((ART_FONT_CJK_CSS.match(/@font-face/g) ?? []).length).toBe(4);
  });
});

describe('UI Components · Label.glow / tracking', () => {
  it('glow → text-shadow 柔光（按当前 color）', () => {
    const html = renderNode({ type: 'Label', id: 'g', props: { text: '21:47', color: 'gold', glow: true } }, theme);
    expect(html).toContain('text-shadow:');
    expect(html).toContain(theme.gold); // 柔光取 gold 色
  });
  it('tracking → letter-spacing px', () => {
    const html = renderNode({ type: 'Label', id: 'tk', props: { text: 'REMNANT', tracking: 4 } }, theme);
    expect(html).toContain('letter-spacing:4px');
  });
  it('不填则无 text-shadow / letter-spacing（不污染旧 Label）', () => {
    const html = renderNode({ type: 'Label', id: 'p', props: { text: 'x' } }, theme);
    expect(html).not.toContain('text-shadow');
    expect(html).not.toContain('letter-spacing');
  });
});
