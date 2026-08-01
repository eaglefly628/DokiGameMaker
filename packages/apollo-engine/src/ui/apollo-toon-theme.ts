// ZeroCraft Toon · 「水墨玩趣」house-style 主题（REQ-STYLESET M0.5 现装可视版·PUI）
//
// 混风定稿（styleset 图纸 §六·风格锚 apollo-toon）：迪士尼圆润亲和 × Supercell 厚底唇糖果 3D 钮 × 中国水墨纸纹/笔触边。
// **全部由既有 UITheme 闭集令牌 + 程序化 data-URI 皮表达**——零新控件、render-only、确定性（无裸随机·encodeURIComponent 一次）。
// 占位真相：程序化皮=needs-art 占位，真 key 后逐行文生图替换（M2·provenance:procedural）。
//
// 8 色板（图纸 §六）：宣纸 #F6F0E2 / 墨 #2C2C34 / 黛青 #345C68 / 竹青 #55B08E / 朱砂 #D8503F / 缃金 #EBB54D / 天青 #7FC4D8 / 藕紫 #8A5A7A。
// 亮皮取色纪律：文字色令牌（gold/ok/warn/danger…）取「可读的深色变体」压在宣纸上（对比度达标·用 token 解决·非点补 CSS）；
//   鲜亮 8 色只进「按钮皮填充 / 背景水墨」这类大色块。

import { SHELL } from '@ui/shell-theme.js';
import type { UITheme } from '@ui/components/index.js';

// ── 8 色板锚（鲜亮·用于皮/背景大色块）─────────────────────────────
const C = {
  paper: '#F6F0E2', ink: '#2C2C34', teal: '#345C68', bamboo: '#55B08E',
  vermilion: '#D8503F', gold: '#EBB54D', sky: '#7FC4D8', lotus: '#8A5A7A',
} as const;

// data-URI 编码（确定性·一次求值）：encodeURIComponent 把 <>"空格/#… 转 %XX，但**故意保留** ' ( ) *~! 不转——
// 而 render.ts 的 skinCss→safeUrl 恰会剥离 '"()\ 空白、CSS url() 又不许内含裸括号 → 补一步把残留 ' ( ) 也转 %XX，
// 使皮/背景/纸纹在「safeUrl 净化」「裸插 CSS url()」「双引号 style 属性」三种落点全安全存活。SVG 属性一律双引号（→%22）。
const dataUri = (svg: string): string =>
  `data:image/svg+xml,${encodeURIComponent(svg).replace(/[()']/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;

// ── 程序化糖果厚底唇钮皮（64×64·9-slice slice=12·圆胖圆角 r12 + 顶高光带 + 厚底唇 + 墨笔触边）──
// 结构（自下而上）：厚底唇底座（深色·下探 6px 露唇）→ 渐变糖体（顶亮→中身→底深）+ 墨色描边（笔触感）→ 顶高光带（玻璃感）。
// 9-slice 12px：四角固定（圆角 r12 全落角格·不糊）、顶带随宽拉伸、底唇随宽拉伸、糖体随尺寸拉伸 → 任意按钮尺寸不变形。
// 皮内文字由 skinCss 强制白字 + 重投影 → 糖体取中深饱和保白字可读。
export const APOLLO_TOON_SLICE = 12;
function candySkin(top: string, body: string, bodyDk: string, lip: string, rim: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${top}"/>` +
    `<stop offset="0.55" stop-color="${body}"/>` +
    `<stop offset="1" stop-color="${bodyDk}"/>` +
    `</linearGradient></defs>` +
    // 厚底唇底座（深色·比糖体高 6px·底部露出=Supercell 厚唇）
    `<rect x="3" y="4" width="58" height="57" rx="13" fill="${lip}"/>` +
    // 糖体 + 墨笔触边
    `<rect x="3" y="3" width="58" height="52" rx="12" fill="url(#g)" stroke="${rim}" stroke-width="2"/>` +
    // 顶部玻璃高光带（落在顶 slice 内·随宽拉伸不失真）
    `<rect x="9" y="7" width="46" height="9" rx="4.5" fill="#ffffff" fill-opacity="0.42"/>` +
    `</svg>`;
  return dataUri(svg);
}

