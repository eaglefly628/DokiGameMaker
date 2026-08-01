// Game I · 组合压力测试：MMO（魔兽世界风）HUD —— 纯 LayoutNode 数据复现一套最复杂的实时 HUD。
//
// 论点（数据驱动宣言）：不写一行手搭 React/自由 CSS，只用 ZeroCraft Kit 现有控件「重组」，
// 就能拼出 WoW 那种「单位框 + 动作条 + 小地图 + 施法条 + 任务追踪 + 聊天 + 经验条 + Buff 栏」级别的复杂 HUD。
// 全是绝对定位 Panel(x/y) 叠层 + ProgressBar/Avatar/Badge/Tag/Table/Tabs/Label + layout.fx 质感。
// 任何一处「现有控件真表达不了」的，才记 requests.md 当缺口——本页全程零新控件、零逃生 React。

import type { LayoutNode } from '@ui/components/index.js';

// ── 小地图圆盘底（程序化 SVG·避免外部资产·data-URI 同 TEXTURE_URI 思路）────────────────
const MAP_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="172" height="172">' +
  '<defs><radialGradient id="g" cx="50%" cy="38%" r="75%">' +
  '<stop offset="0%" stop-color="#27402f"/><stop offset="60%" stop-color="#16291d"/><stop offset="100%" stop-color="#0c1712"/>' +
  '</radialGradient></defs>' +
  '<rect width="172" height="172" fill="url(#g)"/>' +
  '<path d="M20 120 Q60 90 96 110 T160 96" stroke="#3a5b44" stroke-width="7" fill="none" opacity="0.7"/>' +
  '<path d="M40 30 Q70 70 60 120" stroke="#2f4a59" stroke-width="5" fill="none" opacity="0.6"/>' +
  '<circle cx="96" cy="86" r="4" fill="#d4bd8a"/>' +
  '<circle cx="60" cy="118" r="3" fill="#e88f9c"/><circle cx="132" cy="64" r="3" fill="#e88f9c"/>' +
  '<circle cx="118" cy="120" r="3" fill="#7fc7e8"/>' +
  '</svg>';
const MAP_URI = `data:image/svg+xml,${encodeURIComponent(MAP_SVG)}`;

const lbl = (id: string, text: string, p: Record<string, unknown> = {}): LayoutNode =>
  ({ type: 'Label', id, props: { text, ...p } });

// ── 单位框：头像 + 名/等级 + 血条 + 资源条（玩家/目标/队友通用·只换数据）─────────────────
function unitFrame(
  id: string, x: number | null, y: number | null, w: number,
  glyph: string, name: string, level: string,
  hp: number, hpMax: number, hpTone: 'ok' | 'danger',
  res: number, resTone: 'accent' | 'warn', resLabel: string,
  avatarSize = 52, compact = false, crit = false,
): LayoutNode {
  // x/y 给则绝对叠层（玩家/目标 HUD 锚位）；null 则走父容器列流式（队伍框竖排）。
  const pos = (x !== null && y !== null) ? { x, y } : {};
  // crit（残血）：整框红色呼吸 fx:pulse —— 危急警示动态（库 A·UI 特效）。
  const critFx = crit ? { fx: [{ kind: 'pulse' as const }] } : {};
  // compact（队伍框）：去掉血量数字行 + 资源条 label，压扁高度，三框竖排不挤聊天。
  return {
    type: 'Panel', id, props: { accent: id === 'pf-player' }, layout: { ...pos, ...critFx, width: w, direction: 'row', gap: 8, padding: compact ? 6 : 8, align: 'center' },
    children: [
      { type: 'Avatar', id: `${id}-av`, props: { name: glyph, size: avatarSize, shape: 'rounded' } },
      { type: 'Panel', id: `${id}-col`, props: { bare: true }, layout: { direction: 'column', gap: 3, flex: 1 },
        children: [
          { type: 'Panel', id: `${id}-nr`, props: { bare: true }, layout: { direction: 'row', align: 'center', gap: 6 },
            children: [
              lbl(`${id}-nm`, name, { size: 'sm', bold: true, color: 'text' }),
              { type: 'Badge', id: `${id}-lv`, props: { text: level, tone: 'warn' } },
            ] },
          { type: 'ProgressBar', id: `${id}-hp`, props: { value: hp, max: hpMax, tone: hpTone, showValue: !compact } },
          { type: 'ProgressBar', id: `${id}-res`, props: { value: res, max: 100, tone: resTone, ...(compact ? {} : { label: resLabel }) } },
        ] },
    ],
  };
}

