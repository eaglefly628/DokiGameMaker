# Handoff: Game F《像素三分天下》— 双性别向 UI 主题系统 + 组件库 + 商城

## Overview
本交接包是 ZeroCraft 引擎下自走棋游戏 **Game F（三国题材 TFT / 金铲铲制式）** 的一整套 UI 设计参考,核心是 **一套布局、两套可换肤主题** + **20 个标准基础组件** + **古风按钮/图标系统** + **商城**。两套皮肤:
- **玄铁 (Vanguard)** — 偏男性向:暗黑金属硬核,近黑钢冷底 + 熔岩橙,锐角、金属高光、碳纤底纹。
- **锦霞 (Aurora)** — 偏女性向:宫廷锦绣,暖珍珠底 + 胭脂玫瑰 + 描金,大圆角、丝绸柔光、窗棂镂花底纹。

两套皮肤共用**完全相同的 DOM 结构**,只切换 CSS 变量(token),因此天然像素对齐。

## About the Design Files
`designs/` 里的 `.dc.html` 文件是**用 HTML 制作的设计参考(原型)**,展示目标视觉与交互,**不是可直接照搬的生产代码**。任务是 **在目标代码库的现有环境里复刻这些设计**(引擎 UI 层、React、原生等),沿用其既有组件与模式。若尚无 UI 框架,则选最合适的框架实现。

> 这些 `.dc.html` 是 "Design Component" 流式原型,依赖同目录 `support.js` 运行时。直接在浏览器打开任一 `.dc.html` 即可预览;`support.js` 仅为预览所需,**无需移植**。

引擎落地约束(来自 `source-briefs/`,务必遵守):
- UI 是**纯表现层**,不碰 world/hash/确定性逻辑。
- 主题 = 一组 `ThemeTokens`(CSS 变量)+ 每组件一份 CSS;换 token = 换肤。
- 游戏内 HUD 走引擎数据实体词汇(`Sprite/Text/Gauge/clickable/text-binding/Hierarchy`),**不写 React 进游戏内**;对局外的壳层(商城/结算/房间)才用 DOM。

## Fidelity
**High-fidelity (hifi)。** 最终配色、字体、间距、圆角、阴影、交互态均已确定,请按本文档的精确数值像素级复刻。

## Files
| 文件 | 内容 |
|---|---|
| `designs/Game F 对战.dc.html` | **主对战界面(平盘重构版,1280×720)· 推荐主参考** —— 单人/双人×玄铁/锦霞 四组合切换。清爽擂台棋盘 + 羁绊栏 + 备战席(贴棋盘底) + 点将台招募弹窗 + 同盟镜像面板。双人棋盘 10 列 |
| `designs/ZeroCraft UI Kit.dc.html` | **20 个标准组件** × 两套皮肤 × 全交互态 + 基础(色板/字体/形状/五行分格)· 水墨×王者(色形纹神) |
| `designs/Game F 对战.dc.html` | **对战界面(平盘,1280×720)** · 单人/多人(3人联机,AI 补位)× 玄铁/锦霞 · 点将台招募弹窗 · 右栏玩家战况六角点图 |
| `designs/Game F 大厅.dc.html` | **局外大厅** 7 屏(大厅/组队/牌组/收藏/商城·市场/天梯)+ 好友栏 + 邀请 toast · 玄铁/锦霞 |
| `designs/Game F 商城.dc.html` | 商城(1280×720):抽卡/皮肤/通行证/钻石/礼包 五分页 |
| `designs/玄铁 艺术升级对照.dc.html` | 艺术方向对照(改造前后 + 五行分格) |
| `tokens/onyx.tokens.css` / `tokens/brocade.tokens.css` | **两套主题 tokens.css 草案** —— 可直接落进 `src/ui/themes/<name>/` |
| `screenshots/` | 各设计截图 |
| `source-briefs/` | 原始策划/设计简报(背景与规则) |

---

## Design Tokens（两套皮肤完整对照）

每个 token 两套皮肤同名、不同值。实现为 CSS 自定义属性 `--<name>`,挂在皮肤根容器上,子元素一律 `var(--name)`。