// 四 kind 各一皮（一 kind 一皮·全游戏按钮一体换）：
//  hero=缃金糖(主 CTA) / primary=黛青糖(品牌) / ghost=竹青糖(次正向) / quiet=墨石糖(克制·不抢戏)。
const SKIN_HERO    = candySkin('#F4CE72', '#DDA036', '#BC7E1A', '#8E5C10', '#5E3D0E'); // 缃金
const SKIN_PRIMARY = candySkin('#4E7E8C', '#37606D', '#274A56', '#17323C', '#0E2630'); // 黛青
const SKIN_GHOST   = candySkin('#6FC49E', '#46997A', '#357A5F', '#245640', '#143528'); // 竹青
const SKIN_QUIET   = candySkin('#8C8C98', '#63636E', '#4A4A54', '#34343C', '#22222A'); // 墨石

// ── 程序化水墨背景板（远山淡墨渐染·单张 cover·确定性固定坐标·零随机）──
// 层次：缃金落日晕 → 藕紫/天青淡云带 → 天青远山 → 黛青中山 → 墨色近岭。天空透明 → 透见宣纸 pageBg。
const MOUNTAINS =
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700" preserveAspectRatio="xMidYMax slice">` +
  `<defs>` +
  `<linearGradient id="far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FC4D8" stop-opacity="0.20"/><stop offset="1" stop-color="#7FC4D8" stop-opacity="0.04"/></linearGradient>` +
  `<linearGradient id="mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#345C68" stop-opacity="0.26"/><stop offset="1" stop-color="#345C68" stop-opacity="0.08"/></linearGradient>` +
  `<linearGradient id="near" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2C2C34" stop-opacity="0.20"/><stop offset="1" stop-color="#2C2C34" stop-opacity="0.06"/></linearGradient>` +
  `<radialGradient id="sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#EBB54D" stop-opacity="0.50"/><stop offset="0.7" stop-color="#EBB54D" stop-opacity="0.12"/><stop offset="1" stop-color="#EBB54D" stop-opacity="0"/></radialGradient>` +
  `</defs>` +
  `<circle cx="928" cy="158" r="118" fill="url(#sun)"/>` +
  `<ellipse cx="300" cy="214" rx="262" ry="26" fill="#8A5A7A" fill-opacity="0.06"/>` +
  `<ellipse cx="820" cy="300" rx="340" ry="30" fill="#7FC4D8" fill-opacity="0.06"/>` +
  `<path d="M0 470 L160 380 L320 460 L520 350 L720 450 L920 360 L1120 440 L1200 400 L1200 700 L0 700 Z" fill="url(#far)"/>` +
  `<path d="M0 560 L220 450 L430 540 L640 430 L860 530 L1080 450 L1200 510 L1200 700 L0 700 Z" fill="url(#mid)"/>` +
  `<path d="M0 640 L260 560 L520 630 L780 550 L1040 620 L1200 580 L1200 700 L0 700 Z" fill="url(#near)"/>` +
  `</svg>`;
const MOUNTAINS_LAYER = `url(${dataUri(MOUNTAINS)}) center bottom / cover no-repeat`;

// 柔光晕染叠层（wash·顶部提亮 + 底部轻压暗·亮皮不伤可读）。
const WASH = `radial-gradient(130% 90% at 50% -12%, rgba(255,255,255,0.34), transparent 46%), radial-gradient(120% 100% at 50% 116%, rgba(44,44,52,0.10), transparent 55%)`;