// ── 动作条技能格：图标字 + 键位 Badge（就绪态金光 fx·冷却态 dim+读秒）──────────────────
function slot(id: string, glyph: string, key: string, opts: { cd?: string; ready?: boolean } = {}): LayoutNode {
  const fx = opts.ready ? [{ kind: 'glow' as const, color: 'gold' as const }] : undefined;
  return {
    type: 'Panel', id, props: { accent: !!opts.ready, bg: opts.cd ? 'sunken' : 'steel' }, // 色库化：冷却=sunken 令牌(换皮自适应)·就绪=steel 预设配色
    layout: { width: 46, height: 46, direction: 'column', align: 'center', justify: 'center', padding: 0, chamfer: 6, ...(fx ? { fx } : {}) },
    children: [
      lbl(`${id}-g`, opts.cd ? '' : glyph, { size: 'lg' }),
      ...(opts.cd ? [lbl(`${id}-cd`, opts.cd, { size: 'lg', bold: true, color: 'warn' })] : []),
      { type: 'Badge', id: `${id}-k`, props: { text: key, tone: 'dim' } },
    ],
  };
}

// ── Buff/Debuff 小图标（计时角标）──────────────────────────────────────────────
function aura(id: string, glyph: string, time: string, tone: 'ok' | 'warn' | 'dim', urgent = false): LayoutNode {
  // urgent（即将到期）：药丸闪色 fx:flash warn —— 催促动态（库 A·UI 特效）。
  const fx = urgent ? { fx: [{ kind: 'flash' as const, color: 'warn' as const }] } : {};
  return {
    type: 'Panel', id, props: { bg: 'ink-deep' }, layout: { width: 36, height: 36, direction: 'column', align: 'center', justify: 'center', padding: 0, chamfer: 4, ...fx }, // 色库化：ink-deep 预设配色
    children: [
      lbl(`${id}-g`, glyph, { size: 'md' }),
      { type: 'Badge', id: `${id}-t`, props: { text: time, tone } },
    ],
  };
}

