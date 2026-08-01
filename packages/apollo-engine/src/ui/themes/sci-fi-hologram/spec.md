# Sci-Fi Hologram — 科幻全息

## 风格定位
未来科技的全息投影界面。透明层叠加、蓝色发光线条、数据流动画。适合太空、机甲、策略类游戏。给人"在飞船驾驶舱操作 HUD"的沉浸感。

## 视觉关键词
全息、透明、蓝光线条、数据流、HUD、扫描线、六边形

## 色板

| Token | 色值 | 用途 |
|-------|------|------|
| bg | rgba(5,15,30,0.85) | 深空半透明 |
| bgSecondary | rgba(10,25,50,0.75) | 面板半透明 |
| text | #b8d4e3 | 冷蓝白 |
| textSecondary | #6b8fa3 | 暗蓝灰 |
| accent | #00d4ff | 全息蓝 |
| accentHover | #44eeff | 亮全息蓝 |
| border | rgba(0,212,255,0.4) | 半透明蓝边 |
| shadow | rgba(0,212,255,0.2) | 蓝色辉光 |
| success | #00ff88 | 全息绿 |
| warning | #ffaa00 | 琥珀 |
| danger | #ff3355 | 警报红 |

## 排版
- 字体：'Exo 2', 'Orbitron', 'Share Tech Mono', monospace
- 数据用等宽字体，标题用几何无衬线
- 圆角：0px 或 2px（硬边科技感）
- 边框：1px solid，半透明

## 特效
- **半透明层**：所有面板 `backdrop-filter: blur(8px)` + 半透明背景
- **蓝色描边发光**：`border: 1px solid rgba(0,212,255,0.4); box-shadow: 0 0 12px rgba(0,212,255,0.2), inset 0 0 12px rgba(0,212,255,0.1)`
- **扫描线**：CSS 水平扫描线动画从上到下循环（`translateY` animation）
- **六边形网格**：背景用 SVG 六边形 pattern 微弱叠加
- **数据流动画**：边框上沿一条亮点移动（`linear-gradient` + animation）
- **全息闪烁**：低频 opacity 波动（0.95 ↔ 1.0）模拟全息投影不稳定
- **角标三角**：面板角落用 CSS 三角形装饰，模拟 HUD 瞄准框

## Claude 生成 Prompt
```
Design a sci-fi holographic HUD theme CSS for a 2D game UI.
Semi-transparent dark background (rgba(5,15,30,0.85)), holographic cyan accent (#00d4ff).
Use backdrop-filter: blur for glassmorphism on dark surfaces.
Thin glowing borders with box-shadow glow. Monospace/geometric font.
Add scanning line animation (horizontal light bar moving top to bottom).
Hexagonal grid pattern as subtle background. Corner brackets as HUD decorations.
A light dot travels along borders (animated gradient).
Components: health bar, button, panel, dialog, mini-map, skill-slot.
Use CSS custom properties (--theme-*).
```
