# ZeroCraft UI 控件契约总表（数据驱动 UI 库 · 开工蓝图）

> 本文是「阿波罗 UI」库的开工蓝图：把**现有引擎 UI 能力**盘清成数据接口规格，
> 再把**待补控件**设计成同一风格的契约。新库建好后整份搬过去，按规格逐个实现。
>
> 母法：`docs/design/data-driven-manifesto.md`。尺子始终是——
> **「最弱的 LLM 能不能也产出一模一样的数据？」** 能 → 数据接口；不能 → 不是控件，是越界。

---

## ✅ 实现现状（本表已从"蓝图"转为"现状"·就地建在 `src/ui/components/`）

控件库已基本完工。**30 个控件** + 主题系统 + 世界绑定 + 平台无关布局核，全部落地、门禁全绿。

| 块 | 内容 | 状态 |
|---|---|---|
| 原有 15 | Panel(含 grid 模式)/Screen/Tabs/Table/Label/Badge/Image/Divider/Button/Input/Dropdown/Checkbox/Toggle/RadioGroup/Slider | ✅ |
| P0(5) | ProgressBar / Tag / Modal / Toast / Tooltip | ✅ |
| P1(5) | Card / Stepper / Segmented / Avatar / Accordion | ✅ |
| P2(5) | Rating / Combobox / Drawer / **VirtualList** / **ContextMenu** | ✅ |
| 运行时(mountUI 内建) | 切页 / 遮罩关 / 定时 toast / hover tooltip / 折叠 / 搜索下拉 / 打字机 / 虚拟滚动 / 右键菜单 | ✅ |
| 世界绑定 | `Label/ProgressBar/Image.bind` + `resolveBindings(tree, ds)` + `UIDataSource`（收编 GameShell stat/bar/image-bind） | ✅ |
| VN 收编 | 演出 = 现有控件**组合**（StatPanel=Panel+绑定·Portrait=Avatar·ChoiceList=Panel+Button·VNStage=Screen+组合）+ 唯一真缺口 `Label.typewriter` | ✅ |
| 跨平台 | `solveLayout(root, viewport, measure)` 平台无关布局核（逻辑/视觉分离·支援微信小游戏 Canvas 后端） | ✅ |

**配套文档**：`docs/design/apollo-ui-porting-contract.md`（HTML→Canvas/微信小游戏 后端移植契约）。

**尚未落地（需 owner 调度·跨游戏·有风险）**：把现有用 React 的游戏（如 GameShell→game-f HUD/商店）**实际迁移**到统一 LayoutNode 底座、删 React 代码。能力层已就绪（绑定 + 打字机 + 组合都齐），但迁移触及多游戏代码，宜逐游戏审慎做。
**待办**：把各控件的"样式解析"（主题令牌→颜色/字号/边框）从 `render.ts` 抽成共享模块（让 Canvas 后端连样式都白捡）。

---

## 0. 设计不变量（ZeroCraft UI 的红线 · 任何控件都不许破）

1. **整个 UI 是数据**：一棵 `LayoutNode` 树，弱模型只填数据，引擎解释成像素。
2. **控件是闭集 union**：`type` 取自固定枚举，不滑成图灵完备 UI DSL。
3. **事件 = 信号名**（`action: string` → `data-action`），**绝不收自由函数/表达式**。
   回调函数（按下去干什么）由工程师在 `HandlerMap` 里写；数据里只出现信号名字符串。
4. **世界绑定 = resourceId**（`bind: string` 读 `Resource{id}`），绝不收自由取值表达式。
5. **主题 = `UITheme` 令牌**（颜色/字体**字符串**），控件内不写死色值、游戏层不写 CSS/DOM。
6. **渲染器是纯函数**（`renderNode(node, theme) → HTML 串`，无副作用、可单测）；
   **挂载器唯一**（`mountUI(host, root, handlers, theme) → teardown`，负责事件委托与运行时行为）。
7. **布局与逻辑彻底分离**：布局数据（LLM 填）↔ 回调逻辑（工程师写），二者只在**信号名字符串**处相遇。

---

## 1. 通用数据结构（所有控件共享）