/** 复现一套 WoW 风 MMO HUD（纯 LayoutNode·绝对定位叠层·零手写 React/CSS）。 */
export function buildMmoHud(): LayoutNode {
  return {
    type: 'Panel', id: 'mmo-hud', props: { bg: { custom: 'linear-gradient(160deg,#0b1410,#0a0f17 60%,#0d0b14)' }, vignette: true }, // 色库化：招牌 HUD 底=创作者特别指定色 → {custom} 显式逃生
    layout: { width: 1024, height: 624, padding: 0 },
    children: [
      // 顶部标题胶囊
      { type: 'Panel', id: 'mmo-zone', props: { bare: true }, layout: { x: 408, y: 10, direction: 'row', gap: 8, align: 'center' },
        children: [
          lbl('mmo-zt', '⛰ 灰谷 · 夜歌森林', { size: 'md', bold: true, color: 'gold', font: 'display' }),
        ] },

      // ── 玩家单位框（左上·高亮框）+ 连击点 ──
      unitFrame('pf-player', 19, 36, 256, '法', '阿洛狄斯', '70', 8240, 9100, 'ok', 76, 'accent', '法力'),
      { type: 'Panel', id: 'pf-combo', props: { bare: true }, layout: { x: 23, y: 130, direction: 'row', gap: 4 },
        children: [1, 2, 3, 4, 5].map((n): LayoutNode => ({
          type: 'Panel', id: `cp-${n}`, props: { bg: n <= 3 ? 'gold-sheen' : 'steel' }, // 色库化：亮连击点=gold-sheen 预设·暗点=steel 预设
          layout: { width: 14, height: 14, padding: 0, chamfer: 3, ...(n <= 3 ? { fx: [{ kind: 'glow', color: 'gold' }] } : {}) }, children: [],
        })) },

      // ── 目标单位框（顶部中左·红血）+ 目标 Buff/Debuff 行 + 施法条 ──
      unitFrame('pf-target', 301, 36, 256, '兽', '腐臭的剥皮者', '72', 14200, 22000, 'danger', 60, 'warn', '怒气'),
      { type: 'Panel', id: 'tgt-auras', props: { bare: true }, layout: { x: 301, y: 132, direction: 'row', gap: 5 },
        children: [
          aura('au-1', '🔥', '6', 'warn'),
          aura('au-2', '☠️', '12', 'dim'),
          aura('au-3', '🩸', '4', 'warn', true),
          aura('au-4', '🛡', '8', 'ok'),
        ] },
      // 定位壳(x/y·无 fx) 裹 特效内卡(fx·流式)：避开「fx:sheen 强制 position:relative 覆盖 x/y 绝对定位」的引擎坑（已报主程）。
      { type: 'Panel', id: 'tgt-cast', props: { bare: true }, layout: { x: 301, y: 174, width: 256 },
        children: [
          { type: 'Panel', id: 'tgt-cast-card', props: {}, layout: { direction: 'column', gap: 4, padding: 8, fx: [{ kind: 'sheen' }] },
            children: [
              { type: 'Panel', id: 'tc-row', props: { bare: true }, layout: { direction: 'row', align: 'center', gap: 6 },
                children: [lbl('tc-ic', '🌑', { size: 'md' }), lbl('tc-nm', '腐蚀术', { size: 'sm', color: 'sub' }), lbl('tc-t', '1.4s', { size: 'xs', color: 'dim' })] },
              { type: 'ProgressBar', id: 'tc-bar', props: { value: 62, max: 100, tone: 'danger' } },
            ] },
        ] },

      // ── 小地图（右上·圆盘）+ 时钟/坐标 ──
      { type: 'Panel', id: 'mm-wrap', props: { accent: true }, layout: { x: 806, y: 15, width: 176, direction: 'column', gap: 6, padding: 8, align: 'center' },
        children: [
          { type: 'Image', id: 'mm-img', props: { src: MAP_URI, fit: 'cover', radius: 80 }, layout: { width: 158, height: 158 } },
          { type: 'Panel', id: 'mm-row', props: { bare: true }, layout: { direction: 'row', align: 'center', gap: 8 },
            children: [
              lbl('mm-time', '🕓 21:48', { size: 'xs', color: 'sub' }),
              lbl('mm-loc', '◎ 42,67', { size: 'xs', color: 'dim', mono: true }),
            ] },
        ] },

      // ── 玩家 Buff 条（小地图下·一排增益）──
      { type: 'Panel', id: 'player-buffs', props: { bare: true }, layout: { x: 806, y: 214, direction: 'row', gap: 5 },
        children: [
          aura('pb-1', '✨', '30m', 'ok'),
          aura('pb-2', '🛡', '12m', 'ok'),
          aura('pb-3', '⚡', '8', 'warn'),
          aura('pb-4', '🍖', '24', 'dim'),
        ] },

      // ── 任务追踪（右侧）──
      { type: 'Panel', id: 'quest', props: { title: '📜 任务追踪' }, layout: { x: 744, y: 258, width: 248, direction: 'column', gap: 10, padding: 12 },
        children: [
          lbl('q1-t', '夜歌森林的腐化', { size: 'sm', bold: true, color: 'gold' }),
          { type: 'Panel', id: 'q1b', props: { bare: true }, layout: { direction: 'column', gap: 4 },
            children: [
              lbl('q1-o1', '· 净化腐化的池塘  3/5', { size: 'xs', color: 'sub' }),
              lbl('q1-o2', '· 击败剥皮者  0/1', { size: 'xs', color: 'sub' }),
            ] },
          { type: 'Divider', id: 'q-div', props: {} },
          lbl('q2-t', '驯鹿的低语', { size: 'sm', bold: true, color: 'gold' }),
          lbl('q2-o1', '· 收集星辉草  7/8', { size: 'xs', color: 'sub' }),
          { type: 'ProgressBar', id: 'q2-bar', props: { value: 7, max: 8, tone: 'ok', showValue: true } },
        ] },

      // ── 队伍框（左侧·三名队友）──
      { type: 'Panel', id: 'party', props: { bare: true }, layout: { x: 19, y: 150, direction: 'column', gap: 6 },
        children: [
          unitFrame('pt-1', null, null, 220, '战', '索瑞森', '70', 6100, 7200, 'ok', 40, 'accent', '法力', 38, true),
          unitFrame('pt-2', null, null, 220, '猎', '艾拉娜', '69', 3200, 6800, 'ok', 88, 'warn', '能量', 38, true),
          unitFrame('pt-3', null, null, 220, '牧', '光语者', '70', 800, 7000, 'danger', 64, 'accent', '法力', 38, true, true),
        ] },

      // ── 聊天窗（左下·页签 + 滚动消息表）──
      { type: 'Panel', id: 'chat', props: {}, layout: { x: 19, y: 338, width: 360, height: 150, direction: 'column', padding: 6 },
        children: [
          { type: 'Tabs', id: 'chat-tabs', props: { tabs: [{ id: 'all', label: '综合' }, { id: 'cbt', label: '战斗' }, { id: 'trade', label: '交易' }], active: 'all' },
            layout: { flex: 1 },
            children: [
              { type: 'Panel', id: 'chat-all', props: { scroll: true, bare: true }, layout: { direction: 'column', gap: 3, padding: 4 },
                children: [
                  lbl('m1', '[公会] 索瑞森：副本门口集合～', { size: 'xs', color: 'ok' }),
                  lbl('m2', '[喊话] 求一法师开门 灰谷', { size: 'xs', color: 'warn' }),
                  lbl('m3', '[队伍] 艾拉娜：拉怪了注意走位', { size: 'xs', color: 'accent' }),
                  lbl('m4', '你命中 腐臭的剥皮者 1240点 暗影伤害。', { size: 'xs', color: 'sub' }),
                  lbl('m5', '光语者 对你施放了 治疗术。', { size: 'xs', color: 'ok' }),
                  lbl('m6', '[世界] 有人见过夜歌的稀有吗', { size: 'xs', color: 'dim' }),
                ] },
              { type: 'Panel', id: 'chat-cbt', props: { bare: true }, layout: { padding: 6 }, children: [lbl('cbt-x', '（战斗记录…）', { size: 'xs', color: 'dim' })] },
              { type: 'Panel', id: 'chat-trade', props: { bare: true }, layout: { padding: 6 }, children: [lbl('trd-x', '（交易频道…）', { size: 'xs', color: 'dim' })] },
            ] },
          { type: 'Panel', id: 'chat-in', props: { bare: true }, layout: { direction: 'row', gap: 6, align: 'center', padding: 2 },
            children: [
              lbl('chat-pre', '说：', { size: 'xs', color: 'dim' }),
              { type: 'Input', id: 'chat-input', props: { placeholder: '按回车发送…' }, layout: { flex: 1 } },
            ] },
        ] },

      // ── 施法条（中央偏下·玩家正在施法）──
      { type: 'Panel', id: 'cast', props: { bare: true }, layout: { x: 395, y: 460, width: 216 },
        children: [
          { type: 'Panel', id: 'cast-card', props: { accent: true }, layout: { direction: 'column', gap: 4, padding: 8, fx: [{ kind: 'sheen' }, { kind: 'glow', color: 'gold' }] },
            children: [
              { type: 'Panel', id: 'cast-row', props: { bare: true }, layout: { direction: 'row', align: 'center', gap: 6 },
                children: [lbl('cast-ic', '🔥', { size: 'md' }), lbl('cast-nm', '炎爆术', { size: 'sm', bold: true }), { type: 'Label', id: 'cast-t', props: { text: '2.1s', size: 'xs', color: 'dim' }, layout: { flex: 1 } }] },
              { type: 'ProgressBar', id: 'cast-bar', props: { value: 73, max: 100, tone: 'gold' } },
            ] },
        ] },

      // ── 主动作条（底部居中·12 格·就绪/冷却混排）──
      { type: 'Panel', id: 'actionbar', props: {}, layout: { x: 71, y: 514, direction: 'row', gap: 5, padding: 7, align: 'center' },
        children: [
          slot('ab-1', '🔥', '1', { ready: true }),
          slot('ab-2', '❄️', '2'),
          slot('ab-3', '⚡', '3', { ready: true }),
          slot('ab-4', '🌑', '4', { cd: '3' }),
          slot('ab-5', '🛡', '5'),
          slot('ab-6', '🗡', '6'),
          slot('ab-7', '✨', '7', { cd: '12' }),
          slot('ab-8', '💀', '8'),
          slot('ab-9', '🏹', '9'),
          slot('ab-10', '🍖', '0'),
          slot('ab-11', '🐉', '-'),
          slot('ab-12', '⭐', '='),
        ] },

      // ── 微缩菜单 + 背包（右下·一排小按钮）──
      { type: 'Panel', id: 'micro', props: { bare: true }, layout: { x: 725, y: 530, direction: 'row', gap: 4 },
        children: ['👤', '🎒', '🗺', '⚙️', '👥'].map((g, i): LayoutNode => ({
          type: 'Button', id: `mc-${i}`, props: { label: g, kind: 'quiet', action: 'mmoMicro', actionArg: g }, layout: { width: 34 },
        })) },

      // ── 经验条（最底·满宽·紫）──
      { type: 'Panel', id: 'xp-wrap', props: { bare: true }, layout: { x: 19, y: 590, width: 986, direction: 'column', gap: 2 },
        children: [
          { type: 'ProgressBar', id: 'xp-bar', props: { value: 68, max: 100, tone: 'accent', label: '经验 70 级', showValue: true } },
        ] },
    ],
  };
}
