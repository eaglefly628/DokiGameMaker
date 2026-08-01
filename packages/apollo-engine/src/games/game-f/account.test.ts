import { describe, it, expect } from 'vitest';
import { warfundsFor, getWarfunds, addWarfunds, settleRun, memoryKV, spendWarfunds, gachaPull, gachaPull10, gachaRates, getCollection, GACHA_COST, GACHA10_COST, GACHA_POOL, getLP, rankFor, updateLpAfterRun, disenchant, getDust, addDust, enchantCard, getEnchantLevels, DUST_PER_CARD, enchantCost, ENCHANT_MAX, getSeason, getFormat, setFormat, advanceSeason, seasonInfo, grantCards, type GachaEntry } from './account.js';

describe('经济 v1 · 账号层战功（warfunds；服务层、与 ECS 解耦）', () => {
  it('战功公式：贡献/胜利/波深单调增，钳非负取整', () => {
    const base = warfundsFor({ contribution: 0, victory: false, wave: 0 });
    expect(base).toBe(20);
    expect(warfundsFor({ contribution: 10, victory: false, wave: 0 })).toBeGreaterThan(base); // 贡献↑
    expect(warfundsFor({ contribution: 0, victory: true, wave: 0 })).toBe(base + 50); // 胜利奖
    expect(warfundsFor({ contribution: 0, victory: false, wave: 5 })).toBe(base + 50); // 波深 ×10
    expect(warfundsFor({ contribution: -999, victory: false, wave: -3 })).toBeGreaterThanOrEqual(0); // 钳非负
    expect(Number.isInteger(warfundsFor({ contribution: 3.7, victory: true, wave: 2 }))).toBe(true); // 取整
  });

  it('持久化：addWarfunds 累加并读回（注入内存 KV）', () => {
    const kv = memoryKV();
    expect(getWarfunds(kv)).toBe(0);
    expect(addWarfunds(100, kv)).toBe(100);
    expect(addWarfunds(50, kv)).toBe(150);
    expect(getWarfunds(kv)).toBe(150);
    expect(addWarfunds(-9, kv)).toBe(150); // 负数不减
  });

  it('settleRun：算战功 + 入账 + 返回余额', () => {
    const kv = memoryKV();
    const r1 = settleRun({ contribution: 20, victory: true, wave: 5 }, kv); // 20+40+50+50=160
    expect(r1.earned).toBe(160);
    expect(r1.balance).toBe(160);
    const r2 = settleRun({ contribution: 0, victory: false, wave: 1 }, kv); // 20+10=30
    expect(r2.earned).toBe(30);
    expect(r2.balance).toBe(190);
  });
});

