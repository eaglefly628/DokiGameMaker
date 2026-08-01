# Glassmorphism — 毛玻璃现代

## 风格定位
Apple/Material Design 3 风格的现代毛玻璃美学。半透明磨砂背景、微妙渐变边框、大圆角。适合休闲、社交、养成、消除类游戏。干净时尚，不抢游戏画面。

## 视觉关键词
毛玻璃、透明、渐变边框、大圆角、柔和、现代、Apple 风

## 色板

| Token | 色值 | 用途 |
|-------|------|------|
| bg | rgba(255,255,255,0.15) | 毛玻璃白 |
| bgSecondary | rgba(255,255,255,0.08) | 更淡的毛玻璃 |
| text | #ffffff | 纯白文字 |
| textSecondary | rgba(255,255,255,0.7) | 半透明白 |
| accent | #a78bfa | 薰衣草紫 |
| accentHover | #c4b5fd | 浅紫 |
| border | rgba(255,255,255,0.2) | 半透明白边 |
| shadow | rgba(0,0,0,0.2) | 柔和暗影 |
| success | #6ee7b7 | 薄荷绿 |
| warning | #fcd34d | 柔金 |
| danger | #fca5a5 | 柔红 |

## 排版
- 字体：'Inter', 'SF Pro', system-ui, sans-serif（圆润无衬线）
- 字重：400 正文，600 标题（不用粗体）
- 圆角：16-20px（大圆角）
- 边框：1px solid rgba(255,255,255,0.2)

## 特效
- **毛玻璃**：`backdrop-filter: blur(16px) saturate(180%)` — 核心效果
- **渐变边框**：`border-image: linear-gradient(135deg, rgba(255,255,255,0.3), rgba(255,255,255,0.05)) 1` 或用 `::before` 伪元素做渐变描边
- **微妙渐变底色**：`background: linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))`
- **柔和阴影**：`box-shadow: 0 8px 32px rgba(0,0,0,0.2)`
- **hover 升起**：`transform: translateY(-2px)` + 阴影加深
- **过渡**：300ms cubic-bezier(0.4, 0, 0.2, 1)（Material 标准）

## 注意
- 毛玻璃效果依赖背景有内容（游戏画面）— 纯色背景上看不出效果。
- `backdrop-filter` 性能有开销，移动端注意面板数量。
- 需要一个 dark 色调的游戏画面做底，白色毛玻璃才好看。

## Claude 生成 Prompt
```
Design a glassmorphism theme CSS for a 2D game UI overlay.
Semi-transparent white panels (rgba(255,255,255,0.15)) with backdrop-filter: blur(16px).
Lavender purple accent (#a78bfa). Large border-radius (16-20px).
Subtle gradient borders (white to transparent). Soft shadows.
Inter/SF Pro font, clean and modern. Panels hover-lift with deeper shadow.
Smooth 300ms transitions. Components: health bar, button, panel, dialog, menu, toast.
This theme works best over colorful game backgrounds.
Use CSS custom properties (--theme-*).
```
