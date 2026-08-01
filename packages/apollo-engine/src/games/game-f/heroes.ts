// Game F · 英雄名册 + 阵营 + 装备数据（从 blueprint.ts 拆出）。
import { TEAM_A, TEAM_B, WARRIOR, TACTICIAN, ASSASSIN, FACT_SHU, FACT_WEI, FACT_WU, SHU_RED, WEI_BLUE, WU_GREEN, HP_SCALE } from './constants.js';
import { F_HERO, F_FX_STRIKE, F_FX_ARROW, F_FX_FLAME, F_FX_FROST, F_FX_DRAIN } from './assets.js';
import { ITEM_LIB } from './items.js';

export interface HeroSpec {
  id: string;
  name: string;
  key: string;
  team: number;
  enemy: number;
  cls: number; // 职业位（WARRIOR/TACTICIAN/ASSASSIN）
  faction: number; // 势力位（FACT_SHU/WEI/WU）—— 羁绊
  tint: number; // 势力色
  q: number; // 视觉列 col（odd-r）
  r: number; // 视觉行 row（r0-3=魏上半场, r4-7=蜀下半场）
  hp: number;
  atk: number;
  ult: string;
  ultDmg: number;
  ultSize: number;
  atkType: 'melee' | 'ranged' | 'magic';
  ultFx: string;
  ultDot?: boolean;
  ultFreeze?: number;
  items?: string[];
  seed?: boolean; // false=商店专属不播种（6 将库：开局只播种原 4 将）
}