```ts
// 一个 UI 数据单元。type + id + props 必填；layout/children 按需。
interface LayoutNode {
  type: ComponentType;          // 闭集枚举（见 §2/§3）
  id: string;                   // 唯一 id（事件 arg、切页锚点都用它）
  props: ComponentProps;        // 该控件的数据（见各控件契约）
  layout?: LayoutConstraints;   // 尺寸/弹性/排布
  children?: LayoutNode[];      // 容器类才有
}

// 尺寸/弹性/排布。x/y 触发绝对定位；flex 在父容器内生效。
interface LayoutConstraints {
  x?: number; y?: number; width?: number; height?: number;
  flex?: number; gap?: number;
  direction?: 'row' | 'column' | 'grid'; // grid = 卡牌格/货架自适应网格
  minCol?: number;                        // 仅 grid：单元格最小列宽 px（auto-fill·缺省 96）
  align?: 'start' | 'center' | 'end' | 'stretch';
  padding?: number; margin?: number;
}

// 主题令牌：renderNode/mountUI 取色取字的唯一来源。游戏传自己一份即「换皮」。
interface UITheme {
  bg0: string; bg1: string; bg2: string; bg3: string; pageBg: string;
  line: string;
  text: string; sub: string; dim: string;
  jade: string; jadeWash: string; jadeLine: string;
  gold: string;
  ok: string; okWash: string; warn: string; warnWash: string; danger: string;
  fontUi: string; fontMono: string;
}

type Handler = (arg?: string) => void;
type HandlerMap = Record<string, Handler>;   // 信号名 → 回调（工程师写）
```

> **换皮桥模式（已验证·game-g）**：把引擎控件嵌进一个 CSS-变量主题宿主时，令牌可填
> `'var(--panel)'` 这类引用 → 渲染片段自动随宿主皮走、零割裂。令牌仍是纯字符串数据。

---

## 2. 现有 15 控件契约（已实现 · `src/ui/components`）

> 以下 props 按当前 `types.ts` **精确转录**，是现成可用的事实规格。

### 容器类

```ts
// Panel —— 通用容器：flex 行/列 或 grid 网格；可加标题、可滚动。
interface PanelProps { title?: string; scroll?: boolean }
// 排布走 layout.direction：'column'(缺省) | 'row' | 'grid'(+minCol)。children = 子节点。

// Screen —— 全屏根容器（页面背景层）。
interface ScreenProps { bg?: string; image?: string; blur?: number; center?: boolean }

// Tabs —— 带标签的多页（= Table Pages）。引擎管切页：点 label 切页**不重建内容**（抗闪屏内建）。
interface TabsProps { tabs: { id: string; label: string }[]; active?: string; action?: string }
// children 顺序对齐 tabs（tabs[i] ↔ children[i]）。
```

### 数据展示类

```ts
// Table —— 数据表/榜单/数值表。游戏只填 columns + rows。
interface TableColumn { key: string; label: string; align?: 'left'|'center'|'right'; width?: number }
interface TableRow { id: string; cells: Record<string,string>; action?: string; tone?: 'normal'|'accent'|'dim' }
interface TableProps { columns: TableColumn[]; rows: TableRow[]; title?: string; empty?: string }

// Label —— 文本。5 尺寸 × 8 语义色 × 粗体/等宽。
interface LabelProps {
  text: string; size?: 'xs'|'sm'|'md'|'lg'|'xl';
  color?: 'text'|'sub'|'dim'|'jade'|'gold'|'ok'|'warn'|'danger'; bold?: boolean; mono?: boolean;
}

// Badge —— 小状态徽章。
interface BadgeProps { text: string; tone?: 'ok'|'warn'|'dim' }

// Image —— 图片/图标。
interface ImageProps { src: string; alt?: string; fit?: 'cover'|'contain'|'fill'; radius?: number }

// Divider —— 分隔线。props: {}（无）。
```

### 输入类（事件均走 action 信号名）