| Token | 玄铁 Onyx (男) | 锦霞 Brocade (女) | 用途 |
|---|---|---|---|
| `--app-bg` | `radial-gradient(120% 120% at 50% -10%, #1a2230 0%, #0a0d12 55%, #06080b 100%)` | `radial-gradient(120% 120% at 50% -10%, #fdf4ee 0%, #f3e2dc 60%, #ecd6cf 100%)` | 页面/对局底 |
| `--panel-grad` | `linear-gradient(180deg,#1c2531,#121821)` | `linear-gradient(180deg,#fffdfa,#fbeee4)` | 面板/卡片底 |
| `--panel-border` | `#33404f` | `#e3c896` | 面板描边 |
| `--hairline` | `rgba(255,214,150,.12)` | `rgba(216,164,78,.4)` | 内嵌双线高光(古金) |
| `--chip-bg` | `rgba(255,255,255,.05)` | `rgba(255,255,255,.55)` | 小料底 |
| `--track` | `rgba(0,0,0,.5)` | `rgba(150,110,90,.18)` | 进度槽底 |
| `--ink` | `#e7edf3` | `#5a3f44` | 主文字 |
| `--ink-dim` | `#7e8c9b` | `#a98b8f` | 次文字 |
| `--accent` | `#ff5d2e` (熔岩橙) | `#d8607b` (胭脂玫瑰) | 主色 |
| `--accent-grad` | `linear-gradient(180deg,#ff7a45,#ee4515)` | `linear-gradient(180deg,#e887a0,#cf5070)` | 主色渐变(按钮/CTA) |
| `--accent-soft` | `rgba(255,93,46,.18)` | `rgba(216,96,123,.16)` | 主色柔底/光晕 |
| `--accent-ink` | `#1c0d06` | `#fff` | 主色上的文字 |
| `--gold` | `#ffcb3d` | `#cf9a3f` | 金币/数值高亮 |
| `--seal-edge` | `#caa24e` | `#d8a44e` | 玉印描边古金 |
| `--success` | `#46d17a` | `#54ad8e` | 成功(亦作 HP) |
| `--warning` | `#ffb24a` | `#e0a94e` | 警告 |
| `--danger` | `#ff404f` | `#d65668` | 危险/掉血 |
| `--info` | `#37b6ff` | `#8aa0e6` | 信息(亦作 MP) |
| `--hp` / `--mp` / `--xp` | `#46d17a` / `#37b6ff` / `#c184ff` | `#54ad8e` / `#8aa0e6` / `#c98fc4` | 血/蓝/经验条 |
| `--radius` | `4px` (锐) | `14px` (圆) | 通用圆角 |
| `--btn-radius` | `12px` | `16px` | **按钮圆角(两套都圆,独立 token)** |
| `--radius-lg` | `8px` | `20–22px` | 大容器圆角 |
| `--btn-bg` | `linear-gradient(180deg,#283341,#1a222c)` | `linear-gradient(180deg,#fffaf4,#fbece1)` | 次按钮底 |
| `--btn-edge` | `#3d4b5b` | `#ecd3b2` | 次按钮描边 |
| `--btn-text` | `#dfe7ef` | `#6a4a4f` | 次按钮文字 |
| `--slot-clip` | `polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)` (六边形) | `none`（用圆角） | 技能槽形状 |
| `--texture` | 碳纤斜织 + 熔岩斜纹(见下) | 窗棂镂花格 + 花点(见下) | 背景底纹 |

**棋子费用色 cost1–5**:玄铁 `#97a4b2 / #37c46e / #3a9bff / #bf6bff / #ffb024`;锦霞 `#b0a496 / #62b594 / #7aa1dd / #c189d2 / #dba94e`。

**势力 / 所有权色(内容色,两套皮肤通用)**:蜀红 `#d8504e` · 吴绿 `#3fae6e` · 魏蓝 `#3a86d4` · 群紫 `#9b6dd8`。合作模式所有权语言:我方=accent 描边高亮可拖;队友=势力色徽记只读;敌=魏蓝。

**底纹 `--texture`(叠在 `--app-bg` 之上,`background: var(--texture), var(--app-bg)`)**
- 玄铁:`repeating-linear-gradient(45deg, rgba(135,175,215,.055) 0 1px, transparent 1px 9px), repeating-linear-gradient(-45deg, rgba(135,175,215,.045) 0 1px, transparent 1px 9px), repeating-linear-gradient(45deg, rgba(255,93,46,.03) 0 2px, transparent 2px 42px)`
- 锦霞:`radial-gradient(circle, rgba(201,148,72,.16) 1px, transparent 1.7px) 0 0/26px 26px, radial-gradient(circle, rgba(216,96,123,.10) 1px, transparent 1.6px) 13px 13px/26px 26px, repeating-linear-gradient(45deg, rgba(201,148,72,.07) 0 1px, transparent 1px 26px), repeating-linear-gradient(-45deg, rgba(201,148,72,.07) 0 1px, transparent 1px 26px)`

