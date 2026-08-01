// UI 组合页面 sample 集（owner 2026-06-26：整页范例·喂 LLM 学「怎么把控件搭成一整页」）。
//
// 和 catalog.ts 的 per-控件 sample 互补：那里是「单个控件长什么样」，这里是「一整页/一簇怎么组合」——
// 弱模型产页面时缺的正是这层「集成知识」（哪些控件配在一起、布局怎么嵌、信号怎么连）。每个范例都是合法
// LayoutNode 数据（过 validateLayoutNode 零 issue·见 composed-samples.test.ts），既可喂 LLM 当范例、也供展示台逐页渲染。
//
// 红线：全是纯数据（闭词表字段 + 信号名）。无自由代码/CSS。

import type { LayoutNode } from './types.js';

export interface ComposedSample {
  name: string;
  summary: string;
  tree: LayoutNode;
}

export const COMPOSED_SAMPLES: readonly ComposedSample[] = [
  {
    name: 'main-menu',
    summary: '主菜单/大厅：居中大标题 + 主 CTA(hero·sheen) + 次级入口行 + 版本号',
    tree: {
      type: 'Screen', id: 'mm', props: { center: true },
      children: [{
        type: 'Panel', id: 'mm-box', props: { bare: true }, layout: { direction: 'column', align: 'center', gap: 18, maxWidth: 520 },
        children: [
          { type: 'Label', id: 'mm-title', props: { text: '翻命扑克', size: 'xxxl', color: 'gold', bold: true } },
          { type: 'Label', id: 'mm-sub', props: { text: '执掌命运之人 · 空中掷命对决', size: 'sm', color: 'sub' } },
          { type: 'Button', id: 'mm-play', props: { label: '⚔ 开始游戏', kind: 'hero', sub: '第 3 关 · 挑战 曹操', action: 'play' }, layout: { sheen: true } },
          { type: 'Panel', id: 'mm-row', props: { bare: true }, layout: { direction: 'row', gap: 10, justify: 'center' }, children: [
            { type: 'Button', id: 'mm-deck', props: { label: '🎴 我的牌组', kind: 'ghost', action: 'deck' } },
            { type: 'Button', id: 'mm-rank', props: { label: '🏆 天梯', kind: 'ghost', action: 'rank' } },
            { type: 'Button', id: 'mm-set', props: { label: '⚙ 设置', kind: 'quiet', action: 'settings' } },
          ] },
          { type: 'Label', id: 'mm-ver', props: { text: 'ZeroCraft Engine · v0.1', size: 'xs', color: 'dim' } },
        ],
      }],
    },
  },
  {
    name: 'settings',
    summary: '设置屏：分组面板 + 开关/滑块/分段换皮 + 取消·保存',
    tree: {
      type: 'Screen', id: 'set', props: { center: true },
      children: [{
        type: 'Panel', id: 'set-box', props: { title: '设置' }, layout: { direction: 'column', gap: 12, padding: 20, maxWidth: 460 },
        children: [
          { type: 'Toggle', id: 'set-bgm', props: { label: '背景音乐', checked: true, action: 'bgm' } },
          { type: 'Toggle', id: 'set-sfx', props: { label: '音效', checked: true, action: 'sfx' } },
          { type: 'Slider', id: 'set-vol', props: { label: '总音量', min: 0, max: 100, value: 70, action: 'vol' } },
          { type: 'Segmented', id: 'set-skin', props: { options: [{ value: 'onyx', label: '玄铁' }, { value: 'brocade', label: '锦霞' }], value: 'onyx', action: 'skin' } },
          { type: 'Divider', id: 'set-div', props: {} },
          { type: 'Panel', id: 'set-acts', props: { bare: true }, layout: { direction: 'row', gap: 10, justify: 'end' }, children: [
            { type: 'Button', id: 'set-cancel', props: { label: '取消', kind: 'ghost', action: 'close' } },
            { type: 'Button', id: 'set-save', props: { label: '保存', kind: 'primary', action: 'save' } },
          ] },
        ],
      }],
    },
  },
  {
    name: 'collection-grid',
    summary: '收藏卡墙：大标题 + 筛选 chip 行 + 固定6列流式卡墙(PlayingCard fluid + grid cols)',
    tree: {
      type: 'Screen', id: 'col', props: {},
      children: [{
        type: 'Panel', id: 'col-box', props: { bare: true }, layout: { direction: 'column', gap: 12, padding: 16, maxWidth: 1100 },
        children: [
          { type: 'Label', id: 'col-h', props: { text: '我的牌谱', size: 'xxl', color: 'gold', bold: true } },
          { type: 'Panel', id: 'col-filter', props: { bare: true }, layout: { direction: 'row', gap: 8 }, children: [
            { type: 'Tag', id: 'col-all', props: { label: '全部', active: true, action: 'filter', actionArg: 'all' } },
            { type: 'Tag', id: 'col-s', props: { label: '♠ 黑桃', action: 'filter', actionArg: 'spade' } },
            { type: 'Tag', id: 'col-hh', props: { label: '♥ 红桃', action: 'filter', actionArg: 'heart' } },
          ] },
          { type: 'Panel', id: 'col-grid', props: { bare: true }, layout: { direction: 'grid', cols: 6, gap: 14 }, children: [
            { type: 'PlayingCard', id: 'col-c1', props: { rank: 'A', suit: '♠', fluid: true, label: '关羽', selected: true } },
            { type: 'PlayingCard', id: 'col-c2', props: { rank: 'K', suit: '♥', fluid: true, label: '张飞' } },
            { type: 'PlayingCard', id: 'col-c3', props: { rank: 'Q', suit: '♦', fluid: true, label: '貂蝉', dimmed: true } },
            { type: 'PlayingCard', id: 'col-c4', props: { rank: 'J', suit: '♣', fluid: true, label: '赵云' } },
          ] },
        ],
      }],
    },
  },
  {
    name: 'confirm-dialog',
    summary: '确认弹窗：居中 Modal + 说明文案 + 取消/确认两按钮',
    tree: {
      type: 'Modal', id: 'cf', props: { title: '返回大厅？', size: 'sm', closeAction: 'cancel' },
      children: [
        { type: 'Label', id: 'cf-b', props: { text: '当前对局进度将丢失，确定返回？', color: 'sub' } },
        { type: 'Panel', id: 'cf-acts', props: { bare: true }, layout: { direction: 'row', gap: 10, justify: 'end' }, children: [
          { type: 'Button', id: 'cf-no', props: { label: '取消', kind: 'ghost', action: 'cancel' } },
          { type: 'Button', id: 'cf-yes', props: { label: '确定返回', kind: 'primary', action: 'confirm' } },
        ] },
      ],
    },
  },
  {
    name: 'leaderboard',
    summary: '天梯榜：我的段位卡(头像+段位+晋级条) + 全服榜单 Table',
    tree: {
      type: 'Screen', id: 'lb', props: {},
      children: [{
        type: 'Panel', id: 'lb-box', props: { bare: true }, layout: { direction: 'column', gap: 14, padding: 16, maxWidth: 720 },
        children: [
          { type: 'Panel', id: 'lb-me', props: { accent: true }, layout: { direction: 'row', gap: 14, align: 'center', padding: 14 }, children: [
            { type: 'Avatar', id: 'lb-av', props: { name: '玩家', size: 48, shape: 'rounded' } },
            { type: 'Panel', id: 'lb-mein', props: { bare: true }, layout: { direction: 'column', gap: 4, flex: 1 }, children: [
              { type: 'Label', id: 'lb-rk', props: { text: '黄金 III', size: 'lg', color: 'gold', bold: true } },
              { type: 'ProgressBar', id: 'lb-pg', props: { value: 64, max: 100, tone: 'gold', label: '晋级进度', showValue: true } },
            ] },
          ] },
          { type: 'Table', id: 'lb-tbl', props: { title: '全服榜', columns: [{ key: 'rank', label: '名次', width: 56 }, { key: 'name', label: '玩家' }, { key: 'score', label: '积分', align: 'right' }], rows: [
            { id: 'r1', cells: { rank: '1', name: '不翻就赢', score: '2380' }, tone: 'accent' },
            { id: 'r2', cells: { rank: '2', name: '常胜将军', score: '2210' } },
            { id: 'r3', cells: { rank: '3', name: '逢赌必输', score: '2090' } },
          ] } },
        ],
      }],
    },
  },
  {
    name: 'shop',
    summary: '商店：多页签(抽卡/钱包) + 货架自适应网格 + 价格购买 + 富文本余额',
    tree: {
      type: 'Screen', id: 'shop', props: {},
      children: [{
        type: 'Panel', id: 'shop-box', props: { title: '商城' }, layout: { direction: 'column', gap: 12, padding: 18, maxWidth: 640 },
        children: [{
          type: 'Tabs', id: 'shop-tabs', props: { tabs: [{ id: 'gacha', label: '抽卡' }, { id: 'wallet', label: '钱包' }], active: 'gacha' },
          children: [
            { type: 'Panel', id: 'shop-gacha', props: { bare: true }, layout: { direction: 'grid', minCol: 150, gap: 12 }, children: [
              { type: 'Card', id: 'shop-c1', props: { media: '🎴', title: '十连抽', sub: '🪙 1500', corner: '热门', tone: 'accent', action: 'buy', actionArg: 'ten' } },
              { type: 'Card', id: 'shop-c2', props: { media: '🀄', title: '单抽', sub: '🪙 160', action: 'buy', actionArg: 'one' } },
            ] },
            { type: 'Panel', id: 'shop-wallet', props: { bare: true }, layout: { direction: 'column', gap: 8 }, children: [
              { type: 'Label', id: 'shop-bal', props: { spans: [{ text: '余额 ', color: 'sub' }, { text: '🪙 4860', color: 'gold', bold: true }] } },
              { type: 'Button', id: 'shop-recharge', props: { label: '充值', kind: 'primary', action: 'recharge' } },
            ] },
          ],
        }],
      }],
    },
  },
  {
    name: 'hud-bar',
    summary: '局内 HUD 顶栏：资源 + 血条 + 回合 + 结束按钮(带引导锚点)',
    tree: {
      type: 'Panel', id: 'hud', props: { bare: true }, layout: { direction: 'row', gap: 16, align: 'center', padding: 10 },
      children: [
        { type: 'Label', id: 'hud-gold', props: { spans: [{ text: '🪙 ', color: 'gold' }, { text: '120', color: 'gold', bold: true }] } },
        { type: 'Panel', id: 'hud-hp', props: { bare: true }, layout: { direction: 'column', gap: 2, flex: 1 }, children: [
          { type: 'Label', id: 'hud-hpl', props: { text: '生命', size: 'xs', color: 'sub' } },
          { type: 'ProgressBar', id: 'hud-hpb', props: { value: 30, max: 100, tone: 'danger', showValue: true } },
        ] },
        { type: 'Label', id: 'hud-turn', props: { spans: [{ text: '回合 ', color: 'sub' }, { text: '3', color: 'jade', bold: true }] } },
        { type: 'Button', id: 'hud-end', props: { label: '结束回合', kind: 'primary', action: 'endTurn' }, layout: { anchor: 'combat-end' } },
      ],
    },
  },
  {
    name: 'hero-detail',
    summary: '英雄详情：立绘 + 名/势力 + 属性条组 + 词条 Tag·tooltip',
    tree: {
      type: 'Panel', id: 'hd', props: { accent: true }, layout: { direction: 'column', gap: 12, padding: 18, maxWidth: 360 },
      children: [
        { type: 'Avatar', id: 'hd-av', props: { name: '关羽', size: 84, shape: 'rounded' } },
        { type: 'Label', id: 'hd-name', props: { text: '关羽 · 武圣', size: 'xl', color: 'gold', bold: true } },
        { type: 'Label', id: 'hd-fac', props: { text: '蜀 · 五虎上将', size: 'sm', color: 'sub' } },
        { type: 'ProgressBar', id: 'hd-atk', props: { value: 88, max: 100, tone: 'danger', label: '攻击', showValue: true } },
        { type: 'ProgressBar', id: 'hd-def', props: { value: 72, max: 100, tone: 'accent', label: '防御', showValue: true } },
        { type: 'Panel', id: 'hd-tags', props: { bare: true }, layout: { direction: 'row', gap: 6 }, children: [
          { type: 'Tooltip', id: 'hd-t1', props: { bubble: { type: 'Label', id: 'hd-t1b', props: { spans: [{ text: '威震华夏 ', color: 'gold', bold: true }, { text: '· 出战首回合攻击 +20%', color: 'sub' }] } } }, children: [
            { type: 'Tag', id: 'hd-tag1', props: { label: '威震华夏', tone: 'accent' } },
          ] },
          { type: 'Tag', id: 'hd-tag2', props: { label: '骑兵', tone: 'normal' } },
        ] },
        { type: 'Button', id: 'hd-use', props: { label: '编入牌组', kind: 'primary', action: 'useHero', actionArg: 'guanyu' } },
      ],
    },
  },
];
