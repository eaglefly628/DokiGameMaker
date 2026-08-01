// Game I · 主题令牌包（换皮演示用）。
//
// 红线：游戏/测试场只填 UITheme 令牌（颜色/字体字符串，最弱 LLM 能填），
// 不写 CSS/DOM。同一棵 LayoutNode + 不同令牌包 = 换皮（数据驱动·零改解释器）。

import { SHELL } from '@ui/shell-theme.js';
import { apolloToon } from '@ui/apollo-toon-theme.js';
import type { UITheme } from '@ui/components/index.js';

export { apolloToon };

/** 引擎缺省脸「青瓷·墨蓝」——直接取 SHELL 的 UITheme 子集。 */
export const onyx: UITheme = {
  bg0: SHELL.bg0, bg1: SHELL.bg1, bg2: SHELL.bg2, bg3: SHELL.bg3, pageBg: SHELL.pageBg,
  line: SHELL.line,
  text: SHELL.text, sub: SHELL.sub, dim: SHELL.dim,
  jade: SHELL.jade, jadeWash: SHELL.jadeWash, jadeLine: SHELL.jadeLine,
  gold: SHELL.gold,
  ok: SHELL.ok, okWash: SHELL.okWash, warn: SHELL.warn, warnWash: SHELL.warnWash, danger: SHELL.danger,
  fontUi: SHELL.fontUi, fontMono: SHELL.fontMono,
};

/** 暖金·锦缎——证明同一份控件数据换一套令牌即变脸。 */
export const brocade: UITheme = {
  bg0: '#140d06', bg1: '#1c1308', bg2: '#241a0c', bg3: '#2e2210',
  pageBg: 'linear-gradient(180deg, #140d06 0%, #1f1505 100%)',
  line: 'rgba(214,184,122,0.14)',
  text: '#f3e9d6', sub: '#c2a878', dim: '#8a7448',
  jade: '#e0b964', jadeWash: 'rgba(224,185,100,0.12)', jadeLine: 'rgba(224,185,100,0.40)',
  gold: '#f2cf7a',
  ok: '#9fc98a', okWash: 'rgba(159,201,138,0.12)',
  warn: '#e0b964', warnWash: 'rgba(224,185,100,0.12)', danger: '#d98a6a',
  fontUi: SHELL.fontUi, fontMono: SHELL.fontMono,
};

/** 冷雾·素白——第三套对照（浅底高对比）。 */
export const frost: UITheme = {
  bg0: '#0d1014', bg1: '#121821', bg2: '#18202c', bg3: '#212b3a',
  pageBg: 'linear-gradient(180deg, #0d1014 0%, #141c28 100%)',
  line: 'rgba(180,200,224,0.14)',
  text: '#eef3fa', sub: '#9fb0c6', dim: '#5f6e84',
  jade: '#7fc7e8', jadeWash: 'rgba(127,199,232,0.12)', jadeLine: 'rgba(127,199,232,0.40)',
  gold: '#cfd8e6',
  ok: '#7fd6a8', okWash: 'rgba(127,214,168,0.12)',
  warn: '#e6c574', warnWash: 'rgba(230,197,116,0.12)', danger: '#e88a8a',
  fontUi: SHELL.fontUi, fontMono: SHELL.fontMono,
};

/** 晴·云白——亮色皮（浅底深字·区别于前三套暗皮）。亮皮须设 inputBg 浅色，否则输入框深底深字看不清。 */
export const daylight: UITheme = {
  bg0: '#dde4ee', bg1: '#f4f7fc', bg2: '#ffffff', bg3: '#e7edf6',
  pageBg: 'linear-gradient(180deg, #eef3fa 0%, #dde6f1 100%)',
  line: 'rgba(28,48,80,0.16)',
  text: '#1b2434', sub: '#46546a', dim: '#8893a6',
  jade: '#138a76', jadeWash: 'rgba(19,138,118,0.12)', jadeLine: 'rgba(19,138,118,0.42)',
  gold: '#b07d22',
  ok: '#2e9b5b', okWash: 'rgba(46,155,91,0.14)',
  warn: '#c2871c', warnWash: 'rgba(194,135,28,0.14)', danger: '#cf513c',
  inputBg: '#ffffff',
  fontUi: SHELL.fontUi, fontMono: SHELL.fontMono,
};

