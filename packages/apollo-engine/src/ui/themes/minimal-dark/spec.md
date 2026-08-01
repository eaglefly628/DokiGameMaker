# Minimal Dark — 极简暗色

## 风格定位
开发默认主题。深色背景减轻视觉疲劳，低饱和色彩不干扰游戏画面。强调信息可读性而非装饰性。适合所有类型游戏的开发期使用，也可作为硬核玩家偏好的正式主题。

## 视觉关键词
干净、克制、深色、高对比度文字、无装饰、功能优先

## 色板

| Token | 色值 | 用途 |
|-------|------|------|
| bg | #0f172a | 面板背景 |
| bgSecondary | #1e293b | 次级背景/卡片 |
| text | #e2e8f0 | 主文字 |
| textSecondary | #94a3b8 | 次要文字 |
| accent | #38bdf8 | 强调色/可交互 |
| accentHover | #7dd3fc | 悬浮态 |
| border | #334155 | 边框 |
| shadow | rgba(0,0,0,0.5) | 投影 |
| success | #4ade80 | 治疗/正面 |
| warning | #fbbf24 | 警告/中性 |
| danger | #f87171 | 伤害/危险 |

## 排版
- 字体：system-ui, monospace（数字用等宽）
- 圆角：6px
- 边框：1px solid

## 特效
- 无特殊特效
- 面板轻微透明（0.85 opacity）
- 过渡：150ms ease

## Claude 生成 Prompt
```
Design a minimal dark theme CSS for a 2D game UI. Background #0f172a, accent #38bdf8.
Clean lines, no decorations, no textures. Border-radius 6px, 1px borders.
High contrast text on dark background. Functional and readable.
Components: health bar, button, panel, dialog box, menu, tooltip.
Use CSS custom properties (--theme-*) for all colors.
```
