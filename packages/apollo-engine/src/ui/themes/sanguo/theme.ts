// 三国自走棋壳层皮肤主题（数据）—— 从 game-f.tsx 外提。
// 锦霞 Aurora(暖) / 玄铁 Onyx(暗) 两皮 + 共享水墨战场 + 凤羽 SVG。主题=数据：换皮只换 token，
// game-f.tsx 只 import 不内联（对齐 game-b 的 sakuraOtomeTheme 范式：主题在 src/ui/themes/，游戏只消费）。

// —— 三国战场场景（用户：全面提升品质，战场别再平板）——水墨远山 3 层 + 天光 + 蜀红/魏蓝旌旗。
// 雾蓝中性色 → 锦霞(暖)/玄铁(暗)两皮都读得出；半透明叠在主题天地渐变上（--battlefield）。
export const BATTLEFIELD =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1280 720' preserveAspectRatio='xMidYMid slice'>" +
  "<circle cx='640' cy='190' r='95' fill='rgba(255,238,205,0.10)'/><circle cx='640' cy='190' r='160' fill='rgba(255,238,205,0.05)'/>" +
  "<path d='M0 720 L0 350 C180 295 360 345 540 315 C720 285 900 340 1080 312 C1180 298 1240 328 1280 318 L1280 720 Z' fill='rgba(132,150,182,0.10)'/>" +
  "<path d='M0 720 L0 425 C220 372 420 415 640 388 C840 365 1040 410 1280 384 L1280 720 Z' fill='rgba(110,130,165,0.15)'/>" +
  "<path d='M0 720 L0 505 C260 472 560 505 820 488 C1020 476 1160 500 1280 492 L1280 720 Z' fill='rgba(88,108,145,0.20)'/>" +
  "<g opacity='0.55'><rect x='86' y='150' width='6' height='230' rx='3' fill='rgba(70,60,55,0.55)'/><path d='M92 160 L176 180 L92 206 Z' fill='rgba(190,72,70,0.5)'/></g>" +
  "<g opacity='0.55'><rect x='1188' y='150' width='6' height='230' rx='3' fill='rgba(70,60,55,0.55)'/><path d='M1188 160 L1104 180 L1188 206 Z' fill='rgba(70,118,190,0.5)'/></g>" +
  "</svg>";
export const BF_URI = `url("data:image/svg+xml,${encodeURIComponent(BATTLEFIELD)}")`;

