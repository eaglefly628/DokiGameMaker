# Sakura Otome — 樱花乙女

## 风格定位
乙女游戏/恋爱养成的标准美学。柔和粉色系、花瓣装饰、柔光效果。强调浪漫氛围和角色魅力。适合乙游、视觉小说、社交养成类游戏。

## 视觉关键词
粉色系、柔光、花瓣、丝带、圆润、梦幻、少女心

## 色板

| Token | 色值 | 用途 |
|-------|------|------|
| bg | #fff5f9 | 浅粉白 |
| bgSecondary | #ffe4ee | 柔粉底色 |
| text | #4a3040 | 暖棕黑 |
| textSecondary | #8b7080 | 柔灰棕 |
| accent | #e8618c | 樱花粉红 |
| accentHover | #f48fb1 | 浅樱粉 |
| border | #f0c4d8 | 柔粉边框 |
| shadow | rgba(232,97,140,0.15) | 粉色柔光影 |
| success | #81c784 | 柔绿 |
| warning | #ffb74d | 柔橙 |
| danger | #e57373 | 柔红 |

## 排版
- 字体：'Noto Sans SC', 'Zen Maru Gothic', sans-serif（圆体）
- 角色名：可用手写体 'Dancing Script', 'Klee One'
- 圆角：12-16px（大圆角，柔和感）
- 边框：1px solid，或无边框用阴影

## 特效
- **柔光**：`box-shadow: 0 4px 20px rgba(232,97,140,0.15)` 柔和扩散阴影
- **花瓣装饰**：CSS `::before`/`::after` 放置樱花 SVG 图标作为面板角落装饰
- **渐变背景**：`linear-gradient(135deg, #fff5f9, #ffe4ee)` 柔粉渐变
- **丝带分隔线**：对话框标题和内容之间用弧形丝带 SVG
- **角色名牌**：圆角大 + accent 色底 + 白色文字，像缎带标签
- **心跳动画**：好感度变化时，图标 CSS scale 跳动
- **花瓣飘落**：CSS animation，轻微旋转 + 下落的花瓣伪元素

## 角色对话框特殊设计
- 立绘位于左/右侧，对话框在对面
- 角色名用彩色标签显示
- 好感度变化用飘动的心形 icon
- 选项按钮大而圆润，hover 时柔光扩散

## Claude 生成 Prompt
```
Design a sakura/otome game theme CSS for a 2D visual novel and dating sim.
Soft pink-white background (#fff5f9), sakura pink accent (#e8618c),
warm brown-black text (#4a3040). Large border-radius (12-16px), soft shadows.
Use round sans-serif font. Add cherry blossom petal decorations on panel corners.
Gentle gradient backgrounds. Dialogue box should have character name ribbon tag.
Choice buttons should be large, rounded, with soft glow on hover.
Heart pulse animation for affection changes.
Components: health bar (as affection bar), button, panel, dialog, choice-option, avatar-frame.
Use CSS custom properties (--theme-*).
```
