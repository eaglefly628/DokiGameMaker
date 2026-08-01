import { describe, it, expect } from 'vitest';
import { JOKER_CATALOG, JOKER_CATALOG_BY_ID } from './joker-catalog.js';
import { STARTER_JOKERS } from './jokers.js';
import { JOKER_ART_FILES } from './assets.js';

// 「数据库要全」：断言全 150、元数据合法、与 assets/jokers 对齐。纯数据自洽，不进 sim。

describe('game-e · 完整小丑数据库', () => {
  it('恰好 150 张、nr 连续 1..150、id 唯一', () => {
    expect(JOKER_CATALOG.length).toBe(150);
    const nrs = JOKER_CATALOG.map((j) => j.nr).sort((a, b) => a - b);
    expect(nrs[0]).toBe(1);
    expect(nrs[149]).toBe(150);
    expect(new Set(nrs).size).toBe(150);
    expect(new Set(JOKER_CATALOG.map((j) => j.id)).size).toBe(150);
  });

  it('字段在合法枚举内；Legendary 价格为 null、其余为正数', () => {
    const types = new Set(['+c', '+m', 'Xm', '++', '!!', '...', '+$']);
    const rarities = new Set(['common', 'uncommon', 'rare', 'legendary']);
    const acts = new Set(['indep', 'on_scored', 'on_held', 'on_played', 'on_discard', 'mixed', 'on_other_jokers', 'passive']);
    for (const j of JOKER_CATALOG) {
      expect(types.has(j.jokerType)).toBe(true);
      expect(rarities.has(j.rarity)).toBe(true);
      expect(acts.has(j.activation)).toBe(true);
      expect(j.text.length).toBeGreaterThan(0);
      if (j.rarity === 'legendary') expect(j.cost).toBeNull();
      else expect(j.cost as number).toBeGreaterThan(0);
    }
  });

  it('稀有度分布对齐官方（Common 61 / Uncommon 64 / Rare 20 / Legendary 5）', () => {
    const count = (r: string) => JOKER_CATALOG.filter((j) => j.rarity === r).length;
    expect(count('common')).toBe(61);
    expect(count('uncommon')).toBe(64);
    expect(count('rare')).toBe(20);
    expect(count('legendary')).toBe(5);
  });

  it('hasArt 与资产清单一致；命中 109/150', () => {
    const artIds = new Set(JOKER_ART_FILES.map((f) => f.id));
    expect(JOKER_CATALOG.filter((j) => j.hasArt).length).toBe(109);
    for (const j of JOKER_CATALOG) expect(j.hasArt).toBe(artIds.has(j.id));
  });

  it('STARTER_JOKERS 全部在 catalog 内（id + 关键属性对齐）', () => {
    for (const s of STARTER_JOKERS) {
      const c = JOKER_CATALOG_BY_ID.get(s.id);
      expect(c, `starter ${s.id} 应在 catalog`).toBeDefined();
      expect(c!.name).toBe(s.name);
      expect(c!.jokerType).toBe(s.jokerType);
    }
  });
});
