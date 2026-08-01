# 两套性别向游戏 UI 主题 · 设计简报（给 Claude designer · 自包含版）

> 2026-06-10 · 性质:**设计简报**,委托 designer 出**设计稿 + 可落地的主题资产**。不改任何游戏/引擎逻辑(UI=纯表现层)。
> 产出物:**两套完整游戏 UI 主题包**——「偏女性向」+「偏男性向」,各覆盖下方 20 个标准组件。
> ⚠️ **本文档自包含**:你不需要访问任何代码仓库——所需的数据契约、组件清单、格式范例全部内联在本文(见 §0 与附录 A/B)。

---

## 0. 你要交付进的"主题系统"长什么样

ZeroCraft 引擎有一套现成的主题包体系。**两套新主题必须按它的格式产出**,这样能直接落地、被引擎按数据加载换皮。三件事先讲清:

### 0.1 每套主题的目录结构
```
themes/<theme-name>/
├── spec.md            # 风格定位 + 色板表 + 排版/形状/特效 + 生成 prompt（格式见附录 B）
├── tokens.css         # CSS 自定义属性（--theme-* 变量，承载下方 ThemeTokens）
└── components/        # 20 个标准组件各一个 .css
    ├── health-bar.css   button.css   panel.css   dialog.css   menu.css
    ├── notification.css progress-bar.css tooltip.css label.css icon-badge.css
    ├── inventory.css    skill-slot.css mini-map.css avatar-frame.css name-plate.css
    └── choice-option.css tab-bar.css slider.css modal.css toast.css
```

### 0.2 数据契约(你的色板/参数要能填进这个形状 —— 完整源码见附录 A)
每套主题 = 一组 **ThemeTokens**(色板 + 排版 + 形状 + 特效)+ 一组 **ThemeComponentConfig**(各组件参数)。核心字段速览:
- **色板**:`bg / bgSecondary / text / textSecondary / accent / accentHover / border / shadow`
- **语义色**:`success / warning / danger / info`
- **排版**:`fontFamily / fontSizeBase / fontSizeLg / fontSizeSm / lineHeight`
- **形状**:`borderRadius / borderWidth / spacing`
- **特效(可选)**:`glowColor / backdropBlur / textureUrl`
- **组件参数**:如 `button.hoverScale / button.activeScale`、`healthBar.fillColor/animationDuration`、`dialog.typingSpeed/nameTagPosition`、`toast.position/duration` 等。

### 0.3 20 个标准组件(两套都要全覆盖,每个含全部交互态)
**核心 10**(几乎每个游戏都用):
| 组件 | 说明 |
|---|---|
| health-bar | 血条 / MP 条 / 体力条 |
| button | 通用按钮(主 / 次 / 危险) |
| panel | 内容面板 / 窗口容器 |
| dialog | NPC 对话框 + 打字机文本区 |
| menu | 垂直 / 水平菜单列表 |
| notification | 顶部 / 底部通知横幅 |
| progress-bar | 加载进度 / 经验值条 |
| tooltip | 悬浮信息提示 |
| label | 标题 / 正文 / 数字标签 |
| icon-badge | 图标 + 角标 / 数量 |

**扩展 10**(按游戏类型选用,本简报要求也全做):
| 组件 | 说明 |
|---|---|
| inventory | 背包 / 物品栏(RPG/冒险) |
| skill-slot | 技能槽(ARPG/MOBA,带冷却) |
| mini-map | 小地图框 |
| avatar-frame | 头像框(社交/乙游) |
| name-plate | 名牌 / 称号 |
| choice-option | 对话选项按钮(VN/乙游) |
| tab-bar | 标签栏(多页面) |
| slider | 滑块(设置/音量) |
| modal | 模态弹窗(确认/警告) |
| toast | 轻量即时反馈 |

### 0.4 和已有主题的关系
引擎已有 8 套 spec(minimal-dark / cyberpunk / pixel-retro / ink-wash / **sakura-otome** / fantasy-medieval / sci-fi-hologram / glassmorphism),多数只写了 `spec.md`、CSS 尚未产出。其中 **sakura-otome 已是一套乙女(偏女性)主题**(完整范例见**附录 B**,也是你写 spec.md 的格式模板)。
> 本次两套是**旗舰级、商业品质**的性别向代表作:女性向可把 sakura 当参考基线但做出更高完成度/不同子风味;男性向是现有里缺的明确定位(cyberpunk/sci-fi 偏科幻,非"男性向游戏 UI"通感)。

---

## 1. 通用要求(两套都遵守)

