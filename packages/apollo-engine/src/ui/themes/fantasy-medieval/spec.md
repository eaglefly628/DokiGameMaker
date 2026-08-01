# Fantasy Medieval — 奇幻中世纪

## 风格定位
经典 RPG/奇幻游戏的视觉语言。石材和木纹质感、金属铆钉装饰、羊皮纸底纹。适合 ARPG、回合制、冒险类游戏。有厚重的工艺感和历史感。

## 视觉关键词
石纹、木纹、铆钉、羊皮纸、哥特式、盾徽、锻铁

## 色板

| Token | 色值 | 用途 |
|-------|------|------|
| bg | #2a1f14 | 深褐木色 |
| bgSecondary | #3d2e1e | 暖棕面板 |
| text | #e8d5b0 | 羊皮纸白 |
| textSecondary | #b09a7a | 旧纸棕 |
| accent | #d4a844 | 金属金 |
| accentHover | #e8c35a | 亮金 |
| border | #5c4a34 | 深木色边框 |
| shadow | rgba(0,0,0,0.6) | 厚重投影 |
| success | #6abf69 | 药草绿 |
| warning | #d4a844 | 金色 |
| danger | #cc4444 | 鲜血红 |

## 排版
- 字体：'Cinzel', 'MedievalSharp', serif（哥特/衬线）
- 正文：'Spectral', Georgia, serif
- 圆角：4px（接近直角，石材感）
- 边框：3px solid，可叠加铆钉装饰

## 特效
- **石纹背景**：`background-image` 叠加石材/皮革纹理（repeating tile）
- **铆钉装饰**：面板四角用 `::before`/`::after` 放置圆形金属铆钉
- **金属边框**：`border-image` 使用金属质感条纹
- **羊皮纸内底**：内容区用浅色旧纸纹理背景
- **火把光效**（可选）：面板边缘微弱的暖色 box-shadow 闪烁
- **金色浮雕文字**：标题用 `text-shadow` 模拟凹凸浮雕效果
- **卷轴动画**：对话框展开时从中间向两边展开（transform scaleY）

## Claude 生成 Prompt
```
Design a fantasy medieval RPG theme CSS for a 2D game UI.
Dark wood-brown background (#2a1f14), gold accent (#d4a844),
parchment-colored text (#e8d5b0). Serif fonts (Cinzel/MedievalSharp).
3px solid borders with metal/wood texture feel. Small border-radius (4px).
Panel corners should have metal rivet decorations (pseudo-elements).
Content area with parchment paper texture. Gold embossed text-shadow on titles.
Heavy drop shadows. Components: health bar, button, panel, dialog, inventory, tooltip.
Use CSS custom properties (--theme-*).
```
