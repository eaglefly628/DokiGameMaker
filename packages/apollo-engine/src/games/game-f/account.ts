// Game F · 经济 v1 — 局外账号层（软币「战功」）。承 game-f-economy-spec-v1.md 〇/一/九（owner 2026-06-15 锁定）。
// ⛔ 铁律：服务/账号层与确定性 ECS **单向解耦**——本模块只消费引擎回吐的「攻岛结算」，绝不进 sim、不被 world.hash 触及。
// v1 仅一种局外软币 warfunds（战功）：攻岛按贡献+胜负+波深产出 → 持久化（localStorage；测试注入内存 KV）。
// 收藏/抽卡已接（earn→spend 闭合）；附魔/天梯随后切片；市场/充值押后 phase3。
// 卡池=**小丑牌**(各 deck 的 CardSpec 卡)，**非武将**——武将每局清零、人人平等是地基（cards-and-decks），抽武将=P2W 破核心（designer #18）。
import { DECK_REGISTRY } from './decks.js';

export interface Settlement {
  contribution: number; // 本局累计贡献度（引擎 contribution 资源）
  victory: boolean;     // 是否攻陷岛（单机「名次」退化为胜负）
  wave: number;         // 打到第几波（深度奖；攻得越深越多）
}

// 战功公式（§一：按贡献 + 名次产出）：基础 20 + 贡献×2 + 胜利 +50 + 波深×10。钳非负、取整（软币离散）。
export function warfundsFor(s: Settlement): number {
  return Math.max(0, Math.round(20 + s.contribution * 2 + (s.victory ? 50 : 0) + Math.max(0, s.wave) * 10));
}

// 极小持久化抽象：浏览器用 localStorage，node/测试注入内存 KV（账号层不依赖具体存储）。
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
export function memoryKV(): KV {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
}
function defaultKV(): KV {
  try {
    const ls = (globalThis as { localStorage?: KV }).localStorage;
    if (ls) return ls;
  } catch { /* SSR/无 DOM：退内存 */ }
  return memoryKV();
}

const KEY = 'gamef.account.warfunds';

