// UI 自描述目录（owner 2026-06-26：给 LayoutNode 也建「约束式数据合成」那台机器）。
//
// 一份数据三用：① 喂 LLM（whenToUse + 字段 schema + sample → 弱模型被告知闭 schema、照样例填空，
// 不再靠记忆瞎猜）；② 驱动校验器 `validate.ts`（未知 type / 错枚举 / 缺必填 → 报错）；③ 当 per-控件 sample 集
// （展示台/文档逐条渲染）。这正是 capability-catalog 那套自描述，复制到 UI 域——弱模型 hold 得住靠这台机器，不靠压小词表。
//
// 红线：本目录只描述**闭词表**（枚举值/类型/默认/必填），不含任何自由代码；sample 全是合法 LayoutNode 数据。

import type { ComponentType, LayoutNode } from './types.js';

/** 字段 schema：名 + 类型 + （枚举值/默认/必填）。type 是「数据形状」不是 TS 类型——弱模型按它填。 */
export interface UiPropSpec {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'enum-or-number' | 'node' | 'nodes' | 'list' | 'object';
  values?: readonly string[]; // type:'enum'/'enum-or-number'：具名档合法闭集（'enum-or-number' 另允许任意数字）
  default?: string | number | boolean;
  required?: boolean;
  describe: string;
}

/** 控件自描述：是什么 + 何时用 + 字段 schema + 是否收 children + 一个 canonical sample。 */
export interface UiComponentSpec {
  type: ComponentType;
  summary: string;
  whenToUse: string;
  children: 'none' | 'optional' | 'required'; // 是否/必须收 children
  props: readonly UiPropSpec[];
  sample: LayoutNode;
}

// Label 颜色令牌闭集（与 LabelProps.color 类型对齐·单一真相）：基础语义 + 阵营 mine/foe + 深墨 ink。
const COLOR = ['text', 'sub', 'dim', 'jade', 'gold', 'ok', 'warn', 'danger', 'mine', 'foe', 'ink'] as const;
const SIZE = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'xxxl'] as const;

