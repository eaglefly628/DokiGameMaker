// ZeroCraft UI Kit —— 引擎基座主题（owner 2026-06-25：把 Cloud Design 给 game-f 的那套皮升格为引擎可复用基座）。
//
// 来源：src/games/game-f/doc/design_handoff_game_f/designs/ZeroCraft UI Kit.dc.html（玄铁 onyx / 锦霞 brocade 双皮）。
// 把交底里的 CSS 令牌映射进引擎 UITheme 形状；背景走**分层合成**(wash , texture , app-bg)——
// texture 为程序化 CSS 纹理（玄铁=斜向交叉细纹·锦霞=波点+交叉纹），零资产、随主题缩放。
// 用法：mountUI(host, tree, handlers, apolloOnyx)。配 Screen.bgScroll 可做滚动底纹特效。

import type { UITheme } from './types.js';

/** 玄铁 Vanguard —— 暗黑金属硬核（墨蓝近黑底 + 钢蓝交叉细纹 + 熔岩橙点睛）。引擎基座默认偏好此暗皮。 */
export const apolloOnyx: UITheme = {
  bg0: '#070e17', bg1: '#0f1b29', bg2: '#1a2a3c', bg3: '#22384e',
  pageBg: 'radial-gradient(120% 120% at 50% -8%, #1d2d42 0%, #0f1b29 55%, #070e17 100%)',
  texture: 'repeating-linear-gradient(45deg, rgba(135,175,215,.05) 0 1px, transparent 1px 9px), repeating-linear-gradient(-45deg, rgba(135,175,215,.04) 0 1px, transparent 1px 9px)',
  wash: 'radial-gradient(120% 85% at 28% 8%, rgba(82,120,158,.22), transparent 55%), radial-gradient(100% 80% at 88% 100%, rgba(8,14,24,.5), transparent 55%)',
  line: 'rgba(232,205,138,.24)',
  text: '#e7edf3', sub: '#7e8c9b', dim: '#56657a',
  jade: '#ff5d2e', jadeWash: 'rgba(255,93,46,.18)', jadeLine: 'rgba(255,93,46,.42)', // 主色=熔岩橙 accent（UITheme 的 jade 槽即"主强调色"）
  gold: '#ffcb3d',
  ok: '#46d17a', okWash: 'rgba(70,209,122,.14)', warn: '#ffb24a', warnWash: 'rgba(255,178,74,.14)', danger: '#ff404f',
  fontUi: "'Noto Sans SC', -apple-system, 'Segoe UI', sans-serif",
  fontMono: "'Silkscreen', ui-monospace, monospace",
  fontPixel: "'Silkscreen', 'DotGothic16', ui-monospace, monospace", // 像素槽（REQ-UI-fontPixel令牌）
};

/** 锦霞 Aurora —— 宫廷锦绣（暖白底 + 金/胭脂波点纹 + 玫瑰点睛）。亮皮。 */
export const apolloBrocade: UITheme = {
  bg0: '#ecd6cf', bg1: '#f3e2dc', bg2: '#fffaf3', bg3: '#ffffff',
  pageBg: 'radial-gradient(120% 120% at 50% -10%, #fdf4ee 0%, #f3e2dc 60%, #ecd6cf 100%)',
  texture: 'radial-gradient(circle, rgba(201,148,72,.16) 1px, transparent 1.7px) 0 0 / 26px 26px, radial-gradient(circle, rgba(216,96,123,.10) 1px, transparent 1.6px) 13px 13px / 26px 26px, repeating-linear-gradient(45deg, rgba(201,148,72,.07) 0 1px, transparent 1px 26px), repeating-linear-gradient(-45deg, rgba(201,148,72,.07) 0 1px, transparent 1px 26px)',
  wash: 'radial-gradient(120% 85% at 28% 8%, rgba(216,170,120,.18), transparent 55%), radial-gradient(100% 80% at 88% 100%, rgba(216,150,160,.12), transparent 55%)',
  line: 'rgba(207,154,63,.5)',
  inputBg: 'rgba(255,255,255,0.6)', // 亮皮：浅输入底（否则深默认底 + 暗字看不清）
  text: '#5a3f44', sub: '#a98b8f', dim: '#bfa0a4',
  jade: '#d8607b', jadeWash: 'rgba(216,96,123,.16)', jadeLine: 'rgba(216,96,123,.42)', // 主色=胭脂玫瑰
  gold: '#cf9a3f',
  ok: '#54ad8e', okWash: 'rgba(84,173,142,.14)', warn: '#e0a94e', warnWash: 'rgba(224,169,78,.14)', danger: '#d65668',
  fontUi: "'Noto Serif SC', Georgia, serif",
  fontMono: "'Silkscreen', ui-monospace, monospace",
  fontPixel: "'Silkscreen', 'DotGothic16', ui-monospace, monospace", // 像素槽（REQ-UI-fontPixel令牌）
};

/** 双皮成对导出（换皮：同一份 LayoutNode 数据切 onyx/brocade 即得两套脸）。 */
export const APOLLO_KIT = { onyx: apolloOnyx, brocade: apolloBrocade } as const;