// 站位金铲铲式（7×8：魏上半场 r0..3 / 蜀下半场 r4..7）+ 各英雄独立血量/攻击 + 职业 + 势力 + 专属大招。
export const ROSTER: HeroSpec[] = [
  // 蜀（TEAM_A，下半场，红）—— 单机=纯刘备阵营，不混吴（曹战刘世界观）。
  { id: 'a_guanyu', name: '关羽', key: F_HERO.guan_yu, team: TEAM_A, enemy: TEAM_B, cls: WARRIOR, faction: FACT_SHU, tint: SHU_RED, q: 2, r: 4, hp: 240, atk: 12, ult: '青龙偃月', ultDmg: 45, ultSize: 80, atkType: 'melee', ultFx: F_FX_STRIKE, items: ['yuxi'] },
  { id: 'a_zhaoyun', name: '赵云', key: F_HERO.zhao_yun, team: TEAM_A, enemy: TEAM_B, cls: WARRIOR, faction: FACT_SHU, tint: SHU_RED, q: 4, r: 4, hp: 165, atk: 18, ult: '七进七出', ultDmg: 75, ultSize: 55, atkType: 'melee', ultFx: F_FX_STRIKE, items: ['qinggang'] },
  { id: 'a_zhuge', name: '诸葛亮', key: F_HERO.zhuge_liang, team: TEAM_A, enemy: TEAM_B, cls: TACTICIAN, faction: FACT_SHU, tint: SHU_RED, q: 2, r: 6, hp: 120, atk: 24, ult: '八阵图', ultDmg: 35, ultSize: 95, atkType: 'magic', ultFx: F_FX_FROST, ultFreeze: 120 },
  { id: 'a_zhouyu', name: '张飞', key: F_HERO.zhang_fei, team: TEAM_A, enemy: TEAM_B, cls: WARRIOR, faction: FACT_SHU, tint: SHU_RED, q: 4, r: 6, hp: 200, atk: 15, ult: '燕人咆哮', ultDmg: 50, ultSize: 72, atkType: 'melee', ultFx: F_FX_STRIKE },
  // 蜀 6 将库扩充（商店专属，seed:false 不播种）：
  { id: 'a_machao', name: '马超', key: F_HERO.ma_chao, team: TEAM_A, enemy: TEAM_B, cls: WARRIOR, faction: FACT_SHU, tint: SHU_RED, q: 3, r: 5, hp: 190, atk: 16, ult: '西凉铁骑', ultDmg: 48, ultSize: 70, atkType: 'melee', ultFx: F_FX_STRIKE, seed: false },
  { id: 'a_huangzhong', name: '黄忠', key: F_HERO.huang_zhong, team: TEAM_A, enemy: TEAM_B, cls: ASSASSIN, faction: FACT_SHU, tint: SHU_RED, q: 1, r: 6, hp: 130, atk: 22, ult: '百步穿杨', ultDmg: 55, ultSize: 48, atkType: 'ranged', ultFx: F_FX_ARROW, seed: false },
  // 魏（TEAM_B，上半场，蓝）—— 单机=纯曹操阵营，不混吴。
  { id: 'b_zhangliao', name: '张辽', key: F_HERO.zhang_liao, team: TEAM_B, enemy: TEAM_A, cls: WARRIOR, faction: FACT_WEI, tint: WEI_BLUE, q: 2, r: 3, hp: 200, atk: 15, ult: '突阵', ultDmg: 50, ultSize: 70, atkType: 'melee', ultFx: F_FX_STRIKE, items: ['fangtian'] },
  { id: 'b_xuchu', name: '许褚', key: F_HERO.xu_chu, team: TEAM_B, enemy: TEAM_A, cls: WARRIOR, faction: FACT_WEI, tint: WEI_BLUE, q: 4, r: 3, hp: 270, atk: 11, ult: '裸衣血战', ultDmg: 42, ultSize: 78, atkType: 'melee', ultFx: F_FX_STRIKE },
  { id: 'b_simayi', name: '司马懿', key: F_HERO.sima_yi, team: TEAM_B, enemy: TEAM_A, cls: TACTICIAN, faction: FACT_WEI, tint: WEI_BLUE, q: 3, r: 1, hp: 130, atk: 23, ult: '鬼谋', ultDmg: 40, ultSize: 88, atkType: 'magic', ultFx: F_FX_DRAIN, ultDot: true, items: ['qinggang'] },
  { id: 'b_ganning', name: '夏侯惇', key: F_HERO.xiahou_dun, team: TEAM_B, enemy: TEAM_A, cls: WARRIOR, faction: FACT_WEI, tint: WEI_BLUE, q: 5, r: 1, hp: 200, atk: 14, ult: '拔矢啖睛', ultDmg: 50, ultSize: 70, atkType: 'melee', ultFx: F_FX_STRIKE },
  // 魏 6 将库（对称扩充，选阵营翻转用；商店专属 seed:false）：
  { id: 'b_caoren', name: '曹仁', key: F_HERO.cao_ren, team: TEAM_B, enemy: TEAM_A, cls: WARRIOR, faction: FACT_WEI, tint: WEI_BLUE, q: 3, r: 2, hp: 230, atk: 12, ult: '据守', ultDmg: 40, ultSize: 72, atkType: 'melee', ultFx: F_FX_STRIKE, seed: false },
  { id: 'b_dianwei', name: '典韦', key: F_HERO.dian_wei, team: TEAM_B, enemy: TEAM_A, cls: WARRIOR, faction: FACT_WEI, tint: WEI_BLUE, q: 1, r: 2, hp: 250, atk: 14, ult: '古之恶来', ultDmg: 50, ultSize: 74, atkType: 'melee', ultFx: F_FX_STRIKE, seed: false },
];

