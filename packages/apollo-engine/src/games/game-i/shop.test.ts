// Game I · 组合演示「商店」联动测试——验证「UI=状态纯函数 + 纯 reducer」的复杂联动成立。
import { describe, it, expect } from 'vitest';
import { renderNode } from '@ui/components/index.js';
import { onyx } from './themes.js';
import {
  buildShop, applyShop, filterItems, ITEMS, INITIAL_SHOP, type ShopState,
} from './shop.js';

const S = (over: Partial<ShopState> = {}): ShopState => ({ ...INITIAL_SHOP, owned: {}, ...over });

describe('Game I 组合演示·商店 联动', () => {
  it('过滤联动：分类 + 搜索词共同收窄商品集', () => {
    expect(filterItems(S()).length).toBe(ITEMS.length);             // all·无搜索 → 全量
    const weapons = filterItems(S({ category: 'weapon' }));
    expect(weapons.every((i) => i.cat === 'weapon')).toBe(true);
    expect(weapons.length).toBe(3);
    const byName = filterItems(S({ search: '连弩' }));
    expect(byName.map((i) => i.id)).toEqual(['w3']);
    // 分类 + 搜索叠加：武器里搜"甲"→ 空（甲在防具）
    expect(filterItems(S({ category: 'weapon', search: '甲' })).length).toBe(0);
  });

  it('选中联动：选商品后详情面板出现，合计=单价×数量', () => {
    const html = renderNode(buildShop(S({ selectedId: 'w1', qty: 2 })), onyx);
    expect(html).toContain('shop-detail');          // 详情面板出现
    expect(html).toContain('合计 600 金');           // 300×2 联动算出
    // 未选中时只有占位提示、无详情面板
    expect(renderNode(buildShop(S()), onyx)).toContain('shop-detail-empty');
  });

  it('买得起与否联动：金币不足 → 合计变红 + 购买按钮 disabled', () => {
    // gold 500，选 SSR 武器(300) ×2 = 600 > 500 → 买不起
    const poor = renderNode(buildShop(S({ selectedId: 'w1', qty: 2, gold: 500 })), onyx);
    expect(poor).toContain('shop-poor');             // "金币不足"提示
    expect(poor).toMatch(/id="shop-buy"[^>]*disabled/); // 购买按钮禁用
    // ×1 = 300 ≤ 500 → 买得起，无禁用
    const ok = renderNode(buildShop(S({ selectedId: 'w1', qty: 1, gold: 500 })), onyx);
    expect(ok).not.toContain('shop-poor');
  });

  it('reducer 购买成功：扣金币 + 记拥有 + 出 ok toast（纯函数·不改原状态）', () => {
    const before = S({ selectedId: 'w3', qty: 2, gold: 500 }); // 连弩 120×2=240
    const { state, toast } = applyShop(before, 'buy');
    expect(state.gold).toBe(260);                    // 500-240
    expect(state.owned['w3']).toBe(2);
    expect(toast).toEqual({ tone: 'ok', text: '购买成功：连弩 ×2' });
    expect(before.gold).toBe(500);                   // 原状态不被改（纯函数）
  });

  it('reducer 购买失败：金币不足 → 状态不变 + danger toast', () => {
    const before = S({ selectedId: 'w1', qty: 2, gold: 500 }); // 600 > 500
    const { state, toast } = applyShop(before, 'buy');
    expect(state.gold).toBe(500);                    // 不扣
    expect(state.owned['w1']).toBeUndefined();
    expect(toast?.tone).toBe('danger');
  });

  it('reducer 信号：cat/search/select/qty 正确改状态', () => {
    expect(applyShop(S(), 'cat', 'armor').state.category).toBe('armor');
    expect(applyShop(S(), 'search', '剑').state.search).toBe('剑');
    const seld = applyShop(S({ qty: 5 }), 'select', 'a1').state;
    expect(seld.selectedId).toBe('a1');
    expect(seld.qty).toBe(1);                        // 选新商品重置数量
    expect(applyShop(S(), 'qty', '99').state.qty).toBe(99);
    expect(applyShop(S(), 'qty', '999').state.qty).toBe(99); // 上限钳制
  });
});