// —— 锦霞（Aurora）tokens（README 表格锦霞列原值）——
export const AURORA = `
  --app-bg: radial-gradient(120% 120% at 50% -10%, #fdf4ee 0%, #f3e2dc 60%, #ecd6cf 100%);
  --panel-grad: linear-gradient(180deg,#fffdfa,#fbeee4);
  --panel-border: #e3c896;
  --hairline: rgba(216,164,78,.4);
  --chip-bg: rgba(255,255,255,.55);
  --seg-track: #f3e3d4; --seg-edge: #e3c896;
  --track: rgba(150,110,90,.18);
  --ink: #5a3f44; --ink-dim: #a98b8f;
  --accent: #d8607b;
  --accent-grad: linear-gradient(180deg,#e887a0,#cf5070);
  --accent-soft: rgba(216,96,123,.16);
  --accent-ink: #fff;
  --gold: #cf9a3f; --seal-edge: #d8a44e;
  --success: #54ad8e; --warning: #e0a94e; --danger: #d65668; --info: #8aa0e6;
  --hp:#54ad8e; --mp:#8aa0e6; --xp:#c98fc4;
  --radius: 14px; --btn-radius: 16px; --radius-lg: 20px;
  --btn-bg: linear-gradient(180deg,#fffaf4,#fbece1); --btn-edge: #ecd3b2; --btn-text: #6a4a4f;
  --hud-bg: linear-gradient(180deg,rgba(255,250,244,.96),rgba(251,238,229,.9));
  --dock-bg: linear-gradient(180deg,rgba(255,250,244,.72),rgba(250,236,225,.98));
  --gold-chip: rgba(207,154,63,.12);
  --platform-bg: radial-gradient(120% 90% at 50% 35%, #fff8f0, #f0ddcb 70%);
  --platform-glow: radial-gradient(70% 60% at 50% 45%, rgba(216,96,123,.08), transparent 70%);
  --battlefield: ${BF_URI}, radial-gradient(120% 95% at 50% 18%, #fbe9da 0%, #f2d6c5 48%, #e6c6b6 78%, #dcb8a8 100%);
  --platform-edge: #e3c896;
  --hex-fill: linear-gradient(180deg,#fff8f0,#f6e7d8); --hex-stroke: #e0c79c;
  --hex-fill-e: linear-gradient(180deg,#f7ece2,#f0ddce); --hex-stroke-e: #dcc09a;
  --protag-bg: radial-gradient(circle at 35% 30%, #fff0d8, #e0a96d);
  --ready-bg: linear-gradient(180deg,#ec9f6f,#d77a86); --ready-text: #fff;
  --ready-shadow: 0 8px 24px rgba(208,120,120,.4), inset 0 1px 0 rgba(255,255,255,.6);
  --cost1:#b0a496; --cost2:#62b594; --cost3:#7aa1dd; --cost4:#c189d2; --cost5:#dba94e; --star:#dba94e;
  --font-cjk: 'Noto Serif SC', serif;
  --texture: radial-gradient(circle, rgba(201,148,72,.16) 1px, transparent 1.7px) 0 0/26px 26px,
    radial-gradient(circle, rgba(216,96,123,.10) 1px, transparent 1.6px) 13px 13px/26px 26px,
    repeating-linear-gradient(45deg, rgba(201,148,72,.07) 0 1px, transparent 1px 26px),
    repeating-linear-gradient(-45deg, rgba(201,148,72,.07) 0 1px, transparent 1px 26px);
  --font-display: 'Ma Shan Zheng', 'Noto Serif SC', serif;
  --font-heading: 'Cormorant Garamond', 'Noto Serif SC', serif;
  --font-body: 'Noto Serif SC', serif;
  --font-num: 'Silkscreen', monospace;
`;
// —— 玄铁（Onyx）tokens（README 玄铁列；壳层皮肤切换备用）——
export const ONYX = `
  --app-bg: radial-gradient(120% 120% at 50% -10%, #1a2230 0%, #0a0d12 55%, #06080b 100%);
  --panel-grad: linear-gradient(180deg,#1c2531,#121821);
  --panel-border: #33404f;
  --hairline: rgba(255,214,150,.12);
  --chip-bg: rgba(255,255,255,.05);
  --seg-track: #161d27; --seg-edge: #2c313b;
  --track: rgba(0,0,0,.5);
  --ink: #e7edf3; --ink-dim: #7e8c9b;
  --accent: #ff5d2e;
  --accent-grad: linear-gradient(180deg,#ff7a45,#ee4515);
  --accent-soft: rgba(255,93,46,.18);
  --accent-ink: #1c0d06;
  --gold: #ffcb3d; --seal-edge: #caa24e;
  --success: #46d17a; --warning: #ffb24a; --danger: #ff404f; --info: #37b6ff;
  --hp:#46d17a; --mp:#37b6ff; --xp:#c184ff;
  --radius: 4px; --btn-radius: 12px; --radius-lg: 8px;
  --btn-bg: linear-gradient(180deg,#283341,#1a222c); --btn-edge: #3d4b5b; --btn-text: #dfe7ef;
  --hud-bg: linear-gradient(180deg,rgba(22,28,37,.95),rgba(14,18,24,.88));
  --dock-bg: linear-gradient(180deg,rgba(18,23,31,.7),rgba(10,13,18,.97));
  --gold-chip: rgba(255,203,61,.1);
  --platform-bg: radial-gradient(120% 90% at 50% 35%, #1a2531, #0c1117 70%);
  --platform-glow: radial-gradient(70% 60% at 50% 45%, rgba(255,93,46,.08), transparent 70%);
  --battlefield: ${BF_URI}, radial-gradient(120% 95% at 50% 18%, #213044 0%, #16202e 48%, #0e1620 78%, #090e15 100%);
  --platform-edge: #33404f;
  --hex-fill: linear-gradient(180deg,#1d2733,#141b25); --hex-stroke: #3b4a5a;
  --hex-fill-e: linear-gradient(180deg,#26303d,#1a2230); --hex-stroke-e: #46566a;
  --protag-bg: radial-gradient(circle at 35% 30%, #ffe08a, #d98a2b);
  --ready-bg: linear-gradient(180deg,#ff7a45,#e8420f); --ready-text: #1c0d06;
  --ready-shadow: 0 0 22px rgba(255,93,46,.5), inset 0 1px 0 rgba(255,255,255,.4);
  --cost1:#97a4b2; --cost2:#37c46e; --cost3:#3a9bff; --cost4:#bf6bff; --cost5:#ffb024; --star:#ffd34a;
  --font-cjk: 'Noto Sans SC', sans-serif;
  --texture: repeating-linear-gradient(45deg, rgba(135,175,215,.055) 0 1px, transparent 1px 9px),
    repeating-linear-gradient(-45deg, rgba(135,175,215,.045) 0 1px, transparent 1px 9px),
    repeating-linear-gradient(45deg, rgba(255,93,46,.03) 0 2px, transparent 2px 42px);
  --font-display: 'Zhi Mang Xing', 'Noto Sans SC', serif;
  --font-heading: 'Rajdhani', 'Noto Sans SC', sans-serif;
  --font-body: 'Noto Sans SC', sans-serif;
  --font-num: 'Silkscreen', monospace;
`;

