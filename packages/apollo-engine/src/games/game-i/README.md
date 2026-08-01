# Game I · 控件测试场（UI Gallery）

> 它不做任何玩法——它的「玩法」就是玩 UI。把阿波罗引擎的**数据驱动 UI 控件**全部铺在一起，
> 可交互、可换皮、能看到信号流的逻辑测试场。以后游戏的 UI 都从这套底座里搭。

## 这是什么

Game I 把 `docs/design/apollo-ui-contract.md`（ZeroCraft UI 控件契约总表）落地成一个**活的控件画廊**：

- **控件全家桶**：引擎现有 30 个控件（Panel / Screen / Tabs / Table / Label / Badge / Image /
  Divider / Button / Input / Dropdown / Checkbox / Toggle / RadioGroup / Slider / ProgressBar /
  Tag / Modal / Toast / Tooltip / Accordion / Avatar / Card / Segmented / Stepper / Combobox /
  Drawer / Rating / VirtualList / ContextMenu）按「容器与布局 / 数据展示 / 输入与交互」三页铺开；
  模态浮层 / 抽屉由按钮开、点遮罩/× 关；Toast 飘字由按钮触发自动消失；Tooltip 悬停显气泡；
  Accordion 点标题开合；Combobox 可输入过滤；Rating 点星评分；VirtualList 千行虚拟滚动；
  ContextMenu 右键弹菜单。
- **换皮**：顶部下拉切 `UITheme` 令牌包（青瓷 / 暖金 / 冷雾），同一棵 `LayoutNode` 数据一字不改即变脸。
- **世界数据绑定（活 HUD）**：Label / ProgressBar / Image 可填 `bind=resourceId`，渲染前由
  `resolveBindings(tree, dataSource)` 读世界填字面值；「数据展示」页 HUD 演示受伤/治疗驱动血条与数字实时更新。
- **组合演示·商店（联动）**：第 4 页是一个多控件联动的小应用（MVU 模式）——分类 Segmented +
  搜索 Input 联动过滤 Card 网格；点商品出详情，Stepper 选数量→合计=单价×数量实时算；购买扣金币、
  记拥有、弹 Toast，买不起则按钮禁用。视图 `buildShop(state)` 与 reducer `applyShop(state,信号)` 全是
  纯函数（见 `shop.ts`），联动从「UI=状态的纯函数」涌现，宿主只持有状态 + 重挂，零命令式 UI 代码。
- **组合演示·选牌计分（多选 + 新能力）**：第 5 页证伪「多选是缺口」——多选≤5 = 状态 + Card tone 纯重组；
  同时实测三项新声明式能力：`rotate` 扇形手牌、`scale` 选中放大、`anim:dealIn` 发牌错峰入场、
  `draggable/dropZone` 把牌拖进「选入区」=点选。视图 `buildPickHand` + reducer `applyPick` + 牌型评估
  `evalHand` 全是纯函数（见 `pickcards.ts`）。
- **新增声明式 UI 能力（本会话下沉·三游戏重构所需真缺口）**：`LayoutConstraints` 新增
  `rotate/scale`（变换）、`anim/animMs/animDelay`（具名关键帧入场动画）、`draggable/dropZone`（HTML5 拖放·
  mountUI 内建手势）。全是数据字段（弱模型能填），渲染/手势由引擎解释，详见 `docs/workflow/requests.md`。
- **事件日志**：右栏实时打印每个控件发出的信号名 + 当前值，直观看到「填数据即出 UI、动一下就有信号」。

## 红线（沿用引擎契约）

- 画廊本体 `gallery.ts` 是 **100% `LayoutNode` 纯数据**：弱模型只填数据，引擎解释成像素。
- 事件 = **信号名字符串**（`action`）；回调逻辑写在 `handlers.ts`，二者只在信号名处相遇。
- 主题 = **`UITheme` 令牌**（颜色/字体字符串）；控件内不写死色值，数据层不碰 CSS/DOM。
- 渲染走引擎 `renderNode`（纯函数），挂载走引擎 `mountUI`（事件委托）。Game I 不重造任何控件。

## 目录

```
game-i/
  game-i.ts     卡带入口（launcher 槽 mount(container)→cleanup·两栏骨架 + mountUI + 换皮重挂）
  gallery.ts    控件画廊（纯 LayoutNode 数据·所有控件在此）
  handlers.ts   回调层（信号名 → 写事件日志）
  themes.ts     三套 UITheme 令牌包（换皮演示）
  index.ts      对外导出（mount / buildGallery / THEMES …）
  game-i.test.ts 渲染冒烟测试（结构/信号/换皮/转义）
```

## 运行

它是 launcher 里与其他游戏并列的卡带（游戏清单以 `src/launcher.tsx` GAMES 为准，不在此手抄），经 launcher / cartridge 入口挂载（槽契约 `mount(container)→cleanup`）。
在仓库根：

```bash
npm install      # 首次
npm run dev      # 启动 vite，从 launcher 选「Game I」进入
```

测试：

```bash
npx vitest run game-i
```

## 怎么加新控件

契约 §3 已排好待补控件队列（P0：Modal / ProgressBar / Tag / Toast / Tooltip → P1 → P2）。
每补一个引擎控件（`src/ui/components`），就在 `gallery.ts` 加一段它的样板数据，
Game I 即多一个可玩可验的格子——这里始终是所有控件的「逻辑测试场」。
