// @vitest-environment happy-dom
// ZeroCraft Kit 基座 + 分层贴图底 / UV 滚动能力（owner 2026-06-25：把 game-f 的 Cloud Design 皮升格引擎基座）。
//   · UITheme.texture/wash → renderScreen 合成「wash , texture , 底色」三层（无则纯底色·老主题零变化）。
//   · Screen/Panel.bgScroll → mountUI 注入逐元素滚动关键帧（滚动 UI 特效）。
//   · apolloOnyx/apolloBrocade = 从 ZeroCraft UI Kit 交底映射出的真 UITheme（玄铁/锦霞双皮）。
import { describe, it, expect } from 'vitest';
import { renderNode, mountUI, apolloOnyx, apolloBrocade } from './index.js';
import { SHELL } from '../shell-theme.js';
import type { LayoutNode, UITheme } from './index.js';

describe('UI Components · 分层贴图底（UITheme texture/wash · renderScreen 合成）', () => {
  const tex: UITheme = { ...SHELL, texture: 'repeating-linear-gradient(45deg,#111 0 1px,transparent 1px 9px)', wash: 'radial-gradient(50% 50%,#222,transparent)' };

  it('有 texture/wash → background 合成「wash , texture , 底色」三层', () => {
    const html = renderNode({ type: 'Screen', id: 's', props: {}, children: [] }, tex);
    expect(html).toContain('repeating-linear-gradient(45deg,#111 0 1px,transparent 1px 9px)'); // texture 层
    expect(html).toContain('radial-gradient(50% 50%,#222,transparent)');                       // wash 层
    expect(html).toContain(SHELL.pageBg);                                                        // 底色层
    // 顺序：wash 在 texture 前、texture 在底色前
    const bg = html.slice(html.indexOf('background:'));
    expect(bg.indexOf('radial-gradient(50% 50%')).toBeLessThan(bg.indexOf('repeating-linear-gradient(45deg,#111'));
  });

  it('无 texture/wash（SHELL）→ 纯底色，老主题零变化', () => {
    const html = renderNode({ type: 'Screen', id: 's', props: {}, children: [] }, SHELL);
    expect(html).toContain(`background:${SHELL.pageBg};`); // 仍是单层纯底色
    expect(html).not.toContain('repeating-linear-gradient');
  });
});

describe('UI Components · bgScroll UV 背景滚动（mountUI 注入关键帧）', () => {
  it('Screen.bgScroll → 元素得 animation + 注入 @keyframes（平移 background-position）', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const tree: LayoutNode = { type: 'Screen', id: 'scr', props: { bgScroll: { x: 26, y: 0, ms: 4000 } }, children: [] };
    const teardown = mountUI(host, tree, {}, apolloOnyx);
    const el = host.querySelector('#scr') as HTMLElement;
    expect(el.style.animation).toMatch(/apollo-bgs-\d+ 4000ms linear infinite/);
    const kf = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').join('');
    expect(kf).toContain('background-position:26px 0px'); // 注入的滚动关键帧
    teardown();
    // teardown 后注入的 style 被移除
    const after = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').join('');
    expect(after).not.toContain('background-position:26px 0px');
    host.remove();
  });

  it('无 bgScroll → 不注入动画（不回归）', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const teardown = mountUI(host, { type: 'Screen', id: 's2', props: {}, children: [] }, {}, apolloOnyx);
    expect((host.querySelector('#s2') as HTMLElement).style.animation).toBe('');
    teardown(); host.remove();
  });
});