### Typography（字体按组件可配置,5 个字体槽）
| 槽 | 玄铁 | 锦霞 | 用途 |
|---|---|---|---|
| `--font-display` | `'Zhi Mang Xing'` (狂草毛笔) | `'Ma Shan Zheng'` (行楷毛笔) | 大标题 / 玉印字心(张力夸张手写) |
| `--font-heading` | `'Rajdhani'` | `'Cormorant Garamond'` | 标题 / 按钮 |
| `--font-body` | `'Noto Sans SC'` | `'Noto Serif SC'` | 正文 |
| `--font-num` | `'Silkscreen'` (像素) | `'Silkscreen'` | 数字(两套共用,呼应"像素"题材) |
| `--font-script` | `'Caveat'` | `'Pacifico'` | 点缀 |

字体均来自 Google Fonts;字号原则:1080p 对局内不小于 24px(缩放前),组件库正文 13–15px。**每个组件引用各自字体 token,可独立替换**(例:`label` 标题走 `--font-heading`,数字走 `--font-num`)。

---

## 交互态规范（所有可交互组件统一）
- **hover**:抬升 `translateY(-2~3px)` + `brightness(1.06~1.1)` + 阴影增强;缓动 `.16s cubic-bezier(.2,.7,.3,1)`。
- **press (active)**:`translateY(1px) scale(.96~.97)` + `brightness(.93)` —— 机械下沉手感(必须有)。
- **focus-visible**:`box-shadow: 0 0 0 3px var(--accent-soft), 0 0 0 1px var(--accent)`(键盘 Tab 才触发)。
- **disabled**:`opacity:.4` + `grayscale(.4)` + `cursor:not-allowed`,去阴影。
- **loading**:文字转 `transparent` + 居中旋转 spinner(`border-top` 转圈 `.7s linear`)。
- **selected**:主色填充 / 边角点亮。
- 全部提供 `prefers-reduced-motion` 降级(关动画)。

---

## Screens / Views

### 1. 通用组件库 (`ZeroCraft UI Kit.dc.html`) — hifi
中性灰底文档页,每个组件一张白卡:卡头(编号 + 中/英名 + 字体标注)+ 描述 + **两皮并排**预览井(玄铁深色井 / 锦霞浅色井,各自挂该皮肤 token)。共 20 组件:

1. **button** 按钮 — 主(accent 渐变)/次(btn-bg)/危险(danger);全状态见上。圆角 `--btn-radius`。
2. **health-bar** 血条 — 高 16px,圆角 `--radius`;玄铁分段刻度(叠 `--bar-overlay` 斜纹)+ 低血红闪抖动,锦霞圆头柔光。HP/MP/EXP 用 `--hp/--mp/--xp`。
3. **skill-slot** 技能槽 — 66–76px;形状走 `--slot-clip`(玄铁六边形/锦霞圆角);就绪发光 / 冷却 conic 扫描遮罩 + 倒数 / 激活脉冲 / 禁用置灰;右下键位角标。
4. **panel** 面板 — `--panel-grad` + `--panel-border` + 内嵌 `--hairline`;标题栏 + ✕ + 正文。
5. **dialog** 对话框 — 立绘(62px)+ 缎带名牌(accent 渐变胶囊)+ 打字机正文 + ▼ 继续。
6. **menu** 菜单 — 垂直列表:默认 / 选中(accent 填充)/ 禁用。
7. **notification** 通知 — 横幅,左 3px 语义色条 + 圆形图标(success/warning/danger)。
8. **progress-bar** 进度条 — 同血条骨架;加载(accent)/经验(xp)。
9. **tooltip** 提示 — 气泡 + 45° 箭头,accent 描边。
10. **label** 标签 — 标题/正文/数字 + 品质色胶囊(普通灰 `#9aa6b2`/稀有蓝 `#3a9bff`/史诗紫 `#bf6bff`/传说金 `--gold`)。
11. **icon-badge** 图标角标 — 52px 图标盒 + 右上数量角标(danger)/红点(success)/NEW。
12. **inventory** 背包 — 56px 槽网格;稀有度发光边 `0 0 12px <color>55`;空槽虚线。
13. **mini-map** 小地图 — 210×150 框 + 网格地块 + 光点(我方 accent / 敌 danger / 盟 success)。
14. **avatar-frame** 头像框 — 80px 圆,`--accent-grad` 环 + 内圈头像 + 底部等级牌 + 在线点(success)。
15. **name-plate** 名牌 — 胶囊:小头像(势力色)+ 名 + 称号 + 等级;蜀红/吴绿区分。
16. **choice-option** 选项 — 大圆角胶囊:默认 / hover(右移 5px + 柔光)/ 选中(accent 填充)/ 禁用。
17. **tab-bar** 标签栏 — 激活态 accent 文字 + 底部 3px 能量条。
18. **slider** 滑块 — 8px 轨 + accent 填充 + 18px 白手柄(accent 描边);数值 `--font-num`。
19. **modal** 模态 — `--panel-grad` 卡 + **四角转角纹饰**(见下)+ 标题 + 正文 + 取消/确认。
20. **toast** — 轻量浮层:圆形语义图标 + 文案;短暂浮现自动消失。

