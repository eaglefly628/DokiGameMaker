# Cyberpunk — 赛博朋克

## 风格定位
霓虹灯光、深蓝紫色调、故障艺术（glitch）元素。适合科幻、反乌托邦、赛博题材的动作游戏。视觉冲击力强，信息密度高，有未来感的数据界面质感。

## 视觉关键词
霓虹、故障、深蓝紫、光晕、扫描线、HUD 感、高科技

## 色板

| Token | 色值 | 用途 |
|-------|------|------|
| bg | #0a0e1a | 深空背景 |
| bgSecondary | #111827 | 面板内底 |
| text | #e0f2fe | 主文字（冷白） |
| textSecondary | #7dd3fc | 次要文字 |
| accent | #f472b6 | 霓虹粉（主强调） |
| accentHover | #fb7dff | 亮紫粉 |
| border | #38bdf8 | 霓虹蓝边框 |
| shadow | rgba(56,189,248,0.3) | 蓝色光晕 |
| success | #34d399 | 绿色系统状态 |
| warning | #fbbf24 | 琥珀警告 |
| danger | #ff3366 | 霓虹红 |
| glow | #38bdf8 | 发光效果色 |

## 排版
- 字体：'Orbitron', 'Rajdhani', monospace（科幻感无衬线）
- 圆角：2px（硬边）或 clip-path 切角
- 边框：1px solid，带 glow

## 特效
- 边框发光：`box-shadow: 0 0 8px var(--theme-glow)`
- 文字发光：`text-shadow: 0 0 6px var(--theme-accent)`
- 故障闪烁：CSS animation `glitch` 用 clip-path 随机切片
- 扫描线叠加：`background: repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)`
- 切角边框：`clip-path: polygon(0 8px, 8px 0, 100% 0, 100% calc(100%-8px), calc(100%-8px) 100%, 0 100%)`

## Claude 生成 Prompt
```
Design a cyberpunk neon theme CSS for a 2D game UI.
Deep blue-purple background (#0a0e1a), neon pink accent (#f472b6), cyan borders (#38bdf8).
Use box-shadow glow effects, scan-line overlays, clip-path cut corners.
Text should have subtle neon glow. Buttons flash on hover.
Add a subtle glitch animation keyframe for error/damage states.
Monospace or sci-fi font. Components: health bar, button, panel, dialog, menu, tooltip.
Use CSS custom properties (--theme-*).
```