```ts
// Button —— 三态按钮。
interface ButtonProps { label: string; kind?: 'primary'|'ghost'|'quiet'; disabled?: boolean; action?: string; actionArg?: string }

// Input —— 文本/数字输入。handler 收到当前值。
interface InputProps { placeholder?: string; value?: string; type?: 'text'|'number'; action?: string }

// Dropdown —— 下拉选择。handler 收到所选 value。
interface DropdownProps { options: { value: string; label: string }[]; value?: string; placeholder?: string; action?: string }

// Checkbox —— 复选框。handler 收到 'true'|'false'。
interface CheckboxProps { label: string; checked?: boolean; action?: string }

// Toggle —— 药丸开关。handler 收到 'true'|'false'。
interface ToggleProps { label: string; checked?: boolean; action?: string }

// RadioGroup —— 互斥单选组。handler 收到所选 value。
interface RadioGroupProps { name: string; options: { value: string; label: string }[]; value?: string; action?: string }

// Slider —— 数值滑块。handler 收到数值字符串。
interface SliderProps { min?: number; max?: number; step?: number; value?: number; label?: string; action?: string }
```

**覆盖面**：表单（输入全套）、表格/榜单、标签多页、卡牌格/货架（Panel grid）、全屏页。

---

## 3. 控件契约（曾为"待补"·**现已全部实现**·见顶部现状表）

> ✅ 下列 P0/P1/P2 控件**均已落地** `src/ui/components/`（实际 props 以 `types.ts` 为准·部分字段较本设计略有微调）。
> 本节 props 规格保留作**设计参考**。props 风格：可选字段、tone 闭集、事件=信号名；标 `[mountUI]` 的有挂载器运行时行为。

### P0 · 高频刚需（做任何游戏几乎都要）

```ts
// Modal —— 居中模态浮层 + 遮罩 + 关闭语义（现在靠 Screen+Panel 手搭，提成控件去样板）。
interface ModalProps { title?: string; size?: 'sm'|'md'|'lg'; closable?: boolean; closeAction?: string }
// children = 弹窗体；点遮罩/关闭按钮 → closeAction 信号。 [mountUI: 遮罩点击关闭]

// ProgressBar —— 纯展示比例条（血/蓝/经验/进度）。区别于可拖的 Slider。
interface ProgressBarProps { value: number; max?: number; tone?: 'hp'|'mp'|'xp'|'accent'|'ok'|'warn'|'danger'; label?: string; showValue?: boolean }

// Tag —— 可点过滤标签/词条（game-g 大厅筛选条大量用）。
interface TagProps { label: string; active?: boolean; tone?: 'normal'|'accent'|'dim'; action?: string; actionArg?: string; removable?: boolean }

// Toast —— 非模态飘字提示（成功/失败/提醒），定时自动消失。
interface ToastProps { text: string; tone?: 'ok'|'warn'|'danger'|'dim'; duration?: number }
// 多由挂载器 API 触发（mountUI 返回的 toast(text,tone) ），而非常驻树。 [mountUI: 定时挂载/移除]

// Tooltip —— 悬浮提示/词条详情浮窗（知识库点名用 Popover API）。
interface TooltipProps { content: string; placement?: 'top'|'bottom'|'left'|'right' }
// 包裹一个 child 作触发元素；hover/focus 显示。 [mountUI: hover 显隐]
```

### P1 · 次高频

```ts
// Card —— 网格里「一张卡」的单元模板（媒体 + 标题 + 副标 + 角标 + 可点 + tone/锁态）。
interface CardProps { title?: string; sub?: string; media?: string; corner?: string; tone?: 'normal'|'accent'|'dim'|'locked'; action?: string; actionArg?: string }
// 可选 children 放自定义体；Card + Panel(grid) = 卡牌格/货架的标准组合。

// Stepper —— 数量加减（+/−）。handler 收到新值。
interface StepperProps { value: number; min?: number; max?: number; step?: number; action?: string }

// SegmentedControl —— 紧凑分段选择（比 RadioGroup 省地方）。
interface SegmentedProps { options: { value: string; label: string }[]; value?: string; action?: string }

// Avatar —— 头像/立绘位（VN PortraitSlot 的数据化版）。
interface AvatarProps { src?: string; name?: string; size?: number; shape?: 'circle'|'rounded'|'square' }

// Accordion —— 折叠面板（标题行点开/收起）。
interface AccordionProps { title: string; open?: boolean; action?: string }
// children = 折叠体。 [mountUI: 点标题切开合]
```

### P2 · 进阶/性能

