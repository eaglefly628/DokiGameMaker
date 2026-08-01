// @vitest-environment happy-dom
// 透明（alpha）贴图端到端渲染守卫（owner 2026-07-24「透明色 2D 贴图融入游戏」·PUI 验证 + 回归锁）。
//
// 背景：owner 疑「透明贴图放进去不太对——是抠图源头问题，还是放进去格式不满足透明？」。
// 实测裁定（配 docs/design/ 透明贴图探针截图）：**格式全支持**——`Image`/`Button.skin`/`Panel.skin` 都让真 alpha
//   原生透出底层（浏览器合成 PNG RGBA·渲染层零强塞不透明底）；「不太对」只可能是两件事之一：
//   ① 素材源头是「假透明」（烤了棋盘格/白底·非真 alpha）→ 抠图（/api/assets/matte·rembg）没真做；
//   ② 贴在 `PlayingCard.faceArt` 这类**自带不透明面色**的载体上（卡有卡面·cutout 透出的是卡面色·非牌桌）——设计如此。
// 本测把上述行为逐条钉死：改渲染器若给透明贴图强塞不透明底 → 此处红（防静默回归·manifesto「确定性可回归」）。
import { describe, it, expect } from 'vitest';
import { renderNode } from './index.js';
import type { LayoutNode } from './index.js';
import { apolloOnyx as T } from './apollo-kit.js';

// 短假 data-URI（safeUrl 不剥 base64 的 /+=·此串无引号/括号/空白·原样存活）。
const PNG = 'data:image/png;base64,AAAA';

// 取某 id 元素的 inline style（渲染产物是纯串·无需真 DOM）。
function styleOf(html: string, id: string): string {
  const m = new RegExp(`id="${id}"[^>]*style="([^"]*)"`).exec(html);
  return m ? m[1] : '';
}
// 最后一条 background 声明后的内容（CSS 后者胜出=真正生效的那层）。
// 注：data-URI 内含 `;base64,`，但声明边界是 `;background:`——`background:` 本身不出现在 URI 里，故按它切分安全。
function afterLastBackground(style: string): string {
  const parts = style.split('background:');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

describe('透明 alpha 贴图 · 渲染层守卫（真 alpha 透出·零强塞不透明底）', () => {
  it('Image：只出 <img src>·inline style 零 background —— alpha 由浏览器原生合成透出底层', () => {
    const html = renderNode({ type: 'Image', id: 'im', props: { src: PNG }, layout: { width: 96, height: 96 } }, T);
    expect(html).toContain(`<img id="im"`);
    expect(html).toContain(`src="${PNG}"`);
    // 图元自身不画任何底 → 透明处透出其后一切（页面/牌桌/面板）。塞了 background 即回归。
    expect(/background/.test(styleOf(html, 'im'))).toBe(false);
  });

  it('Button.skin(cover)：皮 background:url 放样式末尾覆盖 kind 底 —— 生效底=贴图本身（透明透出父层）', () => {
    const html = renderNode({ type: 'Button', id: 'bt', props: { label: '', kind: 'hero', skin: PNG } }, T);
    const style = styleOf(html, 'bt');
    expect(style).toContain(`background:url('${PNG}') center/cover no-repeat`);
    // 末条 background 必须是贴图 url（若谁在皮后再塞不透明底盖住 alpha → 此处红）。
    expect(afterLastBackground(style).startsWith(`url('${PNG}') center/cover no-repeat`)).toBe(true);
  });

  it('Panel.skin(cover)：整面 art 覆盖·border:0·末条 background=贴图 url —— 透明处透出父层', () => {
    const html = renderNode(
      { type: 'Panel', id: 'pn', props: { skin: PNG }, layout: { width: 96, height: 96 } } as LayoutNode,
      T,
    );
    const style = styleOf(html, 'pn');
    expect(style).toContain(`background:url('${PNG}') center/cover no-repeat`);
    expect(afterLastBackground(style).startsWith(`url('${PNG}') center/cover no-repeat`)).toBe(true);
  });

  it('bare Panel + bgTexture：底层是 transparent（非主题 fill）—— 平铺透明贴图透出其后', () => {
    const html = renderNode(
      { type: 'Panel', id: 'bp', props: { bare: true, bgTexture: PNG }, layout: { width: 96, height: 96 } } as LayoutNode,
      T,
    );
    const style = styleOf(html, 'bp');
    expect(style).toContain('transparent'); // bare 面不塞主题底 → 贴图透明处透出父层
  });

  it('PlayingCard.faceArt：cutout **叠在卡面不透明底之上**（设计如此·非 bug）——卡有卡面·透出卡色非牌桌', () => {
    const html = renderNode({ type: 'PlayingCard', id: 'pc', props: { rank: 'A', suit: 'spades', faceArt: PNG } }, T);
    // faceArt 覆盖层：绝对定位铺满 + cover。
    expect(html).toContain(`src="${PNG}"`);
    expect(html).toContain('object-fit:cover');
    // 卡根自带不透明面色（faceBg）——这就是「放卡上透出的是卡面色、不是桌面」的原因（钉死此设计语义）。
    expect(/background:[^;]+/.test(styleOf(html, 'pc'))).toBe(true);
  });
});