### 2. 古风玉印图标语言(已并入 UI Kit / 对战)— hifi
- **八角玉印框(图标统一语言)**:八角 `clip-path: polygon(22% 0,78% 0,100% 22%,100% 78%,78% 100%,22% 100%,0 78%,0 22%)`;外圈 `--seal-edge` 古金,内嵌 `--panel-grad` 内收 2.5px + `inset 0 0 0 1.5px` 古金细线(双线描边);字心用 `--font-display` 毛笔字。
- **A 主操作**:双 ready 开战键三态(我未就绪 btn-bg → 已就绪 accent-soft + 脉冲点 → 双方就绪 accent 渐变 + 发光动画)、赠予、战场标记。
- **B 行动条**:刷新(2金)/买经验(4金)/锁店/卖出/招降/设置 —— 方形玉印 + 标签 + 金币角标。
- **C 图标库**:战/赠/旗/刷/验/锁/售/降/盟/命/符/星/金/设/援/退(均玉印 + 毛笔字)。
- **D 势力徽记**:蜀(红)/吴(绿)/魏(蓝)八角玉印。

### 3. 主对战界面 (`Game F 对战.dc.html`) — hifi · 推荐主参考（1280×720,内部按 1920×1080 绘制后整体 `scale(0.6667)`）
一个文件内 **单人 / 双人合作 × 玄铁 / 锦霞** 四组合切换。平盘(无河流/远山),清爽发光擂台。
- **顶 HUD**:STAGE + 回合 pips + 相位横幅 + 倒计时 +（单人:主公血 / 双人:**同盟共享血条**蜀红→吴绿渐变）+ 连胜。
- **棋盘(平盘)**:发光擂台上的六角棋盘 —— **单人 7 列×8 行;双人合作加宽到 10 列×8 行**(为两人联手提供布阵空间)。
- **备战席**:金铲铲式 —— **紧贴棋盘底部、与棋格对齐**的镶边托盘(9 格)。
- **底部条(瘦身)**:经济(金币/等级/买经验) + **「🏯 点将台·招募」触发按钮** + 开战键。
- **点将台商店(弹窗)**:点按钮弹出覆盖层 —— 五张英雄卡(带龙/凤转角);**买一名少一名**(显「已招募」)、可**刷新**(2金,重滚 5 张)、锁定/完成。已交互可点。
- **左栏羁绊**:双人模式额外出 **联盟羁绊「火烧赤壁」**(流光,6/8)。
- **右栏**:单人→强化符文 + 装备;双人→ **盟友镜像面板**(盟友·仲谋 + 血量 + 缩略战场 + 就绪状态)+ 共享装备库。
- **双 ready** + 所有权色:蜀红(我)/ 吴绿(盟)/ 魏蓝(敌)。

