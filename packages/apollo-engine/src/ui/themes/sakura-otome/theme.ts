import type { GameTheme } from '../theme.types.js';

// ═══════════════════════════════════════════════════════════════
//  sakura-otome —— 樱花乙女主题（数据）。
//  R16：把原 Game B VNStage 里硬编码的配色/字体/形状外提为一份**主题数据**，
//  喂给通用 @ui/vn 演出组件。主题 = 数据，不是代码；任何 VN 换皮只换这份对象。
//  色板/排版/特效 token 取自同目录 spec.md（柔粉白底、樱花粉 accent、暖棕黑字、大圆角柔光）。
// ═══════════════════════════════════════════════════════════════
export const sakuraOtomeTheme: GameTheme = {
  tokens: {
    name: 'sakura-otome',
    displayName: '樱花乙女',

    bg: '#fff5f9',
    bgSecondary: '#ffe4ee',
    text: '#4a3040',
    textSecondary: '#8b7080',
    accent: '#e8618c',
    accentHover: '#f48fb1',
    border: '#f0c4d8',
    shadow: 'rgba(232,97,140,0.15)',

    success: '#81c784',
    warning: '#ffb74d',
    danger: '#e57373',
    info: '#64b5f6',

    fontFamily: "'Noto Sans SC', 'Zen Maru Gothic', sans-serif",
    fontSizeBase: '16px',
    fontSizeLg: '20px',
    fontSizeSm: '12px',
    lineHeight: '1.6',

    borderRadius: '14px',
    borderWidth: '1px',
    spacing: '12px',

    glowColor: 'rgba(232,97,140,0.35)',
    backdropBlur: '6px',
  },
  components: {
    healthBar: {
      height: '8px',
      fillColor: '#e8618c',
      depletedColor: 'rgba(74,48,64,0.12)',
      animationDuration: '0.3s',
    },
    button: {
      paddingX: '16px',
      paddingY: '11px',
      hoverScale: '1.02',
      activeScale: '0.98',
    },
    panel: {
      padding: '14px',
      maxWidth: '200px',
      headerHeight: '28px',
    },
    dialog: {
      maxWidth: '540px',
      typingSpeed: '28ms',
      nameTagPosition: 'top-left',
    },
    toast: {
      position: 'bottom',
      duration: '2s',
    },
  },
};