### 1.1 ⭐ 交互态(最重要,每个可交互组件都要给)
完整状态 + **精确动效处方**:`default / hover / press(active) / focus-visible / disabled / loading / selected`。
- **hover**:抬升 / 缩放 / 亮度 / 阴影 / 发光的具体值 + 时长缓动(如 140ms ease-out)。
- **press**:点击瞬间反馈(下沉 / 缩小 scale≈.96 / 高光闪 / 可选涟漪)+ 回弹。**当前产品完全缺这块,务必补。**
- **focus-visible**:键盘聚焦环(accent 描边 + 柔光),鼠标点击不触发、键盘 Tab 才触发。
- 契约已预留 `button.hoverScale / activeScale`——把这套交互显式定义出来。

### 1.2 动效语言
进出场、列表交错、数值跳动(血条/分数/金币)、强调脉冲;给时长/缓动档;**`prefers-reduced-motion` 降级**。

### 1.3 可达性 & 工程约束
- 对比度达标(暗底低饱和、亮底浅色都要够清晰);点击热区 ≥ 视觉尺寸;键盘可达。
- 组件 UI **浮在 canvas 游戏画面之上**:处理 z 层、`pointer-events`、半透明背板 / 毛玻璃与画面的关系。
- 走 **CSS 变量**(tokens.css):同一套组件结构,换 token = 换皮。

### 1.4 每套交付物
1. `spec.md`(格式照**附录 B**):风格定位 + 视觉关键词 + **完整色板表** + 排版/形状/特效 + Claude 生成 prompt。
2. **20 组件设计稿 + CSS**:每组件视觉 + 全交互态 + 关键动效;建议附**整屏参考 mock**(见 §4)。
3. `tokens.css`:CSS 变量草案,承载 §0.2 的 ThemeTokens。

---

## 2. 「偏女性向」主题(代号建议 **Aurora / 霞**)

### 2.1 气质定位
柔美 · 温暖 · 梦幻 · 精致 · 治愈。让玩家"被温柔包裹、赏心悦目、有少女心兼高级感"。品类:乙游/恋爱养成、换装、三消、生活模拟、社交养成。

### 2.2 视觉语言
- **色彩**:暖白/浅粉/奶油底;主色取**樱粉 / 蜜桃 / 丁香紫 / 薄荷**等高明度低饱和;点睛**玫瑰金/珠光**;柔和 135° 双色渐变;整体明亮通透。(参考 sakura 的 `#fff5f9 / #e8618c / #4a3040`,但做出新风味,如"奶茶+丁香紫"或"蜜桃+玫瑰金"。)
- **形状**:大圆角(12–20px)、圆润、无硬边;浅色细线或无边靠柔光阴影。
- **材质/装饰**:柔光扩散阴影、花瓣/丝带/星屑/爱心点缀(克制,角落或分隔)、珠光高光、磨砂玻璃。
- **排版**:圆体/手写体混排(标题可手写花体,正文圆润 sans);字距舒朗。
- **微交互**:hover 柔光扩散 + 轻微放大;press 软回弹;好感/收藏用心跳/星屑脉冲;数值上升甜美跳动。**手感:软、弹、亮。**
- **避免**:尖锐切角、冷硬金属、高对比黑红、暴力字体。

### 2.3 重点组件
- `dialog`:立绘对侧、缎带名牌、打字机、选项大而圆润 hover 柔光。
- `avatar-frame`:花环/丝带边、柔光描边、好感等级色环。
- `choice-option`:大圆角胶囊、hover 柔光扩散 + 浅填充。
- `health-bar/progress-bar`:圆头、渐变填充、柔光、变化甜美跳动。

## 3. 「偏男性向」主题(代号建议 **Vanguard / 锋**)

### 3.1 气质定位
硬朗 · 力量 · 锐利 · 暗黑/高科技 · 竞技。让玩家"强大、酷、信息高效、有压迫感与掌控感"。品类:ARPG/动作、射击、自走棋/策略、卡牌对战、硬核竞技。

### 3.2 视觉语言(两个子方向供选或合一)
- **子向 A · 暗黑金属/硬核**:近黑底 + 钢灰/暗铜/血红;切角(clip-path 斜切)、铆钉/装甲/磨损金属;冷峻粗体或军用等宽。
- **子向 B · 赛博 HUD/电竞**:深空蓝黑 + 霓虹青/电光橙/警示黄;发光描边、扫描线、网格、棱角面板、数据流动效。
- **共性**:高对比、低圆角(2–6px)或切角、棱角分明;信息密度高、HUD 感强;边框用发光线/双线/角标而非柔影。
- **材质/装饰**:金属/玻璃/碳纤维纹理、能量光带、警示条纹、棱形/六边形几何。
- **排版**:粗壮无衬线或科技等宽;字距偏紧、可全大写小标签;数字用 tabular 等宽(读数稳)。
- **微交互**:hover 发光描边 + 轻微亮起/位移;press 锐利下沉 + 高光闪(像按机械键);选中用边角点亮/能量脉冲;数值刚性快跳 + 命中闪。**手感:锐、亮、力。**
- **避免**:柔粉、花瓣、过度圆润、低对比"奶油感"。