> 早期 `Game F Skins.dc.html` 保留棋子详情卡与水墨战场背景画法参考,但布局以本屏为准。
- **中 战场**:战场背景(水墨远山 + 雾 + 势力旌旗 + 氛围光)上的 **7×8 六角棋盘**(上 4 行敌、下 4 行我),半透明六角让地形透出;棋子带星级/血蓝条/势力色/名;小小英雄🜲 + 掉落法球。
- **右栏**:装备格 + 任务进度。
- **底操作区**(高 224):小小英雄+玩家血 / 备战席 9 格 / 商店 5 卡(费用分色)+ 经济按钮(刷新/买经验/锁)+ 开战键。
- **单位详情卡**:点棋子弹出 —— 大头像 + 星级 + 费用 + 势力/职业 chips + 生命/法力条 + 6 项属性格(攻击/法强/护甲/魔抗/攻速/射程)+ 技能描述 + 装备格。
- 顶部切换器:皮肤(玄铁/锦霞)+ 相位(备战/战斗)。

### 4. 商城 (`Game F 商城.dc.html`) — hifi（1280×720）
- 顶栏:商城标题 + 5 分页 tab(抽卡/皮肤/通行证/钻石/礼包,胶囊式激活态)+ 货币 HUD(💎钻石/🪙金币 + ＋)。
- **抽卡**:精选卡池横幅(**四角龙/凤转角纹饰** + 立绘占位 + UP 玉印 + 保底进度条 + 限时倒计时 + 单抽/十连按钮[十连带"送1次"角标])+ 侧栏常驻卡池。
- **皮肤**:3 列卡(势力色立绘占位 + 名 + 限时/折扣角标 + 💎价格)。
- **通行证**:横幅头(等级/剩余天数 + 解锁精英按钮带流光)+ 8 段双轨道(免费/精英)进度,当前级高亮。
- **钻石**:6 档位(💎数量 + 赠送 + 首充2倍/热卖/超值角标 + ¥价格)。
- **礼包**:3 张(势力色横幅 + 内容物 + 划线原价 + 折扣价 + 限购/热卖角标)。

### 转角纹饰（modal / 商城框专用）
四角装饰,按皮肤切换,内联 SVG 以 `data:image/svg+xml` 作 `background-image`,四角用 `transform: scaleX/Y(-1)` 镜像:
- **玄铁 = 龙鳞装甲角**:熔岩橙折角支架 + 鳞刺 + 金铆钉。
- **锦霞 = 凤羽卷草角**:玫瑰金凤羽卷曲羽流 + 小火苗。
- SVG 源码见 `ZeroCraft UI Kit.dc.html` / `Game F 商城.dc.html` 逻辑类中的 `dragonSvg` / `phoenixSvg`。

---

## Assets
- **无外部位图**。所有图标 = CJK 毛笔字(玉印框)或内联 CSS/SVG;转角纹饰 = 内联 SVG(data URI,源码在文件内)。立绘/卡池图为**占位渐变块**,需美术替换(按 `f.ui.*` 命名走资产流程)。
- **字体**:Google Fonts —— Zhi Mang Xing, Ma Shan Zheng, Rajdhani, Cormorant Garamond, Noto Sans SC, Noto Serif SC, Silkscreen, Caveat, Pacifico。生产可自托管。
- **Emoji 图标**(⚔🛡💎🪙🎁🔔 等)为占位,建议替换为统一图标集或延用玉印字心方案。

## State Management（对局/商城）
- 对局:`theme`(皮肤)、`phase`(备战/战斗)、`selected`(详情卡单位)。合作扩展:`ready_p1/p2`、`gold_p1/p2`(各管各)、共享 `player_hp`、`win_streak`、赠予冷却。
- 商城:`tab`(当前分页)、`theme`。
- 详细对局状态机/资源 id 见 `source-briefs/game-f-flow-spec.md`。

## 落地顺序建议
1. 先用 `tokens/*.tokens.css` 在 `src/ui/themes/<name>/` 建两套主题变量层。
2. 拆 `ZeroCraft UI Kit.dc.html` 为 20 个基础组件的 CSS(每组件一份,变量驱动)。
3. 照 `Game F 对战.dc.html` 搭对战壳层(单/双人共用骨架,双人棋盘 10 列)。
4. 照 `Game F 商城.dc.html` 搭商城壳层(对局外 DOM)。

> 所有对战要求已出齐。如需轮转/动画/音效等演出细节,参 `source-briefs/` 的状态机与资源词汇。合作规则(团队血、双 ready、联盟羁绊、赠予、⚑标记;河流已取消改平盘)见 `source-briefs/gamefcoopsunliu.md` 与 `gamefcoopuibrief.md`。