/** 紫·霓晶——紫罗兰暗皮（jade 令牌当主强调色=紫）。 */
export const amethyst: UITheme = {
  bg0: '#0e0a18', bg1: '#161023', bg2: '#1f1730', bg3: '#2a2040',
  pageBg: 'linear-gradient(180deg, #0e0a18 0%, #181029 100%)',
  line: 'rgba(184,150,232,0.16)',
  text: '#ece6f7', sub: '#b9a9d6', dim: '#7a6b97',
  jade: '#b48be6', jadeWash: 'rgba(180,139,230,0.14)', jadeLine: 'rgba(180,139,230,0.42)',
  gold: '#dca0e8',
  ok: '#86d6a8', okWash: 'rgba(134,214,168,0.12)',
  warn: '#e6c574', warnWash: 'rgba(230,197,116,0.12)', danger: '#e8889a',
  fontUi: SHELL.fontUi, fontMono: SHELL.fontMono,
};

/** 青林·墨绿——森绿暗皮。 */
export const forest: UITheme = {
  bg0: '#08120c', bg1: '#0d1a12', bg2: '#122418', bg3: '#193024',
  pageBg: 'linear-gradient(180deg, #08120c 0%, #0e1c14 100%)',
  line: 'rgba(150,200,162,0.15)',
  text: '#e6f2e9', sub: '#a6c4b0', dim: '#688574',
  jade: '#5fc98a', jadeWash: 'rgba(95,201,138,0.13)', jadeLine: 'rgba(95,201,138,0.40)',
  gold: '#d6c074',
  ok: '#7fd6a0', okWash: 'rgba(127,214,160,0.12)',
  warn: '#e0c06e', warnWash: 'rgba(224,192,110,0.12)', danger: '#e0876a',
  fontUi: SHELL.fontUi, fontMono: SHELL.fontMono,
};

/** 绯樱·玫瑰——玫瑰粉暗皮（jade 令牌=玫红主强调）。 */
export const sakura: UITheme = {
  bg0: '#160a10', bg1: '#1e0f17', bg2: '#28151e', bg3: '#341d28',
  pageBg: 'linear-gradient(180deg, #160a10 0%, #1f0f18 100%)',
  line: 'rgba(230,160,190,0.16)',
  text: '#f7e6ee', sub: '#d6a9bd', dim: '#9a6b80',
  jade: '#e88aa8', jadeWash: 'rgba(232,138,168,0.14)', jadeLine: 'rgba(232,138,168,0.42)',
  gold: '#e6b86a',
  ok: '#9fd6a8', okWash: 'rgba(159,214,168,0.12)',
  warn: '#e6c574', warnWash: 'rgba(230,197,116,0.12)', danger: '#e87a7a',
  fontUi: SHELL.fontUi, fontMono: SHELL.fontMono,
};

// 注册表保留全部主题（换皮下拉外仍可用·测试仍引用 brocade/frost 等）——收敛只摘选单、不删码。
export const THEMES: Record<string, UITheme> = { 'apollo-toon': apolloToon, onyx, brocade, frost, daylight, amethyst, forest, sakura };
// 换皮选单收敛到 3 个（owner 2026-07-16 拍板·styleset M0.5）：apollo-toon 置顶 + 默认青瓷·墨蓝 + 一深色对照。
// 其余（暖金/冷雾/晴云白/青林/绯樱）从选单隐藏**不删码**——注释保留、可随时回。
export const THEME_OPTIONS = [
  { value: 'apollo-toon', label: '水墨玩趣' },
  { value: 'onyx', label: '青瓷·墨蓝' },
  { value: 'amethyst', label: '紫·霓晶' },
  // ── owner 2026-07-16 收敛·隐藏不删（去掉行首注释即恢复选单）──
  // { value: 'brocade', label: '暖金·锦缎' },
  // { value: 'frost', label: '冷雾·靛蓝' },
  // { value: 'daylight', label: '晴·云白（亮）' },
  // { value: 'forest', label: '青林·墨绿' },
  // { value: 'sakura', label: '绯樱·玫瑰' },
];
