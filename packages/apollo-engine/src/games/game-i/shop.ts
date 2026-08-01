// Game I · 组合演示「商店」—— 多控件联动的数据驱动小应用（MVU 模式）。
//
// 红线：本文件只产「数据」与「纯函数」——
//   · buildShop(state)  : 状态 → LayoutNode 视图（纯函数·零渲染/DOM）
//   · applyShop(s,k,arg): 状态 + 信号 → 新状态(+可选 toast 意图)（纯 reducer·零副作用）
// 宿主（game-i.ts）只负责：持有 state、把信号喂给 applyShop、按返回值弹 Toast、重挂。
// 联动（过滤/选中/合计/买得起与否）全从「状态的纯函数」涌现，不写命令式 UI 代码。

import type { LayoutNode } from '@ui/components/index.js';

export type ShopCat = 'all' | 'weapon' | 'armor' | 'potion';

export interface ShopItem {
  id: string; name: string; cat: Exclude<ShopCat, 'all'>;
  price: number; icon: string; rarity: string; desc: string;
}

export interface ShopState {
  category: ShopCat;
  search: string;
  selectedId: string | null;
  qty: number;
  gold: number;
  owned: Record<string, number>;
}

export const ITEMS: ShopItem[] = [
  { id: 'w1', name: '青釭剑', cat: 'weapon', price: 300, icon: '⚔️', rarity: 'SSR', desc: '削铁如泥的名剑，攻击大幅提升。' },
  { id: 'w2', name: '方天画戟', cat: 'weapon', price: 220, icon: '🗡️', rarity: 'SR', desc: '一吕二赵的象征，攻防兼备。' },
  { id: 'w3', name: '连弩', cat: 'weapon', price: 120, icon: '🏹', rarity: 'R', desc: '诸葛连弩，提升暴击率。' },
  { id: 'a1', name: '玄铁甲', cat: 'armor', price: 260, icon: '🛡️', rarity: 'SSR', desc: '玄铁锻造，防御卓绝。' },
  { id: 'a2', name: '藤甲', cat: 'armor', price: 90, icon: '🥋', rarity: 'R', desc: '轻便耐刺，惧火。' },
  { id: 'p1', name: '金疮药', cat: 'potion', price: 40, icon: '🧪', rarity: 'R', desc: '即刻回复少量生命。' },
  { id: 'p2', name: '续命丹', cat: 'potion', price: 180, icon: '💊', rarity: 'SR', desc: '濒死时自动复活一次。' },
  { id: 'p3', name: '醒酒石', cat: 'potion', price: 25, icon: '🪨', rarity: 'N', desc: '解除眩晕，清醒如初。' },
];

export const INITIAL_SHOP: ShopState = {
  category: 'all', search: '', selectedId: null, qty: 1, gold: 500, owned: {},
};

const CATS: { value: ShopCat; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'weapon', label: '武器' },
  { value: 'armor', label: '防具' },
  { value: 'potion', label: '丹药' },
];

/** 联动过滤：按分类 + 搜索词（商品名包含）筛 ITEMS。纯函数。 */
export function filterItems(s: ShopState): ShopItem[] {
  const q = s.search.trim();
  return ITEMS.filter((it) =>
    (s.category === 'all' || it.cat === s.category) &&
    (q === '' || it.name.includes(q)),
  );
}

// ── 视图：状态 → LayoutNode（纯函数）────────────────────────────
function itemCard(it: ShopItem, s: ShopState): LayoutNode {
  const selected = it.id === s.selectedId;
  const afford = s.gold >= it.price;
  const tone: 'normal' | 'accent' | 'locked' = selected ? 'accent' : afford ? 'normal' : 'locked';
  return {
    type: 'Card',
    id: `shop-card-${it.id}`,
    props: {
      media: it.icon, title: it.name, sub: `${it.price} 金`, corner: it.rarity,
      tone, action: 'shopSelect', actionArg: it.id,
    },
  };
}