describe('UI Components · bgTexture 图片贴图层（平铺·Screen/Panel·三路并存）', () => {
  it('Screen.bgTexture → background 含平铺图层（url repeat）+ bgTextureSize 控单元尺寸', () => {
    const html = renderNode({ type: 'Screen', id: 's', props: { bgTexture: '/paper.png', bgTextureSize: 48 }, children: [] }, SHELL);
    expect(html).toContain("url('/paper.png') 0 0 / 48px repeat");
  });

  it('三路并存：程序化(theme.texture) + 平铺图片(bgTexture) + cover 整图(image) 同时表达', () => {
    const tex: UITheme = { ...SHELL, texture: 'repeating-linear-gradient(45deg,#111 0 1px,transparent 1px 9px)' };
    const html = renderNode({ type: 'Screen', id: 's', props: { bgTexture: '/grain.png', image: '/photo.jpg' }, children: [] }, tex);
    expect(html).toContain("url('/grain.png')");                       // 平铺图片层
    expect(html).toContain('repeating-linear-gradient(45deg,#111');     // 程序化纹理层
    expect(html).toContain("background-image:url('/photo.jpg')");       // cover 整图（覆盖层）
    // 顺序：wash/bgTexture 在 theme.texture 前（合成串里平铺图片层先于程序化纹理）
    const bg = html.slice(html.indexOf('background:'));
    expect(bg.indexOf("url('/grain.png')")).toBeLessThan(bg.indexOf('repeating-linear-gradient(45deg,#111'));
  });

  it('Panel.bgTexture → 平铺图层叠在面板底上；bare + 贴图 → 只铺贴图、仍无框', () => {
    const normal = renderNode({ type: 'Panel', id: 'p', props: { bgTexture: '/wood.png' }, children: [] }, SHELL);
    expect(normal).toContain("url('/wood.png')"); expect(normal).toContain('border:1px solid');
    const bare = renderNode({ type: 'Panel', id: 'pb', props: { bare: true, bgTexture: '/wood.png' }, children: [] }, SHELL);
    expect(bare).toContain("url('/wood.png') 0 0 repeat, transparent"); // 贴图 over transparent
    expect(bare).not.toContain('border:1px solid');                      // 仍无框
  });

  it('bgTexture + bgScroll 共存（平铺贴图可被 UV 滚动）', () => {
    const html = renderNode({ type: 'Screen', id: 's', props: { bgTexture: '/grain.png', bgScroll: { x: 32, y: 0 } }, children: [] }, SHELL);
    expect(html).toContain("url('/grain.png')");
    expect(html).toContain('data-bgscroll="32,0,6000"');
  });

  it('bgTexture 注入硬化：引号/括号/空白被剥离，无法逃出 url(...)', () => {
    const html = renderNode({ type: 'Screen', id: 's', props: { bgTexture: "x'); background:url(evil" }, children: [] }, SHELL);
    expect(html).not.toContain("');");      // 无法闭合 url(' 逃出
    expect(html).not.toContain('url(evil'); // 括号被剥离 → 注入失败
    expect(html).toContain("url('x;background:urlevil')"); // 净化成无害串
  });
});

describe('UI Components · ZeroCraft Kit 双皮主题（玄铁 onyx / 锦霞 brocade）', () => {
  it('apolloOnyx：暗墨蓝底 + 程序化交叉纹 texture + 熔岩橙主色', () => {
    expect(apolloOnyx.texture).toContain('repeating-linear-gradient');
    expect(apolloOnyx.wash).toContain('radial-gradient');
    expect(apolloOnyx.jade).toBe('#ff5d2e'); // 主强调色槽 = 熔岩橙
    const html = renderNode({ type: 'Screen', id: 's', props: {}, children: [{ type: 'Label', id: 'l', props: { text: '玄铁' } }] }, apolloOnyx);
    expect(html).toContain('玄铁'); expect(html).toContain('rgba(135,175,215'); // 钢蓝交叉纹进了底
  });

  it('apolloBrocade：暖白底 + 波点纹 + 玫瑰主色（亮皮·换皮即切）', () => {
    expect(apolloBrocade.texture).toContain('radial-gradient(circle'); // 波点
    expect(apolloBrocade.jade).toBe('#d8607b');
    const html = renderNode({ type: 'Screen', id: 's', props: {}, children: [] }, apolloBrocade);
    expect(html).toContain('#fdf4ee'); // 暖白底渐变
  });
});