describe('经济 v1 · 收藏 + 软币抽卡（闭合 earn→spend；account 层）', () => {
  it('spendWarfunds：够才扣', () => {
    const kv = memoryKV(); addWarfunds(150, kv);
    expect(spendWarfunds(200, kv)).toBe(false); // 不够
    expect(getWarfunds(kv)).toBe(150);
    expect(spendWarfunds(100, kv)).toBe(true);
    expect(getWarfunds(kv)).toBe(50);
  });
  it('gachaRates：出率和=1、概率公示每张牌', () => {
    const rates = gachaRates();
    expect(rates.length).toBe(GACHA_POOL.length);
    const sum = rates.reduce((s, r) => s + r.rate, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
  it('gachaPull：扣战功 + 出牌入收藏；不够则失败不扣', () => {
    const kv = memoryKV();
    expect(gachaPull(kv, () => 0).ok).toBe(false); // 0 战功抽不动
    addWarfunds(GACHA_COST, kv);
    const r = gachaPull(kv, () => 0, [{ id: 'a_guanyu', name: '关羽', weight: 1 }]);
    expect(r.ok).toBe(true);
    expect(r.card!.id).toBe('a_guanyu');
    expect(r.balance).toBe(0);
    expect(getCollection(kv)['a_guanyu']).toBe(1);
  });
  it('卡池=小丑牌(deck CardSpec)非武将；钥匙牌=传说(权最低)', () => {
    expect(GACHA_POOL.some((e) => e.id === 'taoyuan' && e.rarity === 'legendary')).toBe(true); // 桃园誓=钥匙牌传说
    expect(GACHA_POOL.every((e) => !e.id.startsWith('a_') && !e.id.startsWith('c_'))).toBe(true); // 无武将 id
    const leg = GACHA_POOL.find((e) => e.rarity === 'legendary')!;
    const com = GACHA_POOL.find((e) => e.rarity === 'common');
    if (com) expect(leg.weight).toBeLessThan(com.weight); // 传说更稀有
  });
  it('gachaPull10：十连 + 保底（无稀有则末位换稀有）', () => {
    const kv = memoryKV(); addWarfunds(GACHA10_COST, kv);
    const pool: GachaEntry[] = [{ id: 'c1', name: 'c1', weight: 1, rarity: 'common' }, { id: 'r1', name: 'r1', weight: 1, rarity: 'rare' }];
    const r = gachaPull10(kv, () => 0, pool); // rng=0 → 全抽 common → 保底末位换 rare
    expect(r.ok).toBe(true);
    expect(r.cards).toHaveLength(10);
    expect(r.cards.some((c) => c.rarity === 'rare')).toBe(true); // 保底命中
    expect(r.balance).toBe(0);
  });
});

describe('经济 v1 · 段位难度阀（LP→段位→太阁难度系数）', () => {
  it('段位表：LP 越高段位越高、难度系数越大', () => {
    expect(rankFor(0).tier).toBe('黑铁');
    expect(rankFor(1000).tier).toBe('白银');
    expect(rankFor(1300).tier).toBe('黄金');
    expect(rankFor(2500).difficulty).toBeGreaterThan(rankFor(1000).difficulty); // 高段位更凶
  });
  it('updateLpAfterRun：胜 +25 / 负 -15，钳非负', () => {
    const kv = memoryKV();
    expect(getLP(kv)).toBe(1000); // 起始
    expect(updateLpAfterRun(true, kv).rank.lp).toBe(1025);
    expect(updateLpAfterRun(false, kv).rank.lp).toBe(1010);
    const kv2 = memoryKV(); kv2.setItem('gamef.account.lp', '5');
    expect(updateLpAfterRun(false, kv2).rank.lp).toBe(0); // 钳非负
  });
});

describe('经济 v1 · 附魔 + 材料（养成第二轴；spec §五）', () => {
  it('disenchant：多余重复卡 → 化尘留 1', () => {
    const kv = memoryKV(); kv.setItem('gamef.account.collection', JSON.stringify({ taoyuan: 3 }));
    const r = disenchant('taoyuan', kv);
    expect(r.dust).toBe(2 * DUST_PER_CARD); // 3 张留 1 → 2 张化尘
    expect(getCollection(kv)['taoyuan']).toBe(1);
    expect(getDust(kv)).toBe(2 * DUST_PER_CARD);
    expect(disenchant('taoyuan', kv).dust).toBe(0); // 只剩 1 不可再分解
  });
  it('enchantCard：扣战功+尘（随级递增）→ +1 级；不够/满级/未拥有则失败', () => {
    const kv = memoryKV();
    expect(enchantCard('taoyuan', kv).ok).toBe(false); // 未拥有
    kv.setItem('gamef.account.collection', JSON.stringify({ taoyuan: 1 }));
    expect(enchantCard('taoyuan', kv).ok).toBe(false); // 没战功/尘
    const c0 = enchantCost(0); expect(c0).toEqual({ warfunds: 100, dust: 2 });
    addWarfunds(c0.warfunds, kv); addDust(c0.dust, kv);
    const r = enchantCard('taoyuan', kv);
    expect(r.ok).toBe(true); expect(r.level).toBe(1);
    expect(getWarfunds(kv)).toBe(0); expect(getDust(kv)).toBe(0); // 扣光
    expect(getEnchantLevels(kv)['taoyuan']).toBe(1);
    expect(enchantCost(1)).toEqual({ warfunds: 200, dust: 4 }); // 递增
    expect(ENCHANT_MAX).toBe(3);
  });
});

describe('赛季轮换骨架（经济 v1 真缺口 · spec §七 安全阀）', () => {
  it('默认 season=1 / format=standard；setFormat 持久', () => {
    const kv = memoryKV();
    expect(getSeason(kv)).toBe(1);
    expect(getFormat(kv)).toBe('standard');
    setFormat('wild', kv);
    expect(getFormat(kv)).toBe('wild');
    expect(seasonInfo(kv)).toEqual({ season: 1, format: 'wild' });
  });
  it('换季安全阀：season++、LP 向基线(1000)软重置(保40%超额)、收藏/战功留存', () => {
    const kv = memoryKV();
    addWarfunds(500, kv); grantCards(['taoyuan'], kv);
    for (let i = 0; i < 60; i++) updateLpAfterRun(true, kv); // 抬到高 LP（1000+60×25=2500）
    const lpHigh = getLP(kv);
    expect(lpHigh).toBeGreaterThan(2000);
    const r = advanceSeason(kv);
    expect(r.season).toBe(2);
    expect(getSeason(kv)).toBe(2);
    expect(r.lpAfter).toBe(Math.floor(1000 + (lpHigh - 1000) * 0.4)); // 软重置压缩
    expect(r.lpAfter).toBeLessThan(lpHigh);
    expect(r.lpAfter).toBeGreaterThan(1000); // 仍保部分超额（非清零）
    expect(getWarfunds(kv)).toBe(500);              // 战功留存
    expect(getCollection(kv)['taoyuan']).toBe(1);   // 收藏留存
  });
  it('低于基线换季不倒贴（钳基线附近，非负）', () => {
    const kv = memoryKV();
    for (let i = 0; i < 50; i++) updateLpAfterRun(false, kv); // 砸到 0
    const r = advanceSeason(kv);
    expect(r.lpAfter).toBeGreaterThanOrEqual(0);
    expect(r.lpAfter).toBeLessThanOrEqual(1000);
  });
});
