export interface ThemeTokens {
  name: string;
  displayName: string;

  // 基础色板
  bg: string;
  bgSecondary: string;
  text: string;
  textSecondary: string;
  accent: string;
  accentHover: string;
  border: string;
  shadow: string;

  // 语义色
  success: string;
  warning: string;
  danger: string;
  info: string;

  // 排版
  fontFamily: string;
  fontSizeBase: string;
  fontSizeLg: string;
  fontSizeSm: string;
  lineHeight: string;

  // 形状
  borderRadius: string;
  borderWidth: string;
  spacing: string;

  // 特效
  glowColor?: string;
  backdropBlur?: string;
  textureUrl?: string;
}

export interface ThemeComponentConfig {
  healthBar: {
    height: string;
    fillColor: string;
    depletedColor: string;
    animationDuration: string;
  };
  button: {
    paddingX: string;
    paddingY: string;
    hoverScale: string;
    activeScale: string;
  };
  panel: {
    padding: string;
    maxWidth: string;
    headerHeight: string;
  };
  dialog: {
    maxWidth: string;
    typingSpeed: string;
    nameTagPosition: 'top-left' | 'top-center' | 'inside';
  };
  toast: {
    position: 'top' | 'bottom';
    duration: string;
  };
}

export interface GameTheme {
  tokens: ThemeTokens;
  components: ThemeComponentConfig;
}