function detailPanel(s: ShopState): LayoutNode {
  const sel = ITEMS.find((i) => i.id === s.selectedId);
  if (!sel) {
    return { type: 'Label', id: 'shop-detail-empty', props: { text: '点上方商品查看详情并购买。', color: 'dim' } };
  }
  const total = sel.price * s.qty;
  const afford = s.gold >= total;
  const ownedN = s.owned[sel.id] ?? 0;
  return {
    type: 'Panel',
    id: 'shop-detail',
    props: { title: `商品详情 · ${sel.name}` },
    layout: { direction: 'column', gap: 10, padding: 12 },
    children: [
      {
        type: 'Panel', id: 'shop-detail-head', props: {},
        layout: { direction: 'row', gap: 12, align: 'center', padding: 0 },
        children: [
          { type: 'Avatar', id: 'shop-detail-av', props: { name: sel.icon, size: 44, shape: 'rounded' } },
          { type: 'Label', id: 'shop-detail-name', props: { text: sel.name, size: 'lg', bold: true }, layout: { flex: 1 } },
          { type: 'Tag', id: 'shop-detail-rar', props: { label: sel.rarity, tone: 'accent' } },
        ],
      },
      { type: 'Label', id: 'shop-detail-desc', props: { text: sel.desc, color: 'sub' } },
      { type: 'Divider', id: 'shop-detail-div', props: {} },
      {
        type: 'Panel', id: 'shop-detail-buy', props: {},
        layout: { direction: 'row', gap: 14, align: 'center', padding: 0 },
        children: [
          { type: 'Label', id: 'shop-unit', props: { text: `单价 ${sel.price}`, color: 'sub' } },
          { type: 'Stepper', id: 'shop-qty', props: { value: s.qty, min: 1, max: 99, step: 1, action: 'shopQty' } },
          { type: 'Label', id: 'shop-total', props: { text: `合计 ${total} 金`, color: afford ? 'gold' : 'danger', bold: true }, layout: { flex: 1 } },
          { type: 'Button', id: 'shop-buy', props: { label: '购买', kind: 'primary', disabled: !afford, action: 'shopBuy', actionArg: sel.id } },
        ],
      },
      ...(afford ? [] : [{ type: 'Label', id: 'shop-poor', props: { text: '⚠ 金币不足，无法购买这么多。', color: 'danger', size: 'sm' } } as LayoutNode]),
      ...(ownedN > 0 ? [{ type: 'Badge', id: 'shop-owned-n', props: { text: `已拥有 ${ownedN}`, tone: 'ok' } } as LayoutNode] : []),
    ],
  };
}

/** 商店页根：状态 → 整页 LayoutNode。所有联动都从这棵「状态的纯函数」涌现。 */
export function buildShop(s: ShopState): LayoutNode {
  const items = filterItems(s);
  const ownedCount = Object.values(s.owned).reduce((a, b) => a + b, 0);
  const grid: LayoutNode = items.length
    ? {
        type: 'Panel', id: 'shop-grid', props: {},
        layout: { direction: 'grid', minCol: 130, gap: 10, padding: 4 },
        children: items.map((it) => itemCard(it, s)),
      }
    : { type: 'Label', id: 'shop-empty', props: { text: '没有匹配的商品，换个分类或清空搜索。', color: 'dim' } };

  return {
    type: 'Panel',
    id: 'page-shop',
    props: { scroll: true },
    layout: { direction: 'column', gap: 16, padding: 20 },
    children: [
      {
        type: 'Panel', id: 'shop-hud', props: {},
        layout: { direction: 'row', gap: 12, align: 'center', padding: 12 },
        children: [
          { type: 'Label', id: 'shop-title', props: { text: '🏪 阿斗杂货铺', size: 'lg', bold: true }, layout: { flex: 1 } },
          { type: 'Label', id: 'shop-gold', props: { text: `金币 ${s.gold}`, color: 'gold', bold: true } },
          { type: 'Badge', id: 'shop-owned', props: { text: `已购 ${ownedCount} 件`, tone: ownedCount ? 'ok' : 'dim' } },
        ],
      },
      {
        type: 'Panel', id: 'shop-filters', props: {},
        layout: { direction: 'row', gap: 12, align: 'center', padding: 12 },
        children: [
          { type: 'Segmented', id: 'shop-cat', props: { options: CATS, value: s.category, action: 'shopCat' } },
          { type: 'Input', id: 'shop-search', props: { placeholder: '搜索商品名…', type: 'text', value: s.search, action: 'shopSearch' }, layout: { flex: 1 } },
        ],
      },
      grid,
      { type: 'Divider', id: 'shop-div', props: {} },
      detailPanel(s),
    ],
  };
}

/** 纯 reducer：状态 + 信号(kind,arg) → 新状态(+可选 toast 意图)。无副作用·可单测。 */
export function applyShop(
  s: ShopState, kind: string, arg?: string,
): { state: ShopState; toast?: { tone: 'ok' | 'danger'; text: string } } {
  const st: ShopState = { ...s, owned: { ...s.owned } };
  switch (kind) {
    case 'cat': st.category = (arg as ShopCat) ?? 'all'; return { state: st };
    case 'search': st.search = arg ?? ''; return { state: st };
    case 'select': st.selectedId = arg ?? null; st.qty = 1; return { state: st };
    case 'qty': st.qty = Math.max(1, Math.min(99, Number(arg) || 1)); return { state: st };
    case 'buy': {
      const sel = ITEMS.find((i) => i.id === st.selectedId);
      if (!sel) return { state: s };
      const total = sel.price * st.qty;
      if (s.gold >= total) {
        st.gold = s.gold - total;
        st.owned[sel.id] = (st.owned[sel.id] ?? 0) + st.qty;
        return { state: st, toast: { tone: 'ok', text: `购买成功：${sel.name} ×${st.qty}` } };
      }
      return { state: s, toast: { tone: 'danger', text: '金币不足，买不起这么多' } };
    }
    default: return { state: s };
  }
}