// ── 程序化纸纹底纹（panelTexture·60×60 平铺·极淡墨纤维 + 微斑·让面纸色透出）──
const PAPER_GRAIN =
  `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">` +
  `<rect width="60" height="60" fill="#2c2c34" fill-opacity="0.012"/>` +
  `<path d="M6 14 h11" stroke="#2c2c34" stroke-opacity="0.05" stroke-width="0.7"/>` +
  `<path d="M40 31 h14" stroke="#2c2c34" stroke-opacity="0.045" stroke-width="0.6"/>` +
  `<path d="M22 48 h9" stroke="#2c2c34" stroke-opacity="0.05" stroke-width="0.7"/>` +
  `<circle cx="50" cy="10" r="0.7" fill="#2c2c34" fill-opacity="0.06"/>` +
  `<circle cx="14" cy="40" r="0.6" fill="#2c2c34" fill-opacity="0.05"/>` +
  `<circle cx="34" cy="20" r="0.5" fill="#345c68" fill-opacity="0.05"/>` +
  `</svg>`;
const PAPER_GRAIN_LAYER = `url(${dataUri(PAPER_GRAIN)}) 0 0 / 60px repeat`;

/** 「水墨玩趣」apollo-toon —— 宣纸底 + 墨字 + 糖果厚底唇钮 + 远山淡墨背景。亮皮（浅底深字）。 */
export const apolloToon: UITheme = {
  // 宣纸四级底（由深到浅）
  bg0: '#E6DCC4', bg1: '#F1E9D7', bg2: '#F8F2E4', bg3: '#FCF7EC',
  pageBg: 'linear-gradient(180deg, #F6F0E2 0%, #ECE3CE 100%)',
  // 墨色发丝描边（面框=墨边）
  line: 'rgba(44,44,52,0.22)',
  // 墨字三级
  text: C.ink, sub: '#5A5560', dim: '#6E675E',
  // 主强调 · 黛青（可读深色）
  jade: '#2F5A66', jadeWash: 'rgba(52,92,104,0.14)', jadeLine: 'rgba(52,92,104,0.40)',
  // 缃金（文字用深金变体·压宣纸可读；鲜金进按钮皮/背景）
  gold: '#A86D14',
  // 语义（亮皮可读深变体）：竹青绿 / 深金 / 朱砂
  ok: '#2E8F63', okWash: 'rgba(85,176,142,0.18)',
  warn: '#B0791E', warnWash: 'rgba(216,154,46,0.18)',
  danger: '#C23A28',
  // 阵营描边（战棋/卡牌 demo）：我方朱砂暖 / 敌方黛青冷
  mine: '#C23A28', foe: '#2F5A66',
  // 深墨字（金按钮/浅底上的深色文字）
  ink: C.ink,
  // 亮皮输入框须浅底（否则深底深字看不清）
  inputBg: '#FCF7EC',
  // 字体：UI/等宽沿用壳层；display/serif 走衬线（水墨标题气质·CJK 系统衬线兜底·离线安全）
  fontUi: SHELL.fontUi, fontMono: SHELL.fontMono,
  fontDisplay: SHELL.fontDisplay,
  fontSerif: "'Noto Serif SC', 'Songti SC', 'Palatino Linotype', Georgia, serif",
  fontPixel: SHELL.fontPixel,
  // 背景水墨远山 + 柔光晕染 + 面板纸纹底
  texture: MOUNTAINS_LAYER,
  wash: WASH,
  panelTexture: PAPER_GRAIN_LAYER,
  // 主题级糖果厚底唇钮皮（一 kind 一皮·全游戏一体换·9-slice 任意尺寸不糊）
  buttonSkins: {
    hero:    { skin: SKIN_HERO,    skinSlice: APOLLO_TOON_SLICE },
    primary: { skin: SKIN_PRIMARY, skinSlice: APOLLO_TOON_SLICE },
    ghost:   { skin: SKIN_GHOST,   skinSlice: APOLLO_TOON_SLICE },
    quiet:   { skin: SKIN_QUIET,   skinSlice: APOLLO_TOON_SLICE },
  },
};