```ts
// VirtualList —— 长列表虚拟滚动（Panel scroll 只是 overflow，海量项会卡）。
interface VirtualListProps { rows: { id: string; cells: Record<string,string> }[]; rowHeight: number; columns?: TableColumn[]; action?: string }
//  [mountUI: 滚动时按视口窗口化渲染]

// ContextMenu —— 右键/长按菜单。   interface ContextMenuProps { items: { id: string; label: string; action: string }[] }  [mountUI]
// Rating —— 星级评分。            interface RatingProps { value: number; max?: number; action?: string }
// Combobox —— 带搜索的下拉。       interface ComboboxProps { options: {value:string;label:string}[]; value?: string; action?: string }  [mountUI]
// Drawer —— 侧滑/底部抽屉。        interface DrawerProps { side?: 'left'|'right'|'bottom'; open?: boolean; closeAction?: string }  [mountUI]
```

---

## 4. 三套体系收编计划（碎片化 → 一套底座）

现状：`@ui/components`（ComponentType·15 控件·串渲染·框架无关）、`@ui/shell` GameShell（UINode·9 种·React·**绑世界**）、`@ui/vn`（React 演出组件）三套节点 schema 互不相通，主题也分 `UITheme`/`GameTheme`/`SHELL` 三处。ZeroCraft UI 以 `@ui/components` 为统一底座收编：

1. **并入世界绑定**（吃掉 shell 的独特价值）：给 LayoutNode 叶子加**绑定扩展**——
   ```ts
   // 读世界：stat/bar 绑 Resource{id}；不收自由表达式，只收 resourceId 字符串。
   interface BindProps { bind: string; /* Resource id */ label?: string }
   ```
   `stat`（数值）、`bar`（比例条·= ProgressBar 绑世界版）。按钮的 `action` 既可走 HandlerMap，也可注入 sim 信号——同一信号名契约，二选一由挂载层决定。**不再另起一套 UINode。**
2. **VN 演出数据化**：`DialogBox`/`PortraitSlot`/`ChoiceList`/`StatPanel` 重表达成 LayoutNode 控件
   （`Dialogue`/`Avatar`/`ChoiceList` 等），打字机/选项分支走 `[mountUI]` 运行时；去掉 React 专用。
3. **统一主题**：一套 `UITheme` 令牌 + 各游戏令牌包（game-g 已示范 onyx + lobby-bridge 两份）。
   `SHELL` 作引擎缺省脸；`themes/` 的游戏皮收敛成 UITheme 令牌包。

---

## 5. 构建顺序与验收

**顺序**：先补 P0（Modal → ProgressBar → Tag → Toast → Tooltip），再 P1（Card→Stepper→Segmented→Avatar→Accordion），
再 §4 收编（世界绑定 → VN 数据化），最后 P2。

**每个控件的验收清单（Definition of Done）**：
- [ ] `types.ts` 加 `ComponentType` 枚举 + props 接口（闭集·可选字段·tone 闭集·事件=信号名）
- [ ] `render.ts` 加纯函数渲染分支（全主题驱动·`esc()` 转义文本防 XSS·无内联死色）
- [ ] 需运行时行为的，`server.ts` `mountUI` 加事件/定时/hover 逻辑（含 teardown 解绑）
- [ ] `demo.ts` 加一份弱模型样板数据（证明「填数据即出 UI」）
- [ ] 单测：renderNode 串测（结构/主题/转义）+ 必要时 happy-dom 交互测
- [ ] 视觉 golden（`toMatchFileSnapshot`·浏览器可开）
- [ ] 门禁全绿：`tsc` 0 · `vitest` · `build` 0

**库结构建议**（新项目）：
```
apollo-ui/
  src/
    types.ts        # LayoutNode + 所有 props 契约（本表 §1-3）
    render.ts       # renderNode：纯函数解释器
    mount.ts        # mountUI：事件委托 + 运行时行为
    theme.ts        # UITheme 令牌契约 + 缺省 SHELL + 桥接助手
    demo/           # 各控件弱模型样板
  test/             # 串测 + 交互测 + golden
```
```
games/* 只产出：一棵 LayoutNode 数据 + 一份 UITheme 令牌 + 一个 HandlerMap。零 CSS/DOM。
```
