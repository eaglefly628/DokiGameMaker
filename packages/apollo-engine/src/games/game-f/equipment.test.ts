import { describe, it, expect } from 'vitest';
import { ITEM_LIB, RARITY, RARITIES, NAMED_UNIQUES, buildItemLib, itemIcon, rollItemId, formatItemStats, itemTip, type Slot, type Rarity } from './items.js';
import { finalHp, finalAtk, type HeroSpec } from './heroes.js';
import { HP_SCALE } from './constants.js';

const hero = (hp: number, atk: number, items?: string[]): HeroSpec =>
  ({ hp, atk, items } as unknown as HeroSpec);

describe('装备系统 · 程序化道具库（基底×品级×词缀 + 命名传说；薄确定性展开器，零引擎）', () => {
  it('总量 ≥ 600 件（owner 目标）；4 槽 × 5 品全覆盖', () => {
    const all = Object.values(ITEM_LIB);
    expect(all.length).toBeGreaterThanOrEqual(600);
    const slots: Slot[] = ['weapon', 'armor', 'mount', 'trinket'];
    for (const s of slots) expect(all.some((i) => i.slot === s)).toBe(true);
    for (const r of RARITIES) expect(all.some((i) => i.rarity === r)).toBe(true);
  });

  it('每件 schema 合法（id=key、名/描述非空、stats 为对象）', () => {
    const slots: Slot[] = ['weapon', 'armor', 'mount', 'trinket'];
    for (const [k, v] of Object.entries(ITEM_LIB)) {
      expect(v.id).toBe(k);
      expect(v.name).toBeTruthy();
      expect(v.desc).toBeTruthy();
      expect(slots).toContain(v.slot);
      expect(RARITIES).toContain(v.rarity);
      expect(typeof v.stats).toBe('object');
    }
  });

  it('展开器确定性：两次构建产出完全一致（可回放，非随机）', () => {
    const a = buildItemLib();
    const b = buildItemLib();
    expect(Object.keys(a)).toEqual(Object.keys(b));
    // 抽样深比一件含词缀的变体
    const sample = Object.keys(a).find((k) => k.includes('__') && k.split('__').length === 3)!;
    expect(a[sample]).toEqual(b[sample]);
  });

  it('品级缩放：同基底数值随品级单调递增（白<橙）', () => {
    // 找一对同基底的白/橙纯净变体（id=`${key}__${rarity}`）
    const whiteKey = Object.keys(ITEM_LIB).find((k) => k.endsWith('__white') && (ITEM_LIB[k].stats.atk || ITEM_LIB[k].stats.hp))!;
    const base = whiteKey.replace('__white', '');
    const w = ITEM_LIB[`${base}__white`];
    const o = ITEM_LIB[`${base}__orange`];
    const sumNum = (s: { hp?: number; atk?: number }): number => (s.hp ?? 0) + (s.atk ?? 0);
    expect(sumNum(o.stats)).toBeGreaterThan(sumNum(w.stats)); // 橙数值 > 白
  });

  it('词缀：仅蓝+ 挂词缀（名带「·」、id 三段）；白/绿无词缀变体', () => {
    const affixed = Object.values(ITEM_LIB).filter((i) => i.id.split('__').length === 3);
    expect(affixed.length).toBeGreaterThan(300); // ~414 词缀变体
    for (const a of affixed) {
      expect((['blue', 'purple', 'orange'] as Rarity[])).toContain(a.rarity); // 蓝+
      expect(a.name).toContain('·');
    }
    // 白/绿不存在三段词缀 id
    expect(Object.keys(ITEM_LIB).some((k) => k.endsWith('__white') && k.split('__').length === 3)).toBe(false);
  });

  it('命名传说固定在库、覆盖不被程序化变体冲掉（如 赤兔马/方天画戟/传国玉玺）', () => {
    expect(Object.keys(NAMED_UNIQUES).length).toBeGreaterThanOrEqual(50); // owner 锁 50 命名传说
    expect(ITEM_LIB['m_chitu']?.name).toBe('赤兔马');
    expect(ITEM_LIB['m_chitu']?.effect).toBeTruthy(); // 橙装带特效
    expect(ITEM_LIB['w_fangtian']?.stats.atk).toBe(40);
    expect(ITEM_LIB['t_yuxi']?.rarity).toBe('orange');
  });

  it('icon 回退：道具→槽位占位；非库 id→📦', () => {
    expect(itemIcon('w_fangtian')).toBe('🗡');
    expect(itemIcon('a_baiyin')).toBe('🛡');
    expect(itemIcon('m_chitu')).toBe('🐎');
    expect(itemIcon('t_yuxi')).toBe('🔮');
    expect(itemIcon('不存在')).toBe('📦');
  });
});

