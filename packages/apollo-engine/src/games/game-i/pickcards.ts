// Game I · 组合演示「选牌计分」—— 证伪「多选是缺口」+ 实测三项新声明式能力。
//
// 多选≤5 = 状态 + Card tone（纯重组·非缺口）；同时用上新能力：
//   · rotate  扇形手牌    · scale 选中放大    · anim 发牌入场（dealIn 错峰）
//   · draggable/dropZone  把牌拖进「选入区」= 等同点选（拖放·引擎内建手势）
// 视图 buildPickHand(state) 纯函数；reducer applyPick(state,信号) 纯函数·可单测。

import type { LayoutNode } from '@ui/components/index.js';

export interface PCard { id: string; rank: number; suit: '♠' | '♥' | '♦' | '♣' }
export interface PickState { selected: string[] }

export const MAX_PICK = 5;
export const INITIAL_PICK: PickState = { selected: [] };

// 一副固定手牌（8 张·含一组可凑顺子/同花的牌，便于演示牌型）。
export const HAND: PCard[] = [
  { id: 'h0', rank: 10, suit: '♠' },
  { id: 'h1', rank: 11, suit: '♠' },
  { id: 'h2', rank: 12, suit: '♠' },
  { id: 'h3', rank: 13, suit: '♠' },
  { id: 'h4', rank: 14, suit: '♠' },
  { id: 'h5', rank: 14, suit: '♥' },
  { id: 'h6', rank: 14, suit: '♦' },
  { id: 'h7', rank: 13, suit: '♣' },
];

const BASE: Record<string, number> = {
  高牌: 5, 对子: 10, 两对: 20, 三条: 30, 顺子: 40, 同花: 50, 葫芦: 60, 四条: 80, 同花顺: 100,
};

export function rankLabel(r: number): string {
  return r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : r === 14 ? 'A' : String(r);
}

/** 纯函数：评估选中牌的牌型名 + 分（base + 点数和）。0 张 → 占位。 */
export function evalHand(cards: PCard[]): { name: string; score: number } {
  if (cards.length === 0) return { name: '—', score: 0 };
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);
  const isFlush = cards.length === 5 && cards.every((c) => c.suit === cards[0]!.suit);
  const ranks = [...counts.keys()].sort((a, b) => a - b);
  const isStraight = cards.length === 5 && ranks.length === 5 && ranks[4]! - ranks[0]! === 4;

  let name = '高牌';
  if (isStraight && isFlush) name = '同花顺';
  else if (groups[0] === 4) name = '四条';
  else if (groups[0] === 3 && groups[1] === 2) name = '葫芦';
  else if (isFlush) name = '同花';
  else if (isStraight) name = '顺子';
  else if (groups[0] === 3) name = '三条';
  else if (groups[0] === 2 && groups[1] === 2) name = '两对';
  else if (groups[0] === 2) name = '对子';

  const score = (BASE[name] ?? 5) + cards.reduce((s, c) => s + c.rank, 0);
  return { name, score };
}

// ── 视图：状态 → LayoutNode（纯函数）──────────────────────────
function cardNode(c: PCard, i: number, selected: boolean): LayoutNode {
  const center = (HAND.length - 1) / 2;
  // 扇形：未选按位置斜摆；选中拉正 + 放大 + 上抬（y 更小）。
  const rotate = selected ? 0 : Math.round((i - center) * 5);
  const y = selected ? 6 : 26 + Math.round(Math.abs(i - center) * 3);
  return {
    type: 'Card',
    id: c.id,
    props: {
      media: c.suit,
      title: rankLabel(c.rank),
      sub: c.suit === '♥' || c.suit === '♦' ? '红' : '黑',
      tone: selected ? 'accent' : 'normal',
      action: 'pickHand',
      actionArg: c.id,
    },
    layout: {
      x: 18 + i * 52, y,
      width: 64, height: 92,
      rotate,
      ...(selected ? { scale: 1.12 } : {}),
      draggable: true,                 // 可拖入「选入区」
    },
  };
}