export function getWarfunds(kv: KV = defaultKV()): number {
  const n = Number(kv.getItem(KEY) ?? '0');
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function addWarfunds(amount: number, kv: KV = defaultKV()): number {
  const next = getWarfunds(kv) + Math.max(0, Math.round(amount));
  kv.setItem(KEY, String(next));
  return next;
}

// 一局结束结算：算战功 → 累加余额 → 返回（用于大厅飘字 + 余额刷新）。纯账号层，单向消费结算。
export function settleRun(s: Settlement, kv: KV = defaultKV()): { earned: number; balance: number } {
  const earned = warfundsFor(s);
  return { earned, balance: addWarfunds(earned, kv) };
}

// 扣软币（抽卡/附魔出口）：余额够才扣，返回是否成功。addWarfunds 只进不出，spend 专管出。
export function spendWarfunds(amount: number, kv: KV = defaultKV()): boolean {
  const bal = getWarfunds(kv);
  if (amount <= 0 || bal < amount) return false;
  kv.setItem(KEY, String(bal - Math.round(amount)));
  return true;
}

// ── 附魔 + 材料（养成第二轴，spec §五；account 层 spend 战功+材料 升卡 → 局内加成）──
// 材料「尘」：分解收藏里多余的重复卡得（每张多余 +DUST_PER_CARD，count 保 1）。
const DUST_KEY = 'gamef.account.dust';
export const DUST_PER_CARD = 10;
export function getDust(kv: KV = defaultKV()): number {
  const n = Number(kv.getItem(DUST_KEY) ?? '0');
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
export function addDust(amount: number, kv: KV = defaultKV()): number {
  const next = getDust(kv) + Math.max(0, Math.round(amount));
  kv.setItem(DUST_KEY, String(next));
  return next;
}
// 分解某卡的多余张数（count>1 → 留 1，其余化尘）。返回得尘 + 留存数。
export function disenchant(id: string, kv: KV = defaultKV()): { dust: number; kept: number } {
  const c = getCollection(kv);
  const have = c[id] ?? 0;
  if (have <= 1) return { dust: 0, kept: have };
  const extra = have - 1;
  c[id] = 1;
  kv.setItem(COLL_KEY, JSON.stringify(c));
  const gained = extra * DUST_PER_CARD;
  addDust(gained, kv);
  return { dust: gained, kept: 1 };
}

// 附魔等级（每卡 id → 级 0..3；0普通/1foil/2holo/3polychrome）。生效=assembleDeck 按级放大该卡 CardSpec 数值
// （Balatro modifier；designer #22 spec §五）。等级存平行 map（与 collection count 解耦，等价 {count,enchant}）。
const ENCH_KEY = 'gamef.account.enchant';
export const ENCHANT_MAX = 3;
// 升级成本随当前级翻倍：lv0→1 = 100战功+2尘；1→2 = 200+4；2→3 = 400+8。
export function enchantCost(curLevel: number): { warfunds: number; dust: number } {
  return { warfunds: 100 * 2 ** curLevel, dust: 2 * 2 ** curLevel };
}
export function getEnchantLevels(kv: KV = defaultKV()): Record<string, number> {
  try {
    const o = JSON.parse(kv.getItem(ENCH_KEY) ?? '{}') as Record<string, number>;
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}
// 附魔一张已拥有的卡：扣战功+尘（随级递增）、+1 级（≤MAX3）。返回是否成功 + 新级。
export function enchantCard(id: string, kv: KV = defaultKV()): { ok: boolean; level: number } {
  const lv = getEnchantLevels(kv);
  const cur = lv[id] ?? 0;
  if ((getCollection(kv)[id] ?? 0) <= 0 || cur >= ENCHANT_MAX) return { ok: false, level: cur };
  const c = enchantCost(cur);
  if (getWarfunds(kv) < c.warfunds || getDust(kv) < c.dust) return { ok: false, level: cur };
  spendWarfunds(c.warfunds, kv);
  kv.setItem(DUST_KEY, String(getDust(kv) - c.dust));
  lv[id] = cur + 1;
  kv.setItem(ENCH_KEY, JSON.stringify(lv));
  return { ok: true, level: cur + 1 };
}

// ── 自组牌组（组牌器 designer #19；玩家从收藏拼的卡 id 列表 + 出生势力，持久化）──
export interface CustomDeck { cardIds: string[]; faction: 'shu' | 'wei' | 'wu' }
const CUSTOM_KEY = 'gamef.account.customdeck';
export function getCustomDeck(kv: KV = defaultKV()): CustomDeck | null {
  try {
    const o = JSON.parse(kv.getItem(CUSTOM_KEY) ?? 'null') as CustomDeck | null;
    return o && Array.isArray(o.cardIds) && o.faction ? o : null;
  } catch { return null; }
}
export function saveCustomDeck(d: CustomDeck, kv: KV = defaultKV()): void {
  kv.setItem(CUSTOM_KEY, JSON.stringify(d));
}

// ── 段位 = 难度阀（spec §六；account 层数据 → 难度系数喂蓝图）──
// 单机「名次」退化为胜负：胜 +LP、负 -LP；LP→段位档→太阁难度系数（高段位关卡更凶，spec §六）。
export interface Rank { tier: string; lp: number; difficulty: number }
const LP_KEY = 'gamef.account.lp';
const LP_START = 1000;
// 段位表：LP 阈值 → 段位名 + 太阁难度系数（×太阁 hp）。越高段位岛越凶。
const RANK_TIERS: { min: number; tier: string; difficulty: number }[] = [
  { min: 0, tier: '黑铁', difficulty: 1.0 },
  { min: 800, tier: '白银', difficulty: 1.1 },
  { min: 1200, tier: '黄金', difficulty: 1.25 },
  { min: 1800, tier: '铂金', difficulty: 1.45 },
  { min: 2400, tier: '钻石', difficulty: 1.7 },
];
export function getLP(kv: KV = defaultKV()): number {
  const raw = kv.getItem(LP_KEY);
  if (raw === null) return LP_START;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : LP_START;
}
export function rankFor(lp: number): Rank {
  let t = RANK_TIERS[0];
  for (const x of RANK_TIERS) { if (lp >= x.min) t = x; }
  return { tier: t.tier, lp, difficulty: t.difficulty };
}
// 一局后更新 LP（胜 +25 / 负 -15，钳非负）→ 返回新段位 + 变动。
export function updateLpAfterRun(victory: boolean, kv: KV = defaultKV()): { rank: Rank; delta: number } {
  const delta = victory ? 25 : -15;
  const lp = Math.max(0, getLP(kv) + delta);
  kv.setItem(LP_KEY, String(lp));
  return { rank: rankFor(lp), delta };
}

// ── 赛季轮换骨架（spec §七 安全阀；经济 v1 真缺口，2026-06-17 owner 定）──
// 安全阀=防 LP/进度无限累积：换季软重置 LP 向基线压缩（保 40% 超额）、收藏/战功/附魔留存。
// 牌池格式：标准(当季合法池)/狂野(全收藏)；v1 季1 无轮替出池 → 过滤为恒等，待轮替数据接（per-card season）。
const SEASON_KEY = 'gamef.account.season';
const FORMAT_KEY = 'gamef.account.format';
export type DeckFormat = 'standard' | 'wild';
export function getSeason(kv: KV = defaultKV()): number {
  const n = Number(kv.getItem(SEASON_KEY));
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
export function getFormat(kv: KV = defaultKV()): DeckFormat {
  return kv.getItem(FORMAT_KEY) === 'wild' ? 'wild' : 'standard';
}
export function setFormat(f: DeckFormat, kv: KV = defaultKV()): void {
  kv.setItem(FORMAT_KEY, f);
}
// 换季：season++ + LP 软重置（向 LP_START 压缩，保留 40% 超额；钳非负）。收藏/战功/附魔/自组牌不动。
export function advanceSeason(kv: KV = defaultKV()): { season: number; lpBefore: number; lpAfter: number } {
  const season = getSeason(kv) + 1;
  const lpBefore = getLP(kv);
  const lpAfter = Math.max(0, Math.floor(LP_START + (lpBefore - LP_START) * 0.4));
  kv.setItem(SEASON_KEY, String(season));
  kv.setItem(LP_KEY, String(lpAfter));
  return { season, lpBefore, lpAfter };
}
// 牌池格式过滤（标准=当季合法；狂野=全放行）。v1 无 per-card season → 标准亦全放行（轮替数据到位再收紧）。
export function cardAllowedInFormat(_cardId: string, _format: DeckFormat = getFormat(), _season: number = getSeason()): boolean {
  return true; // 季1 全合法；轮替出池数据接入后按 _format/_season 收紧标准池
}
export function seasonInfo(kv: KV = defaultKV()): { season: number; format: DeckFormat } {
  return { season: getSeason(kv), format: getFormat(kv) };
}

// ── 收藏 + 软币抽卡（spec §二/§五；闭合 earn→spend；account 层、与 ECS 解耦）──
// 收藏=**小丑牌**（deck CardSpec 卡）；rarity 表（designer #18）：钥匙牌(synergy/threshold 定义流派)=传说、
// 经济档=稀有、通用配牌(round-buff/shop-weight)=普通。weight 越低越稀有。
export type Rarity = 'legendary' | 'rare' | 'common';
export interface GachaEntry { id: string; name: string; weight: number; rarity?: Rarity }
export const GACHA_COST = 100;   // 单抽
export const GACHA10_COST = 900; // 十连（9 折）+ 保底 ≥1 稀有
const RARITY_WEIGHT: Record<Rarity, number> = { legendary: 1, rare: 3, common: 6 };
function rarityOf(kind: string): Rarity {
  if (kind === 'synergy-buff' || kind === 'threshold-buff') return 'legendary'; // 钥匙牌=流派定义
  if (kind === 'economy-band') return 'rare';
  return 'common'; // round-buff / shop-weight 通用配牌
}
// 卡池：DECK_REGISTRY 全 deck 的 CardSpec 卡，按 id 去重，按 rarity 定权。
export const GACHA_POOL: GachaEntry[] = (() => {
  const seen = new Set<string>();
  const out: GachaEntry[] = [];
  for (const deck of Object.values(DECK_REGISTRY)) {
    for (const c of deck.cards) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const rarity = rarityOf(c.kind);
      out.push({ id: c.id, name: c.id, weight: RARITY_WEIGHT[rarity], rarity });
    }
  }
  return out;
})();

const COLL_KEY = 'gamef.account.collection';
export function getCollection(kv: KV = defaultKV()): Record<string, number> {
  try {
    const o = JSON.parse(kv.getItem(COLL_KEY) ?? '{}') as Record<string, number>;
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}
function addCard(id: string, kv: KV): void {
  const c = getCollection(kv);
  c[id] = (c[id] ?? 0) + 1;
  kv.setItem(COLL_KEY, JSON.stringify(c));
}
// 直接发卡入收藏（Boss 宝箱分卡 B·slice2 的第二获取源；多人局也喂收藏）。
export function grantCards(ids: string[], kv: KV = defaultKV()): void {
  for (const id of ids) addCard(id, kv);
}

// 概率公示（spec §二「概率公示」铁律）：每张牌的出率（weight / 总权）。
export function gachaRates(pool: GachaEntry[] = GACHA_POOL): { id: string; name: string; rate: number }[] {
  const total = pool.reduce((s, e) => s + e.weight, 0) || 1;
  return pool.map((e) => ({ id: e.id, name: e.name, rate: e.weight / total }));
}

// 加权随机抽一张（不扣费、不入收藏）。rng 注入（测试可定种；账号层非 sim，Math.random 不破确定性）。
function pickOne(pool: GachaEntry[], rng: () => number): GachaEntry {
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = rng() * total;
  for (const e of pool) { if (r < e.weight) return e; r -= e.weight; }
  return pool[pool.length - 1];
}

// 单抽：扣战功 → 加权随机出一张入收藏 → 返回。
export function gachaPull(kv: KV = defaultKV(), rng: () => number = Math.random, pool: GachaEntry[] = GACHA_POOL): { ok: boolean; card?: GachaEntry; balance: number } {
  if (!spendWarfunds(GACHA_COST, kv)) return { ok: false, balance: getWarfunds(kv) };
  const card = pickOne(pool, rng);
  addCard(card.id, kv);
  return { ok: true, card, balance: getWarfunds(kv) };
}

// 十连：扣 GACHA10_COST → 抽 10 张入收藏，**保底**至少 1 张稀有+（无则末位换一张稀有+）。
export function gachaPull10(kv: KV = defaultKV(), rng: () => number = Math.random, pool: GachaEntry[] = GACHA_POOL): { ok: boolean; cards: GachaEntry[]; balance: number } {
  if (!spendWarfunds(GACHA10_COST, kv)) return { ok: false, cards: [], balance: getWarfunds(kv) };
  const cards: GachaEntry[] = [];
  for (let i = 0; i < 10; i++) cards.push(pickOne(pool, rng));
  if (!cards.some((c) => c.rarity && c.rarity !== 'common')) {
    const rares = pool.filter((c) => c.rarity && c.rarity !== 'common');
    if (rares.length) cards[9] = pickOne(rares, rng); // 保底兜底
  }
  for (const c of cards) addCard(c.id, kv);
  return { ok: true, cards, balance: getWarfunds(kv) };
}