### 3.3 重点组件
- `skill-slot`:六边形/切角框、冷却扫描遮罩、就绪边角点亮、按下锐闪。
- `mini-map`:棱角边 + 角标 + 网格底。
- `health-bar`:分段/刻度、硬边、掉血红闪 + 抖动;`progress-bar` 带斜纹流动。
- `inventory/icon-badge`:稀有度发光边、品质角标。
- `modal/notification`:切角面板 + 顶部能量光带 + 锐利滑入。

## 4. 锚定到 ZeroCraft 真实游戏(让 mock 有的放矢)
这些是 ZeroCraft 引擎里跑着的真实游戏,做整屏 mock 时对照它们:
- **偏女性向** → **Game B**(乙游 VN:立绘+对话+属性面板+多结局选项)、**Game C**(缝纫换装三消:消除盘+材料背包+缝制按钮+换装展示)。mock 建议:① VN 对话+选项+好感面板 ② 三消背包+按钮+进度。
- **偏男性向** → **Game D**(暗黑 ARPG:WASD+技能 1/2/3+怪+掉落)、**Game E**(小丑牌 roguelike:手牌+小丑排+稀有度商店+计分)、**Game F**(自走棋三国:棋子+羁绊+金币 HUD+商店)。mock 建议:① ARPG 战斗 HUD(血条/技能槽/小地图)② 卡牌商店(稀有度卡+购买/重摇)③ 自走棋备战(棋子卡/羁绊/金币)。

## 5. 明确不做
- 不改游戏/引擎逻辑、不碰确定性模拟、不动 canvas 内的游戏美术资产。
- 不偏离 §0 的 20 组件清单与数据契约(要能直接落进主题系统)。
- 性别向是**审美取向不是限制**——做"偏"不做"刻板":女性向高级不幼稚,男性向精致不糙。

## 6. 风格锚点(定调)
- **偏女性向**:《动森》/ 乙游 / 现代治愈手游那种**明亮柔美、圆润精致、微光甜美**,一点高级感避免廉价。
- **偏男性向**:《暗黑破坏神》/《命运 2》HUD / 电竞 OSD / Apex 那种**暗色高对比、棱角金属/霓虹、信息高效、按下有"机械感"反馈**。

---

# 附录 A · 数据契约源码(ThemeTokens / ThemeComponentConfig / GameTheme)

> 你的色板与组件参数最终要能填进这个 TypeScript 形状(也就是 tokens.css 的 `--theme-*` 变量集 + 组件参数)。

```ts
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
  healthBar: { height: string; fillColor: string; depletedColor: string; animationDuration: string };
  button:    { paddingX: string; paddingY: string; hoverScale: string; activeScale: string };
  panel:     { padding: string; maxWidth: string; headerHeight: string };
  dialog:    { maxWidth: string; typingSpeed: string; nameTagPosition: 'top-left' | 'top-center' | 'inside' };
  toast:     { position: 'top' | 'bottom'; duration: string };
}

export interface GameTheme {
  tokens: ThemeTokens;
  components: ThemeComponentConfig;
}
```

---

# 附录 B · spec.md 格式范例(现有 sakura-otome 全文)

> 这是引擎里已有的"偏女性向"主题 spec,**作为你写两套 spec.md 的格式模板**(风格定位 → 视觉关键词 → 色板表 → 排版 → 特效 → 特殊设计 → 生成 prompt)。你的新女性向要在它之上做出更高完成度/不同子风味,男性向另起一套同结构。

```markdown
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
- 柔光：box-shadow: 0 4px 20px rgba(232,97,140,0.15) 柔和扩散阴影
- 花瓣装饰：CSS ::before/::after 放置樱花 SVG 作为面板角落装饰
- 渐变背景：linear-gradient(135deg, #fff5f9, #ffe4ee)
- 丝带分隔线 / 缎带角色名牌 / 好感心跳动画 / 花瓣飘落

## Claude 生成 Prompt
Design a sakura/otome game theme CSS for a 2D visual novel and dating sim.
Soft pink-white bg (#fff5f9), sakura pink accent (#e8618c), warm brown-black text (#4a3040).
Large border-radius (12-16px), soft shadows, round sans-serif. Petal corner decorations.
Dialogue box with character name ribbon tag. Large rounded choice buttons with soft glow on hover.
Heart pulse on affection change. Use CSS custom properties (--theme-*).
```