describe('装备 ② tooltip/拾取 表现层助手（meta，不入战斗 hash）', () => {
  it('rollItemId：注入 rnd 确定可控；恒返回库内合法 id', () => {
    expect(ITEM_LIB[rollItemId(() => 0)]).toBeTruthy();   // 最低分支
    expect(ITEM_LIB[rollItemId(() => 0.999)]).toBeTruthy(); // 最高分支
    for (let i = 0; i < 50; i++) expect(ITEM_LIB[rollItemId()]).toBeTruthy();
  });
  it('rollItemId 太阁越深越好：depth 高 → 蓝+稀有占比上升（spec §二）', () => {
    // 确定性 LCG 采样，比较 depth0 vs depth8 的稀有(蓝/紫/橙)命中数。
    const lcg = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const rare = new Set(['blue', 'purple', 'orange']);
    const count = (depth: number): number => {
      const rnd = lcg(42); let n = 0;
      for (let i = 0; i < 2000; i++) if (rare.has(ITEM_LIB[rollItemId(rnd, depth)].rarity)) n++;
      return n;
    };
    expect(count(8)).toBeGreaterThan(count(0)); // 深处稀有更多
  });
  it('formatItemStats：hp/atk 整数、atkSpd/crit/move 百分比', () => {
    expect(formatItemStats({ hp: 150, atk: 15 })).toEqual(['生命 +150', '攻击 +15']);
    expect(formatItemStats({ crit: 0.2, atkSpd: 0.1, move: 0.3 })).toEqual(['攻速 +10%', '暴击 +20%', '移速 +30%']);
  });
  it('itemTip：库 id 出结构（名/色/品级/槽位/属性/功效/描述）；非库→null', () => {
    const t = itemTip('w_fangtian')!;
    expect(t.name).toBe('方天画戟');
    expect(t.color).toBe('#e8902a'); // 橙
    expect(t.slotLabel).toBe('武器');
    expect(t.stats).toContain('攻击 +40');
    expect(t.effect).toBe('暴击溅射');
    expect(itemTip('不存在')).toBeNull();
  });
});

describe('装备生效 · finalHp/finalAtk 烘库存道具 stats（hp/atk 接战斗）', () => {
  it('库道具 hp/atk 累加进 finalHp/finalAtk', () => {
    const h = hero(100, 10, ['w_fangtian', 't_yuxi']); // atk40+15 / hp0+150
    expect(finalAtk(h)).toBe(10 + 40 + 15);
    expect(finalHp(h)).toBe(100 * HP_SCALE + 150);
  });
  it('crit/atkSpd/move 不入 finalHp/finalAtk（无战斗读者，仅表现）', () => {
    const m = hero(100, 10, ['m_chitu']); // move0.3 atk12 atkSpd0.1 → 只 atk 入
    expect(finalAtk(m)).toBe(10 + 12);
    expect(finalHp(m)).toBe(100 * HP_SCALE);
  });

  // 确定性安全网：起手装（legacy）不动 —— 既有英雄部署 hp/atk 与改动前一致。
  it('起手装 legacy 不变：玉玺 hp+120 / 青釭剑 atk+12 / 方天画戟 hp+60 atk+8', () => {
    expect(finalHp(hero(240, 12, ['yuxi']))).toBe(240 * HP_SCALE + 120); // 关羽含玉玺（placement.test 同源）
    expect(finalAtk(hero(165, 18, ['qinggang']))).toBe(18 + 12);          // 赵云含青釭剑
    const zhangliao = hero(200, 15, ['fangtian']);
    expect(finalHp(zhangliao)).toBe(200 * HP_SCALE + 60);
    expect(finalAtk(zhangliao)).toBe(15 + 8);
  });
});
