# Ink Wash — 水墨国风

## 风格定位
中国传统水墨画美学。宣纸质感背景、墨色浓淡层次、毛笔笔触边框。适合武侠、仙侠、国风策略游戏。强调留白和意境，少即是多。

## 视觉关键词
水墨、宣纸、留白、毛笔笔触、印章红、山水意境

## 色板

| Token | 色值 | 用途 |
|-------|------|------|
| bg | #f5f0e8 | 宣纸暖白 |
| bgSecondary | #ebe5d9 | 旧纸微黄 |
| text | #2c2c2c | 浓墨黑 |
| textSecondary | #6b6b6b | 淡墨灰 |
| accent | #c53d43 | 印章红/朱砂 |
| accentHover | #d45d5d | 浅朱红 |
| border | #8b8378 | 墨色淡边 |
| shadow | rgba(44,44,44,0.15) | 淡墨投影 |
| success | #5b8c5a | 竹绿 |
| warning | #d4a853 | 赭石黄 |
| danger | #c53d43 | 朱红 |

## 排版
- 字体：'Noto Serif SC', 'Source Han Serif', serif（宋体/明体）
- 标题可用：'ZCOOL XiaoWei', 'Ma Shan Zheng'（手写体/行书）
- 圆角：2px（接近直角但不生硬）
- 边框：1px solid，标题下用墨色分隔线

## 特效
- **宣纸纹理**：`background-image` 叠加宣纸纹理（repeating, 低透明度）
- **毛笔边框**：`border-image` 使用墨迹笔触素材，实现不规则边框
- **印章装饰**：角标/badge 用印章红圆形 + 篆书字
- **墨色渐变**：面板顶部 `linear-gradient` 模拟墨色从浓到淡
- **水墨扩散动画**：hover/打开面板时，背景模拟墨滴在宣纸上晕开
- **留白原则**：大量 padding 和 margin，内容不拥挤

## Claude 生成 Prompt
```
Design a Chinese ink wash painting (水墨) theme CSS for a 2D game UI.
Rice paper warm white background (#f5f0e8), ink black text (#2c2c2c),
vermillion red accent (#c53d43) for stamps and highlights.
Use serif fonts (Noto Serif SC). Large whitespace/padding (ink painting values empty space).
Borders should feel like brush strokes — slightly irregular or use border-image.
Add subtle rice paper texture overlay. Titles can use Chinese calligraphy font.
Components: health bar, button, panel, dialog, menu, tooltip.
Use CSS custom properties (--theme-*).
```
