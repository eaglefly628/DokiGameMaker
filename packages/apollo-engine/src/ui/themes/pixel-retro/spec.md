# Pixel Retro — 像素复古

## 风格定位
8-bit/16-bit 时代的像素美学。粗像素边框、位图字体、CRT 效果。适合复古风、独立游戏、roguelike。让玩家回到 NES/SNES 时代的视觉记忆。

## 视觉关键词
像素、8-bit、NES 色板、粗边框、位图字体、CRT

## 色板

| Token | 色值 | 用途 |
|-------|------|------|
| bg | #1a1c2c | 深蓝灰（NES 背景） |
| bgSecondary | #333c57 | 面板底色 |
| text | #f4f4f4 | 亮白文字 |
| textSecondary | #94b0c2 | 次级蓝灰 |
| accent | #ffcd75 | 金黄（金币/选中） |
| accentHover | #fff1b8 | 浅金 |
| border | #5d275d | 紫红粗边框 |
| shadow | none | 像素风不用平滑阴影 |
| success | #38b764 | 绿色（治疗药水） |
| warning | #ffcd75 | 金黄 |
| danger | #b13e53 | 暗红 |

## 排版
- 字体：'Press Start 2P', 'Silkscreen', monospace（像素字体）
- 圆角：0px（全直角）
- 边框：3px solid（粗像素边框）
- 所有尺寸用 4 的倍数（像素对齐）

## 特效
- **像素边框**：`border: 3px solid; image-rendering: pixelated`
- **无抗锯齿**：`image-rendering: pixelated` 在所有图片/Canvas 上
- **CRT 滤镜**（可选叠加）：
  - 扫描线：`repeating-linear-gradient` 每 2px 交替
  - 轻微弧形变形：CSS `perspective` 或 SVG filter
  - 色差：`text-shadow: 1px 0 red, -1px 0 cyan`（极轻微）
- **选中闪烁**：菜单选项用 CSS animation 500ms 闪烁
- **窗口边框**：用 `border-image` 实现经典 RPG 对话框的瓦片边框

## Claude 生成 Prompt
```
Design a pixel-art retro 8-bit theme CSS for a 2D game UI.
NES-era color palette: dark blue-gray background (#1a1c2c), gold accent (#ffcd75), 
purple-red borders (#5d275d). All corners sharp (0px radius).
3px solid borders, pixel font (Press Start 2P). No smooth shadows.
Add image-rendering: pixelated everywhere. Menu items blink when selected.
Optional CRT scanline overlay. Components: health bar, button, panel, dialog, menu, tooltip.
Use CSS custom properties (--theme-*).
```