/** 选牌页根：状态 → 整页 LayoutNode。多选/牌型/分全从「状态的纯函数」涌现。 */
export function buildPickHand(s: PickState): LayoutNode {
  const picked = HAND.filter((c) => s.selected.includes(c.id));
  const ev = evalHand(picked);
  const full = s.selected.length >= MAX_PICK;
  return {
    type: 'Panel',
    id: 'page-pick',
    props: { scroll: true },
    layout: { direction: 'column', gap: 16, padding: 20 },
    children: [
      {
        type: 'Panel', id: 'pick-hud', props: {},
        layout: { direction: 'row', gap: 12, align: 'center', padding: 12 },
        children: [
          { type: 'Label', id: 'pick-title', props: { text: '🎴 选牌计分（多选 ≤5）', size: 'lg', bold: true }, layout: { flex: 1 } },
          { type: 'Badge', id: 'pick-count', props: { text: `已选 ${s.selected.length}/${MAX_PICK}`, tone: full ? 'warn' : s.selected.length ? 'ok' : 'dim' } },
          { type: 'Label', id: 'pick-type', props: { text: `牌型 ${ev.name}`, color: 'jade', bold: true } },
          { type: 'Label', id: 'pick-score', props: { text: `${ev.score} 分`, color: 'gold', bold: true, size: 'lg' } },
        ],
      },
      { type: 'Label', id: 'pick-hint', props: { text: '点牌 = 选/取消（最多 5 张）；也可把牌拖到下方「选入区」。选中牌会拉正、放大、上抬。', color: 'dim', size: 'sm' } },
      // 扇形手牌（绝对定位 + 旋转）
      {
        type: 'Panel', id: 'pick-hand', props: {},
        layout: { direction: 'row', padding: 8, height: 150 },
        children: HAND.map((c, i) => cardNode(c, i, s.selected.includes(c.id))),
      },
      {
        type: 'Panel', id: 'pick-actions', props: {},
        layout: { direction: 'row', gap: 10, align: 'center', padding: 8 },
        children: [
          { type: 'Button', id: 'pick-play', props: { label: '出牌结算', kind: 'primary', disabled: s.selected.length === 0, action: 'playHand' } },
          { type: 'Button', id: 'pick-clear', props: { label: '清空', kind: 'ghost', disabled: s.selected.length === 0, action: 'clearHand' } },
          {
            type: 'Panel', id: 'pick-drop',
            props: { title: full ? '已满 5 张' : '⬇ 把牌拖到此处选入' },
            layout: { direction: 'column', align: 'center', padding: 16, flex: 1, dropZone: 'dropPick' },
            children: [
              { type: 'Label', id: 'pick-drop-l', props: { text: full ? '取消一张再拖' : '拖放区（dropZone）', color: 'dim', size: 'sm' } },
            ],
          },
        ],
      },
    ],
  };
}

/** 纯 reducer：状态 + 信号(kind,arg) → 新状态(+可选 toast)。多选≤5 全在此涌现。 */
export function applyPick(
  s: PickState, kind: string, arg?: string,
): { state: PickState; toast?: { tone: 'ok' | 'warn'; text: string } } {
  if (kind === 'toggle' || kind === 'drop') {
    const id = arg ?? '';
    if (!HAND.some((c) => c.id === id)) return { state: s };
    if (s.selected.includes(id)) {
      // 拖入已选的牌不取消（drop 只增）；点选则取消。
      return kind === 'drop' ? { state: s } : { state: { selected: s.selected.filter((x) => x !== id) } };
    }
    if (s.selected.length >= MAX_PICK) return { state: s, toast: { tone: 'warn', text: `最多选 ${MAX_PICK} 张` } };
    return { state: { selected: [...s.selected, id] } };
  }
  if (kind === 'play') {
    if (s.selected.length === 0) return { state: s };
    const picked = HAND.filter((c) => s.selected.includes(c.id));
    const ev = evalHand(picked);
    return { state: { selected: [] }, toast: { tone: 'ok', text: `${ev.name} · ${ev.score} 分` } };
  }
  if (kind === 'clear') return { state: { selected: [] } };
  return { state: s };
}
