import { describe, it, expect } from 'vitest';
import { rosterFor, buildGameFBlueprint } from './blueprint.js';
import { WU_ROSTER } from './heroes.js';
import { BAIYI_DECK, DECK_REGISTRY } from './decks.js';
import { templatesFor } from './combat.js';
import { FACT_WU, ASSASSIN, BENCH_OCC } from './constants.js';

// 吴 faction 刺客核心（game-f-wu-faction-seed.md）：数据待命验证（plumbing 前不接线，但数据正确 + F-061 trait 覆盖）。
describe('吴 faction 刺客核心 + 白衣渡江（待命数据）', () => {
  it('WU_ROSTER：6 英雄（4 刺客+1谋+1将）全 FACT_WU；4 个 ASSASSIN 支撑白衣两档阈值', () => {
    expect(WU_ROSTER).toHaveLength(6);
    expect(WU_ROSTER.every((h) => (h.faction & FACT_WU) === FACT_WU)).toBe(true);
    expect(WU_ROSTER.filter((h) => h.cls === ASSASSIN)).toHaveLength(4); // 吕蒙/甘宁/太史慈/凌统
    expect(WU_ROSTER.map((h) => h.name)).toEqual(['吕蒙', '甘宁', '太史慈', '凌统', '周瑜', '孙策']);
    // 3-faction plumbing 落地：rosterFor('wu')=吴(TEAM_A) + 魏(TEAM_B 敌方半区)，TEAM_A 半区即 WU_ROSTER。
    const wu = rosterFor('wu');
    expect(wu.filter((h) => (h.faction & FACT_WU) === FACT_WU)).toEqual(WU_ROSTER);
    expect(wu.some((h) => h.team !== WU_ROSTER[0].team)).toBe(true); // 含敌方半区（不再只 6 吴）
  });

  it('F-061 职业 trait 自动覆盖吴刺客：吕蒙普攻自带 executeBelow（处决残血）', () => {
    const t = templatesFor(WU_ROSTER) as Record<string, unknown>;
    const lv = t['strike_c_lvmeng'] as { entities: { area: { Hitbox: { executeBelow?: number } } } };
    expect(lv.entities.area.Hitbox.executeBelow).toBe(0.15); // ASSASSIN 斩杀线
    const zhou = t['proj_c_zhouyu'] ?? t['strike_c_zhouyu']; // 周瑜=谋士非刺客，无斩杀
    expect(zhou).toBeDefined();
  });

  it('BAIYI_DECK：白衣 threshold-buff 绑刺客；待命=不入 DECK_REGISTRY（plumbing 前不可选）', () => {
    const baiyi = BAIYI_DECK.cards.find((c) => c.kind === 'threshold-buff');
    expect(baiyi && 'tagMask' in baiyi && baiyi.tagMask).toBe(BENCH_OCC | ASSASSIN);
    expect(BAIYI_DECK.faction).toBe('wu');
    expect(DECK_REGISTRY.baiyi).toBe(BAIYI_DECK); // owner 2026-06-15 启用单机吴 → 白衣渡江入表可选
  });

  it('3-faction plumbing：吴 蓝图可加载不崩（敌方半区就位）+ 确定', () => {
    expect(() => buildGameFBlueprint({ playerFaction: 'wu' })).not.toThrow(); // 旧 bug：rosterFor(wu) 无敌方半区 → enemyHeroes[].id 崩
    const bp = buildGameFBlueprint({ playerFaction: 'wu' });
    expect(Object.keys(bp.entities).some((k) => k.startsWith('slot_s'))).toBe(true); // 敌阵槽展开（enemyHeroes 非空）
  });
});