export const UI_CATALOG: readonly UiComponentSpec[] = [
  // ── 容器 / 布局 ──────────────────────────────────────────────
  {
    type: 'Screen', summary: '全屏根容器·页面背景层', whenToUse: '每个页面的最外层根节点；铺底色/贴图、可居中内容。', children: 'optional',
    props: [
      { name: 'bg', type: 'string', describe: '面填充三态·色库优先：语义令牌 panel/raised/sunken/jade/gold/ok/warn/danger/ink/transparent(换皮自适应·transparent=透明底 see-through 带透明贴图) | 预设配色 jade-sheen/gold-sheen/ink-deep/steel/blood/frost/ember/void(固定观感) | {custom:"#hex"}(创作者特别指定才用)。缺省=主题 pageBg。裸 hex 串仍收但 audit 会标' },
      { name: 'image', type: 'string', describe: 'cover 整图背景 URL' },
      { name: 'bgTexture', type: 'string', describe: '平铺贴图 URL（repeat·可被 bgScroll 滚）' },
      { name: 'blur', type: 'number', describe: 'backdrop-filter 模糊 px' },
      { name: 'center', type: 'boolean', describe: '垂直水平居中子项' },
      { name: 'bgScroll', type: 'object', describe: 'UV 背景滚动 {x,y,ms}' },
    ],
    sample: { type: 'Screen', id: 's-screen', props: { center: true }, children: [{ type: 'Label', id: 's-screen-t', props: { text: 'Hello ZeroCraft', size: 'xl', color: 'gold', bold: true } }] },
  },
  {
    type: 'Panel', summary: '容器（边框/底/圆角）或无框布局组（bare）', whenToUse: '分组/卡片/侧栏/牌桌；row/column/grid 布局都靠它。只做布局分组用 bare 避免层层框。', children: 'optional',
    props: [
      { name: 'title', type: 'string', describe: '阔字距小标题' },
      { name: 'titleIcon', type: 'string', describe: '标题前内联图标 URL（1.05em 随字号·配台账套装图标·缺省纯文字）' },
      { name: 'scroll', type: 'boolean', describe: 'overflow-y:auto 可滚' },
      { name: 'bare', type: 'boolean', describe: '无框纯布局容器（不画边/底/圆角）' },
      { name: 'bg', type: 'string', describe: '面填充三态·色库优先：语义令牌 panel/raised/sunken/jade/gold/ok/warn/danger/ink/transparent(换皮自适应·transparent=透明底 see-through 带透明贴图) | 预设配色 jade-sheen/gold-sheen/ink-deep/steel/blood/frost/ember/void(固定观感) | {custom:"#hex"}(特别指定才用)。缺省=主题 bg1。裸串仍收但 audit 会标' },
      { name: 'vignette', type: 'boolean', describe: '四周渐暗暗角' },
      { name: 'accent', type: 'boolean', describe: 'jade 高亮框 + 柔光' },
      { name: 'glass', type: 'boolean', describe: '磨砂玻璃（backdrop-blur + 半透底·HUD 浮 3D/大图上）' },
      { name: 'skin', type: 'string', describe: '面覆盖皮 URL（复合按钮框皮·整面 cover/9-slice·art 即框·children 叠其上·配 action=贴图按钮·动态文字不烤进图）' },
      { name: 'skinSlice', type: 'number', describe: 'skin 9-slice 源边距 px（画框式·不填=cover）' },
      { name: 'bgTexture', type: 'string', describe: '平铺贴图 URL' },
      { name: 'pattern', type: 'enum', values: ['stripe', 'checker'], describe: '程序化纹理叠层（斜条纹/棋盘格）' },
      { name: 'action', type: 'string', describe: '容器可点→点击信号名（整个容器作点击目标·同 Button）' },
      { name: 'actionArg', type: 'string', describe: '点击信号参数' },
      { name: 'edge', type: 'enum', values: ['jade', 'gold', 'ok', 'warn', 'danger', 'mine', 'foe'], describe: '描边语义/阵营色（覆盖默认线·mine/foe=我/敌阵营框·配 layout.radius 异形/虚线 dashed）' },
      { name: 'dashed', type: 'boolean', describe: '虚线描边（落点/占位圈）' },
      { name: 'shape', type: 'enum', values: ['pill', 'hexagon', 'diamond', 'shield', 'ribbon', 'chevron', 'tag', 'cut'], describe: '异形容器轮廓（闭集·复用 Button 同套 clip-path·缺省=矩形）。非矩形容器（异形菜单卡/盾形板/蜂窝格）用它·不必贴图硬凑；命中区=包围盒·异形须给足宽高避免裁掉内容' },
    ],
    sample: { type: 'Panel', id: 's-panel', props: { title: 'SECTION' }, layout: { direction: 'column', gap: 8, padding: 16 }, children: [{ type: 'Label', id: 's-panel-l', props: { text: '面板内容' } }] },
  },
  // ── 文本 / 媒体 ──────────────────────────────────────────────
  {
    type: 'Label', summary: '文本（颜色/字号/字体/绑定/打字机/数字滚动/富文本）', whenToUse: '一切静态/绑定文字。多段着色用 spans；数字滚动用 tween；绑世界值用 bind。', children: 'none',
    props: [
      { name: 'text', type: 'string', describe: '文本（spans/tween/bind 提供内容时可省）' },
      { name: 'size', type: 'enum-or-number', values: SIZE, default: 'md', describe: '字号档（具名令牌 xs10..xxxl34·保和谐默认）或裸 px 数字（复刻像素稿精确字号·8→任意大）' },
      { name: 'color', type: 'enum', values: COLOR, default: 'text', describe: '颜色令牌' },
      { name: 'bold', type: 'boolean', describe: '加粗' },
      { name: 'font', type: 'enum', values: ['ui', 'mono', 'pixel', 'display', 'serif', 'impact', 'heavy', 'epic', 'fantasy', 'elegant', 'script', 'hand', 'scifi', 'terminal', 'comic', 'stencil', 'western', 'retro', 'marker', 'bubbly', 'gothic', 'fashion', 'shadow', 'cnbrush', 'cnwen', 'jpbrush', 'jppen'], describe: '字体槽：基础 ui/mono/pixel/display/serif + 18 款拉丁艺术字（OFL·base64）+ 4 款 CJK 艺术字（cnbrush/cnwen 中文·jpbrush/jppen 日文·能渲汉字假名·url 惰性载）' },
      { name: 'glow', type: 'boolean', describe: '磷光发光（按 color 描柔光）' },
      { name: 'stroke', type: 'boolean', describe: '描边字（comic 深色粗轮廓·卡通标题·可与 glow 叠）' },
      { name: 'bind', type: 'string', describe: '绑 Resource id（resolveBindings 接 current）' },
      { name: 'typewriter', type: 'number', describe: '打字机每字 ms' },
      { name: 'tween', type: 'object', describe: '数字滚动 {from,to,ms,decimals}' },
      { name: 'format', type: 'enum', values: ['compact', 'time', 'percent', 'int'], describe: '数字格式化(作用于 tween/数字 text)：compact 1.2K/3.4M/1.5B·time mm:ss/h:mm:ss·percent 75%·int' },
      { name: 'spans', type: 'list', describe: '富文本多段 [{text,color,bold,img}]·img=段首内联图标 URL(1em 随字号)' },
      { name: 'raw', type: 'boolean', describe: 'emoji 图渲逃生：保留文本里的 emoji 字形不转美术图（代码块/刻意展字形·仅当主题开了 emoji 图渲时有意义）' },
    ],
    sample: { type: 'Label', id: 's-label', props: { text: '战功 ', spans: [{ text: '天罡 ', color: 'gold', bold: true }, { text: '破·可克', color: 'jade' }] } },
  },
  {
    type: 'Image', summary: '图片/图标', whenToUse: '展示图片；动态图用 bind（StringVar id → src）。', children: 'none',
    props: [
      { name: 'src', type: 'string', required: true, describe: '图片 URL' },
      { name: 'alt', type: 'string', describe: '替代文本' },
      { name: 'fit', type: 'enum', values: ['cover', 'contain', 'fill'], describe: 'object-fit' },
      { name: 'radius', type: 'number', describe: '圆角 px' },
      { name: 'bind', type: 'string', describe: '绑 StringVar id 取动态 src' },
    ],
    sample: { type: 'Image', id: 's-image', props: { src: '/logo.png', fit: 'contain', radius: 8 } },
  },
  { type: 'Divider', summary: '分隔线', whenToUse: '分隔区块。', children: 'none', props: [], sample: { type: 'Divider', id: 's-divider', props: {} } },
  {
    type: 'Avatar', summary: '头像位（图/首字）', whenToUse: '玩家/角色头像；无图取 name 首字。', children: 'none',
    props: [
      { name: 'src', type: 'string', describe: '头像 URL（无则取首字）' },
      { name: 'name', type: 'string', describe: '名（取首字作占位）' },
      { name: 'size', type: 'number', describe: '尺寸 px' },
      { name: 'shape', type: 'enum', values: ['circle', 'rounded', 'square'], describe: '形状' },
    ],
    sample: { type: 'Avatar', id: 's-avatar', props: { name: '关羽', size: 44, shape: 'circle' } },
  },
  {
    type: 'Video', summary: '视频嵌入', whenToUse: '开场/转场短视频。autoplay 自动补 muted。', children: 'none',
    props: [
      { name: 'src', type: 'string', describe: '视频 URL' },
      { name: 'poster', type: 'string', describe: '海报 URL' },
      { name: 'controls', type: 'boolean', default: true, describe: '显示控件' },
      { name: 'loop', type: 'boolean', describe: '循环' },
      { name: 'autoplay', type: 'boolean', describe: '自动播（补 muted）' },
    ],
    sample: { type: 'Video', id: 's-video', props: { src: '/intro.mp4', controls: true } },
  },
  {
    type: 'Particles', summary: 'UI 庆祝粒子叠层', whenToUse: '通关撒纸屑/领奖金币雨/星光爆/环境微光。铺满父容器(给父 width/height + position)。follow:"cursor"=收成小簇跟随光标(桌面微尘·render-only)。render-only·不进 sim。', children: 'none',
    props: [
      { name: 'kind', type: 'enum', values: ['confetti', 'coins', 'stars', 'sparkle'], required: true, describe: '纸屑雨/金币雨/星光爆(径向)/环境微光' },
      { name: 'count', type: 'number', describe: '粒子数(缺省 confetti 26·余 16·上限 60)' },
      { name: 'loop', type: 'boolean', default: true, describe: 'true=持续循环(展示/环境)·false=播一次(庆祝一次性)' },
      { name: 'follow', type: 'enum', values: ['cursor'], describe: '跟随光标态：粒子收小簇·软遮罩+screen混色·JS缓动逼近指针·离场淡出(render-only胶水在渲染器侧)' },
    ],
    sample: { type: 'Particles', id: 's-particles', props: { kind: 'confetti' }, layout: { width: 200, height: 120 } },
  },
  {
    type: 'LevelPath', summary: '关卡地图（蛇形蜿蜒路径 + 状态节点）', whenToUse: '休闲选关屏（Candy Crush 式）。给节点列表 + 状态，引擎排蛇形路径/画连线/渲节点。点节点发 action 选关。', children: 'none',
    props: [
      { name: 'nodes', type: 'list', required: true, describe: '[{label?,state?:done/current/locked,stars?:0-3,action?,actionArg?}]·节点列表(蛇形自动排)' },
      { name: 'cols', type: 'number', default: 3, describe: '每行几个(蛇形宽度)' },
      { name: 'tone', type: 'enum', values: ['jade', 'gold', 'accent'], default: 'gold', describe: '已通关路径/节点主色' },
    ],
    sample: { type: 'LevelPath', id: 's-levelpath', props: { cols: 3, tone: 'gold', nodes: [
      { label: '1', state: 'done', stars: 3, action: 'pickLevel', actionArg: '1' },
      { label: '2', state: 'done', stars: 2, action: 'pickLevel', actionArg: '2' },
      { label: '3', state: 'current', action: 'pickLevel', actionArg: '3' },
      { label: '4', state: 'locked' }, { label: '5', state: 'locked' },
    ] } },
  },
  {
    type: 'Float', summary: '锚定浮层（钉在活动目标上）', whenToUse: '头顶名牌/血条/伤害数/选中光标/战场徽标——把 children 每帧定位到目标 rect。取代手写 getElementById+getBoundingClientRect。目标消失自隐。', children: 'optional',
    props: [
      { name: 'anchorTo', type: 'object', required: true, describe: '{kind:node(同树 LayoutNode id·现一律用这路)/entity(预留·生产端未接·别用), id, at?:center/top/bottom/left/right, offset?:{x,y}}' },
      { name: 'ttlTicks', type: 'number', describe: '存活帧数（缺省常驻·给了 N 帧后自隐·伤害数飘完即消）' },
    ],
    sample: { type: 'Float', id: 's-float', props: { anchorTo: { kind: 'node', id: 'some-target', at: 'top', offset: { y: -8 } } },
      children: [{ type: 'Badge', id: 's-float-b', props: { text: '★ BOSS', tone: 'warn' } }] },
  },
  {
    type: 'Connector', summary: '锚定连线（谁打谁）', whenToUse: '两目标间连线（VS 连线/攻击指向/关系线）·每帧跟随两端。', children: 'none',
    props: [
      { name: 'from', type: 'object', required: true, describe: '起点锚 {kind,id,at?}' },
      { name: 'to', type: 'object', required: true, describe: '终点锚 {kind,id,at?}' },
      { name: 'style', type: 'enum', values: ['solid', 'dashed', 'arrow'], describe: '线型（缺省 solid）' },
      { name: 'tone', type: 'enum', values: ['jade', 'gold', 'ok', 'warn', 'danger'], describe: '线色令牌（非裸 hex）' },
      { name: 'label', type: 'string', describe: '线中点标（伤害/关系）' },
    ],
    sample: { type: 'Connector', id: 's-conn', props: { from: { kind: 'node', id: 'a' }, to: { kind: 'node', id: 'b' }, style: 'arrow', tone: 'danger', label: '−120' } },
  },
  // ── 按钮 / 输入 ──────────────────────────────────────────────
  {
    type: 'Button', summary: '按钮（四种风格·点击发信号）', whenToUse: '一切点击动作。主 CTA 用 hero（金色倒角 sheen）。action=信号名，由 sim 能力消费。', children: 'none',
    props: [
      { name: 'label', type: 'string', required: true, describe: '按钮文字' },
      { name: 'kind', type: 'enum', values: ['primary', 'ghost', 'quiet', 'hero'], default: 'ghost', describe: '风格' },
      { name: 'action', type: 'string', describe: '点击发的信号名' },
      { name: 'actionArg', type: 'string', describe: '信号参数（买哪件等）' },
      { name: 'disabled', type: 'boolean', describe: '禁用' },
      { name: 'sub', type: 'string', describe: 'hero 键副标' },
      { name: 'shape', type: 'enum', values: ['pill', 'hexagon', 'diamond', 'shield', 'ribbon', 'chevron', 'tag', 'cut'], describe: '异形轮廓（闭集·引擎预置 clip-path·缺省=矩形）。异形需给足宽高避免裁掉文字' },
      { name: 'skin', type: 'string', describe: '贴图皮=已解析图 URL（同 Image.src·sim 持 key·游戏经 resolveAsset 解析后填）。设了则按钮底=该图 cover+白字投影；配 shape 可做透明 PNG 异形贴图键。命中区=包围盒' },
      { name: 'skinSlice', type: 'number', describe: '9-slice 无损缩放（源边距 px）。设了则 skin 走 border-image 九宫格：四角固定·边中拉伸·任意尺寸不变形（治 cover 拉伸）。缺省=cover' },
      { name: 'icon', type: 'string', describe: '键首内联图标 URL（1em 随字号·居 label 前）' },
    ],
    sample: { type: 'Button', id: 's-button', props: { label: '⚔ 出征 · 第 3 关', kind: 'hero', sub: '挑战 曹操 · 难度 ★★', action: 'play' } },
  },
  {
    type: 'Input', summary: '文本输入框', whenToUse: '搜索/表单输入。change 发 action(arg=值)。', children: 'none',
    props: [
      { name: 'placeholder', type: 'string', describe: '占位提示' },
      { name: 'value', type: 'string', describe: '当前值' },
      { name: 'type', type: 'enum', values: ['text', 'number'], describe: '输入类型' },
      { name: 'action', type: 'string', describe: 'change 信号名' },
    ],
    sample: { type: 'Input', id: 's-input', props: { placeholder: '搜索英雄…', action: 'search' } },
  },
  {
    type: 'Dropdown', summary: '原生下拉选择', whenToUse: '少量固定选项选一。change 发 action(arg=value)。', children: 'none',
    props: [
      { name: 'options', type: 'list', required: true, describe: '[{value,label}]' },
      { name: 'value', type: 'string', describe: '选中 value' },
      { name: 'placeholder', type: 'string', describe: '占位项' },
      { name: 'action', type: 'string', describe: '选择信号名' },
    ],
    sample: { type: 'Dropdown', id: 's-dropdown', props: { options: [{ value: 'gx', label: '关羽' }, { value: 'zf', label: '张飞' }], value: 'gx', action: 'pickHero' } },
  },
  {
    type: 'Combobox', summary: '带搜索的下拉', whenToUse: '选项多、需搜索过滤时（比 Dropdown 强）。', children: 'none',
    props: [
      { name: 'options', type: 'list', required: true, describe: '[{value,label}]' },
      { name: 'value', type: 'string', describe: '选中 value' },
      { name: 'placeholder', type: 'string', describe: '占位' },
      { name: 'action', type: 'string', describe: '选择信号名' },
    ],
    sample: { type: 'Combobox', id: 's-combobox', props: { options: [{ value: 'gx', label: '关羽' }, { value: 'zf', label: '张飞' }], placeholder: '搜名将…', action: 'pickHero' } },
  },
  {
    type: 'Checkbox', summary: '勾选框', whenToUse: '单个开关项。handler 收 "true"/"false"。', children: 'none',
    props: [{ name: 'label', type: 'string', required: true, describe: '标签' }, { name: 'checked', type: 'boolean', describe: '勾选' }, { name: 'action', type: 'string', describe: '信号名' }],
    sample: { type: 'Checkbox', id: 's-checkbox', props: { label: '音效', checked: true, action: 'toggleSfx' } },
  },
  {
    type: 'Toggle', summary: '药丸开关', whenToUse: '设置项开/关（比 Checkbox 更醒目）。', children: 'none',
    props: [{ name: 'label', type: 'string', required: true, describe: '标签' }, { name: 'checked', type: 'boolean', describe: '开' }, { name: 'action', type: 'string', describe: '信号名' }],
    sample: { type: 'Toggle', id: 's-toggle', props: { label: '背景音乐', checked: true, action: 'toggleBgm' } },
  },
  {
    type: 'RadioGroup', summary: '互斥单选组', whenToUse: '一组选一（难度/阵营）。handler 收所选 value。', children: 'none',
    props: [
      { name: 'name', type: 'string', required: true, describe: '分组名' },
      { name: 'options', type: 'list', required: true, describe: '[{value,label}]' },
      { name: 'value', type: 'string', describe: '选中' }, { name: 'action', type: 'string', describe: '信号名' },
    ],
    sample: { type: 'RadioGroup', id: 's-radio', props: { name: 'diff', options: [{ value: 'easy', label: '简单' }, { value: 'hard', label: '困难' }], value: 'easy', action: 'setDiff' } },
  },
  {
    type: 'Segmented', summary: '紧凑分段选择', whenToUse: '少量选项横排选一（比 RadioGroup 省地方）。', children: 'none',
    props: [{ name: 'options', type: 'list', required: true, describe: '[{value,label}]' }, { name: 'value', type: 'string', describe: '选中' }, { name: 'action', type: 'string', describe: '信号名' }],
    sample: { type: 'Segmented', id: 's-segmented', props: { options: [{ value: 'all', label: '全部' }, { value: 'own', label: '已有' }], value: 'all', action: 'filter' } },
  },
  {
    type: 'Slider', summary: '数值滑块', whenToUse: '连续数值（音量/缩放）。handler 收数值串。', children: 'none',
    props: [{ name: 'min', type: 'number', describe: '最小' }, { name: 'max', type: 'number', describe: '最大' }, { name: 'step', type: 'number', describe: '步进' }, { name: 'value', type: 'number', describe: '当前值' }, { name: 'label', type: 'string', describe: '标签' }, { name: 'action', type: 'string', describe: '信号名' }],
    sample: { type: 'Slider', id: 's-slider', props: { min: 0, max: 100, value: 70, label: '音量', action: 'setVol' } },
  },
  {
    type: 'Stepper', summary: '数量 ± 加减', whenToUse: '小整数增减（购买数量）。到界禁用。', children: 'none',
    props: [{ name: 'value', type: 'number', required: true, describe: '当前值' }, { name: 'min', type: 'number', describe: '下界' }, { name: 'max', type: 'number', describe: '上界' }, { name: 'step', type: 'number', describe: '步进' }, { name: 'action', type: 'string', describe: '信号名' }],
    sample: { type: 'Stepper', id: 's-stepper', props: { value: 3, min: 0, max: 9, action: 'qty' } },
  },
  {
    type: 'Rating', summary: '星级评分', whenToUse: '难度/星级展示或打分。有 action 可点设值。', children: 'none',
    props: [{ name: 'value', type: 'number', required: true, describe: '已亮颗数' }, { name: 'max', type: 'number', default: 5, describe: '总颗' }, { name: 'action', type: 'string', describe: '可点设值信号' }],
    sample: { type: 'Rating', id: 's-rating', props: { value: 3, max: 5 } },
  },
  // ── 数据展示 ────────────────────────────────────────────────
  {
    type: 'Badge', summary: '小徽章', whenToUse: '状态标记（OK/警告/淡）。', children: 'none',
    props: [{ name: 'text', type: 'string', required: true, describe: '文字' }, { name: 'tone', type: 'enum', values: ['ok', 'warn', 'dim'], describe: '着色' }],
    sample: { type: 'Badge', id: 's-badge', props: { text: '稀有', tone: 'ok' } },
  },
  {
    type: 'Tag', summary: '可点过滤标签/词条', whenToUse: '筛选条/词条；可点(active 高亮)、可删。', children: 'none',
    props: [
      { name: 'label', type: 'string', required: true, describe: '文字' },
      { name: 'active', type: 'boolean', describe: '高亮' },
      { name: 'tone', type: 'enum', values: ['normal', 'accent', 'dim'], describe: '着色' },
      { name: 'action', type: 'string', describe: '点击信号' }, { name: 'actionArg', type: 'string', describe: '参数' },
      { name: 'removable', type: 'boolean', describe: '显 × 可删' },
      { name: 'icon', type: 'string', describe: '首部内联图标 URL（1em 随字号·货币/生肖 pill 换套装图标）' },
      { name: 'size', type: 'enum', values: ['sm', 'md', 'lg'], default: 'md', describe: '尺寸档（lg=货币计数等大气药丸·≈2x）' },
    ],
    sample: { type: 'Tag', id: 's-tag', props: { label: '黑桃 ♠', active: true, action: 'filterSuit', actionArg: 'spade' } },
  },
  {
    type: 'ProgressBar', summary: '比例条 / 环形进度（血/蓝/经验/体力环/冷却环）', whenToUse: '展示比例。value/max；线性条缺省，环形/径向用 shape:ring(体力/每日目标/冷却环)；绑世界用 bind。', children: 'none',
    props: [
      { name: 'value', type: 'number', required: true, describe: '当前值' },
      { name: 'max', type: 'number', default: 1, describe: '满值' },
      { name: 'tone', type: 'enum', values: ['accent', 'gold', 'ok', 'warn', 'danger'], describe: '着色' },
      { name: 'label', type: 'string', describe: '标签' }, { name: 'showValue', type: 'boolean', describe: '显数值' },
      { name: 'shape', type: 'enum', values: ['bar', 'ring'], default: 'bar', describe: 'bar=线性条 / ring=环形径向(conic·中心显值)' },
      { name: 'size', type: 'number', default: 64, describe: '环直径 px(shape:ring 用)' },
      { name: 'bind', type: 'string', describe: '绑 Resource id' },
    ],
    sample: { type: 'ProgressBar', id: 's-progress', props: { value: 30, max: 120, tone: 'danger', label: '生命', showValue: true } },
  },
  {
    type: 'Table', summary: '数据表/榜单', whenToUse: '行列数据（排行榜/数值表）。', children: 'none',
    props: [
      { name: 'columns', type: 'list', required: true, describe: '[{key,label,align,width}]' },
      { name: 'rows', type: 'list', required: true, describe: '[{id,cells,action,tone}]' },
      { name: 'title', type: 'string', describe: '标题' }, { name: 'empty', type: 'string', describe: '空占位文案' },
    ],
    sample: { type: 'Table', id: 's-table', props: { title: '天梯榜', columns: [{ key: 'rank', label: '名次', width: 50 }, { key: 'name', label: '玩家' }, { key: 'score', label: '积分', align: 'right' }], rows: [{ id: 'r1', cells: { rank: '1', name: '不翻就赢', score: '2380' }, tone: 'accent' }, { id: 'r2', cells: { rank: '2', name: '常胜将军', score: '2210' } }] } },
  },
  {
    type: 'VirtualList', summary: '长列表虚拟滚动', whenToUse: '千行级列表（只渲可视窗口）。', children: 'none',
    props: [
      { name: 'rows', type: 'list', required: true, describe: '[{id,cells}]' },
      { name: 'rowHeight', type: 'number', required: true, describe: '固定行高 px' },
      { name: 'columns', type: 'list', describe: '列定义（同 Table）' },
      { name: 'height', type: 'number', default: 320, describe: '视口高 px' }, { name: 'action', type: 'string', describe: '行点击信号' },
    ],
    sample: { type: 'VirtualList', id: 's-vlist', props: { rowHeight: 28, height: 140, columns: [{ key: 'name', label: '名' }], rows: [{ id: 'a', cells: { name: '第 1 行' } }, { id: 'b', cells: { name: '第 2 行' } }], action: 'pickRow' } },
  },
  {
    type: 'Card', summary: '网格卡单元', whenToUse: '配 Panel grid 做卡牌格/货架。媒体+标题+副标+角标。', children: 'optional',
    props: [
      { name: 'title', type: 'string', describe: '标题' }, { name: 'sub', type: 'string', describe: '副标' },
      { name: 'media', type: 'string', describe: '媒体字形/emoji；或图片 URL（/·http·data: 开头自动按图渲）' }, { name: 'corner', type: 'string', describe: '角标' },
      { name: 'tone', type: 'enum', values: ['normal', 'accent', 'dim', 'locked'], describe: '着色/锁态' },
      { name: 'action', type: 'string', describe: '点击信号' }, { name: 'actionArg', type: 'string', describe: '参数' },
    ],
    sample: { type: 'Card', id: 's-card', props: { media: '🃏', title: '同袍', sub: '🪙 16', corner: '稀有', tone: 'accent', action: 'buy', actionArg: 'comrade' } },
  },
  {
    type: 'PlayingCard', summary: '扑克牌原语', whenToUse: '一切扑克/卡牌牌面。流式卡墙用 fluid+Panel grid cols；桌面悬停翻面 flipOnHover+backFace，手机/state 驱动翻面用 flipped+backFace（触屏可用）。', children: 'none',
    props: [
      { name: 'rank', type: 'string', required: true, describe: "点数 'A'/'K'/'10'…" },
      { name: 'suit', type: 'string', required: true, describe: "花色 '♠'|'♥'|'♦'|'♣'" },
      { name: 'faceUp', type: 'boolean', default: true, describe: 'false=牌背' },
      { name: 'size', type: 'enum', values: ['sm', 'md', 'lg'], default: 'md', describe: '尺寸档' },
      { name: 'face', type: 'enum', values: ['dark', 'light'], describe: '暗卡/经典白牌' },
      { name: 'selected', type: 'boolean', describe: '选中金边' }, { name: 'dimmed', type: 'boolean', describe: '暗化' },
      { name: 'fluid', type: 'boolean', describe: '充满父格(5:7)·配 grid cols' },
      { name: 'flipOnHover', type: 'boolean', describe: '悬停翻面（桌面·:hover）' },
      { name: 'flipped', type: 'boolean', describe: '状态驱动翻面（true=背面·点按/state 翻·触屏可用·与 flipOnHover 互斥）' },
      { name: 'backFace', type: 'node', describe: '背面信息子树（flipOnHover/flipped 时渲）' },
      { name: 'backPattern', type: 'enum', values: ['checker', 'stripe'], describe: '牌背纹理（faceUp:false 时）' },
      { name: 'backArt', type: 'string', describe: '牌背贴图 URL（faceUp:false 时整面 cover·替代纹样字符/backPattern）' },
      { name: 'art', type: 'string', describe: '立绘 URL（中央剪影·角标花色仍在）' },
      { name: 'faceArt', type: 'string', describe: '整牌面贴图 URL（faceUp 时整面 cover·角标/花色全隐·牌面即一张插画·backArt 的正面版）' },
      { name: 'faceArtSlice', type: 'number', describe: 'faceArt 9-slice 源边距 px（画框式牌面·不填=cover）' },
      { name: 'label', type: 'string', describe: '牌下标签' },
      { name: 'action', type: 'string', describe: '点击信号' },
    ],
    sample: { type: 'PlayingCard', id: 's-pcard', props: { rank: 'A', suit: '♠', face: 'light', label: '关羽', selected: true } },
  },
  // ── 浮层 / 反馈 ──────────────────────────────────────────────
  {
    type: 'Modal', summary: '居中模态浮层 + 遮罩', whenToUse: '居中弹窗（确认框/详情/商城）。点遮罩本身关。children=弹窗体。', children: 'optional',
    props: [
      { name: 'title', type: 'string', describe: '标题' },
      { name: 'size', type: 'enum', values: ['sm', 'md', 'lg'], describe: '宽度档' },
      { name: 'closable', type: 'boolean', default: true, describe: '显 ×' },
      { name: 'closeAction', type: 'string', describe: '关闭信号（点×/点遮罩）' },
    ],
    sample: { type: 'Modal', id: 's-modal', props: { title: '返回大厅？', size: 'sm', closeAction: 'close' }, children: [{ type: 'Label', id: 's-modal-b', props: { text: '进度将丢失。' } }] },
  },
  {
    type: 'Drawer', summary: '侧滑/底部抽屉', whenToUse: '贴边抽屉（设置/背包）。机制同 Modal。', children: 'optional',
    props: [
      { name: 'side', type: 'enum', values: ['left', 'right', 'bottom'], describe: '贴边方位' },
      { name: 'title', type: 'string', describe: '标题' }, { name: 'closeAction', type: 'string', describe: '关闭信号' },
    ],
    sample: { type: 'Drawer', id: 's-drawer', props: { side: 'right', title: '设置', closeAction: 'closeDrawer' }, children: [{ type: 'Label', id: 's-drawer-b', props: { text: '抽屉内容' } }] },
  },
  {
    type: 'Tooltip', summary: '悬浮提示/词条浮窗', whenToUse: '包裹触发元素(children)，hover 显气泡。富内容用 bubble(LayoutNode)。', children: 'required',
    props: [
      { name: 'content', type: 'string', describe: '简单文本气泡' },
      { name: 'placement', type: 'enum', values: ['top', 'bottom', 'left', 'right'], default: 'top', describe: '气泡方位' },
      { name: 'bubble', type: 'node', describe: '富气泡根（Panel+Label·替代 content）' },
      { name: 'block', type: 'boolean', describe: '块级触发(display:block+充满)·能作 grid/flex item 拉伸不塌陷' },
    ],
    sample: { type: 'Tooltip', id: 's-tooltip', props: { content: '该牌掷命翻正概率', placement: 'top' }, children: [{ type: 'Badge', id: 's-tooltip-t', props: { text: '?' } }] },
  },
  {
    type: 'ContextMenu', summary: '右键/长按菜单', whenToUse: '包裹触发元素(children)，右键弹菜单。', children: 'required',
    props: [{ name: 'items', type: 'list', required: true, describe: '[{id,label,action}]' }],
    sample: { type: 'ContextMenu', id: 's-ctx', props: { items: [{ id: 'del', label: '删除', action: 'doDelete' }] }, children: [{ type: 'Label', id: 's-ctx-t', props: { text: '右键我' } }] },
  },
  {
    type: 'Toast', summary: '飘字提示（非模态）', whenToUse: '操作反馈药丸（保存成功）。也可由 showToast() API 定时自消。', children: 'none',
    props: [{ name: 'text', type: 'string', required: true, describe: '文字' }, { name: 'tone', type: 'enum', values: ['ok', 'warn', 'danger', 'accent', 'dim'], describe: '着色' }, { name: 'duration', type: 'number', default: 2600, describe: '自消 ms' }],
    sample: { type: 'Toast', id: 's-toast', props: { text: '保存成功', tone: 'ok' } },
  },
  {
    type: 'Accordion', summary: '折叠面板', whenToUse: '可折叠区块（高级设置）。点标题切开合。', children: 'optional',
    props: [{ name: 'title', type: 'string', required: true, describe: '标题行' }, { name: 'open', type: 'boolean', describe: '初始展开' }, { name: 'action', type: 'string', describe: '可选切换信号' }],
    sample: { type: 'Accordion', id: 's-accordion', props: { title: '高级设置' }, children: [{ type: 'Label', id: 's-accordion-b', props: { text: '折叠体内容' } }] },
  },
  {
    type: 'Tabs', summary: '多页签（引擎管切换·不重建页）', whenToUse: '多页内容切换。children 顺序对齐 tabs（tabs[i]↔children[i]）。', children: 'required',
    props: [
      { name: 'tabs', type: 'list', required: true, describe: '[{id,label,anchor?,icon?}]（anchor=新手引导锚点·icon=页签文字前内联图标 URL·缺省纯文字）' },
      { name: 'active', type: 'string', describe: '当前页 id' }, { name: 'action', type: 'string', describe: '切页信号' },
    ],
    sample: { type: 'Tabs', id: 's-tabs', props: { tabs: [{ id: 'a', label: '牌谱' }, { id: 'b', label: '榜单' }], active: 'a' }, children: [{ type: 'Label', id: 's-tabs-a', props: { text: '牌谱页' } }, { type: 'Label', id: 's-tabs-b', props: { text: '榜单页' } }] },
  },
  // ── 游戏原语（卡牌演出）──────────────────────────────────────
  {
    type: 'CoinFlip', summary: '掷币（确定性·3D 翻转）', whenToUse: '掷命/二选一演出。outcome 由游戏算好；spinning 播翻转。', children: 'none',
    props: [
      { name: 'outcome', type: 'enum', values: ['heads', 'tails'], required: true, describe: '结果' },
      { name: 'spinning', type: 'boolean', describe: '播翻转动画' }, { name: 'size', type: 'number', default: 92, describe: '直径 px' },
      { name: 'headsLabel', type: 'string', describe: '正面字' }, { name: 'tailsLabel', type: 'string', describe: '反面字' },
      { name: 'headsArt', type: 'string', describe: '正面贴图 URL（面底=图 cover·字白字投影叠显）' },
      { name: 'tailsArt', type: 'string', describe: '反面贴图 URL（同 headsArt）' },
    ],
    sample: { type: 'CoinFlip', id: 's-coin', props: { outcome: 'heads', spinning: true, headsLabel: '正·活', tailsLabel: '反·亡' } },
  },
  {
    type: 'Versus', summary: '对决特写（两牌 + 胜率 + 火花）', whenToUse: '卡牌对战结算特写。left/right 两张牌 + 胜方高亮。', children: 'none',
    props: [
      { name: 'left', type: 'object', required: true, describe: '左牌 PlayingCard props' },
      { name: 'right', type: 'object', required: true, describe: '右牌 PlayingCard props' },
      { name: 'label', type: 'string', describe: '中央文字（胜率 76:24）' },
      { name: 'winner', type: 'enum', values: ['left', 'right', 'none'], describe: '胜方高亮' },
      { name: 'spark', type: 'boolean', default: true, describe: '中央火花' },
    ],
    sample: { type: 'Versus', id: 's-versus', props: { left: { rank: 'A', suit: '♠' }, right: { rank: 'K', suit: '♥' }, label: '76 : 24', winner: 'left' } },
  },
];

/** 按 type 取 spec（校验器/查询用）。 */
const BY_TYPE = new Map<string, UiComponentSpec>(UI_CATALOG.map((s) => [s.type, s]));
export function catalogSpec(type: string): UiComponentSpec | undefined { return BY_TYPE.get(type); }