// 凤羽卷草转角纹饰（design_handoff 商城源内 phoenixSvg 原样）。
export const PHOENIX =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke="#cf9a3f" stroke-width="1.7" stroke-linecap="round"><path d="M7 58 C7 30 19 9 52 7"/><path d="M12 46 C20 33 33 25 50 20"/><path d="M9 52 C18 38 33 28 54 15"/><path d="M30 14 q7 -6 16 -6 M40 21 q7 -4 15 -1"/><circle cx="54" cy="9" r="2.6" fill="#d8607b" stroke="none"/></g></svg>';
export const PHOENIX_URI = `url("data:image/svg+xml,${encodeURIComponent(PHOENIX)}")`;

import type { GameTheme } from '../theme.types.js';

// 三国「锦霞」GameTheme（数据）：把局内壳层 token 收成 GameShell 可消费的对象。
// game-f 采用 GameShell（局外大厅/局内 HUD/商店）即喂这份；换玄铁皮=另出一份对象。
// 色板取自 AURORA 锦霞列（绢帛暖米底 + 墨字 + 朱印/描金 accent + 蜀绿/魏蓝语义色）。
export const sanguoTheme: GameTheme = {
  tokens: {
    name: 'sanguo-aurora',
    displayName: '锦霞·三国',
    bg: '#f3e9d6',
    bgSecondary: '#ece0c8',
    text: '#23262d',
    textSecondary: '#6a6256',
    accent: '#b5402f',
    accentHover: '#c75a3f',
    border: '#cdbb98',
    shadow: 'rgba(80,55,30,0.18)',
    success: '#2f9e7e',
    warning: '#c9a24e',
    danger: '#d65668',
    info: '#3a6ea5',
    fontFamily: "'Noto Serif SC', serif",
    fontSizeBase: '14px',
    fontSizeLg: '20px',
    fontSizeSm: '11px',
    lineHeight: '1.5',
    borderRadius: '12px',
    borderWidth: '1px',
    spacing: '12px',
    glowColor: 'rgba(201,162,78,0.3)',
    backdropBlur: '5px',
  },
  components: {
    healthBar: { height: '10px', fillColor: '#d65668', depletedColor: 'rgba(35,38,45,0.12)', animationDuration: '0.25s' },
    button: { paddingX: '16px', paddingY: '10px', hoverScale: '1.02', activeScale: '0.97' },
    panel: { padding: '12px', maxWidth: '260px', headerHeight: '26px' },
    dialog: { maxWidth: '520px', typingSpeed: '24ms', nameTagPosition: 'top-left' },
    toast: { position: 'bottom', duration: '2s' },
  },
};