// 吴(孙)faction 刺客核心（game-f-wu-faction-seed.md §一；drop-in 待命）：4 刺客+1谋+1将。
// 斩杀走 F-061 职业 trait（ASSASSIN 普攻自带 executeBelow，已 done）。team/q/r=占位（蜀半场），
// 真正布局/选位 = 3-faction plumbing（多人重构，见 seed §三）。现 2-faction v1 不选吴 → 不接线、不扰动。
export const WU_ROSTER: HeroSpec[] = [
  { id: 'c_lvmeng', name: '吕蒙', key: F_HERO.lv_meng, team: TEAM_A, enemy: TEAM_B, cls: ASSASSIN, faction: FACT_WU, tint: WU_GREEN, q: 2, r: 5, hp: 150, atk: 20, ult: '白衣渡江', ultDmg: 55, ultSize: 50, atkType: 'melee', ultFx: F_FX_STRIKE },
  { id: 'c_ganning', name: '甘宁', key: F_HERO.gan_ning, team: TEAM_A, enemy: TEAM_B, cls: ASSASSIN, faction: FACT_WU, tint: WU_GREEN, q: 4, r: 5, hp: 135, atk: 23, ult: '百骑劫营', ultDmg: 50, ultSize: 55, atkType: 'melee', ultFx: F_FX_STRIKE },
  { id: 'c_taishici', name: '太史慈', key: F_HERO.tai_shici, team: TEAM_A, enemy: TEAM_B, cls: ASSASSIN, faction: FACT_WU, tint: WU_GREEN, q: 1, r: 6, hp: 130, atk: 22, ult: '神射', ultDmg: 52, ultSize: 45, atkType: 'ranged', ultFx: F_FX_ARROW },
  { id: 'c_lingtong', name: '凌统', key: F_HERO.ling_tong, team: TEAM_A, enemy: TEAM_B, cls: ASSASSIN, faction: FACT_WU, tint: WU_GREEN, q: 5, r: 6, hp: 145, atk: 19, ult: '旋身突阵', ultDmg: 48, ultSize: 52, atkType: 'melee', ultFx: F_FX_STRIKE },
  { id: 'c_zhouyu', name: '周瑜', key: F_HERO.zhou_yu, team: TEAM_A, enemy: TEAM_B, cls: TACTICIAN, faction: FACT_WU, tint: WU_GREEN, q: 3, r: 7, hp: 125, atk: 23, ult: '火烧赤壁', ultDmg: 38, ultSize: 92, atkType: 'magic', ultFx: F_FX_FLAME, ultDot: true, seed: false },
  { id: 'c_sunce', name: '孙策', key: F_HERO.sun_ce, team: TEAM_A, enemy: TEAM_B, cls: WARRIOR, faction: FACT_WU, tint: WU_GREEN, q: 3, r: 4, hp: 210, atk: 15, ult: '小霸王', ultDmg: 50, ultSize: 70, atkType: 'melee', ultFx: F_FX_STRIKE, seed: false },
];

// 开局选阵营（REQ-F-061）：ROSTER=「玩家=蜀」基线；选魏 = swapFactions(ROSTER)。
export type Faction = 'shu' | 'wei' | 'wu';
function swapFactions(roster: HeroSpec[]): HeroSpec[] {
  return roster.map((h): HeroSpec => {
    const wasPlayer = h.team === TEAM_A;
    return {
      ...h,
      id: (wasPlayer ? 'b_' : 'a_') + h.id.slice(2),
      team: wasPlayer ? TEAM_B : TEAM_A,
      enemy: wasPlayer ? TEAM_A : TEAM_B,
      tint: wasPlayer ? WEI_BLUE : SHU_RED,
      r: 7 - h.r,
    };
  });
}
export function rosterFor(pf: Faction): HeroSpec[] {
  if (pf === 'wei') return swapFactions(ROSTER);
  if (pf === 'wu') return [...WU_ROSTER, ...ROSTER.filter((h) => h.team === TEAM_B)]; // 吴(TEAM_A 下半场) + 魏(TEAM_B 敌方半区)=有效全名册（3-faction plumbing 落地，敌阵复用魏）
  return ROSTER;
}
// 商店英雄码：玩家阵营将 → 码 1..N（按 a_ 顺序）。
export function codesFor(roster: HeroSpec[]): Record<string, number> {
  const out: Record<string, number> = {};
  roster.filter((h) => h.team === TEAM_A).forEach((h, i) => { out[h.id] = i + 1; });
  return out;
}

// 装备（数据）：物品=属性加成；英雄装配期把 hp/atk 加上（静态）。
// —— 起手装（legacy）：既有英雄出生自带，保持原值不动（确定性安全网；勿改数值）。
export const ITEMS: Record<string, { name: string; hp?: number; atk?: number }> = {
  yuxi: { name: '玉玺', hp: 120 },
  qinggang: { name: '青釭剑', atk: 12 },
  fangtian: { name: '方天画戟', hp: 60, atk: 8 },
};
// 道具大库（程序化生成 600+ 件）拆到 items.ts；此处只负责把 hp/atk 烘进英雄。
// 属性查询：库（ItemDef.stats）优先，回退起手装（legacy ITEMS）。hp/atk 接战斗，其余表现。
const itemStat = (id: string, k: 'hp' | 'atk'): number => ITEM_LIB[id]?.stats[k] ?? ITEMS[id]?.[k] ?? 0;
const sumItem = (ids: string[] | undefined, k: 'hp' | 'atk'): number => (ids ?? []).reduce((s, id) => s + itemStat(id, k), 0);
export const finalHp = (h: HeroSpec): number => h.hp * HP_SCALE + sumItem(h.items, 'hp');
export const finalAtk = (h: HeroSpec): number => h.atk + sumItem(h.items, 'atk');
