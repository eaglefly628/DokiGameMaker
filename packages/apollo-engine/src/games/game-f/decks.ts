// Game F · 牌组加载器（T2，game-f-core-combat-dev.md「唯一新逻辑」）+ 首发牌组数据（T5）。
// 宪法：游戏=数据。本模块不发明能力——只把「牌组数组」物化成现成 capability 的规则实体
//（group-count / EventWhen / Effect / banded / card-pile 权重），最弱 LLM 也能产出牌组数据。
import type { EntityBlueprint } from '../../assembly/demo.assembly.js';
import { FACT_WEI, FACT_SHU, ASSASSIN, TACTICIAN, BENCH_OCC, ENCHANT_MUL } from './constants.js';
import type { Faction } from './heroes.js';

// 卡牌 = {触发条件, 效果} 算子（D0 核对：Game E joker 架构已全覆盖）。v1 + deck#2 用这四类。
export type CardSpec =
  // 连携/职业 buff：开战锁存「在板某 tag 数」→ 线性写全队伤害系数（hitbox scaleByResource 读 dmg_scale_a）。
  | { kind: 'synergy-buff'; id: string; tagMask: number; perUnit: number }
  // 阈值连携：在板某 tag 数**越阶梯阈值** → 阶梯 banded buff（"够 N 个才质变"，区别于线性 synergy-buff）。
  | { kind: 'threshold-buff'; id: string; tagMask: number; tiers: { at: number; bonus: number }[] }
  // 回合 buff：前 N 回合（round_idx ≤ untilRound）开战额外伤害系数（banded by round）。
  | { kind: 'round-buff'; id: string; untilRound: number; bonus: number }
  // 经济档（屯田/利息）：结算窗按金币阈值阶梯追加金币（攒越多额外利息越高）。banded by gold。
  // 注（PF 回 designer #14）：屯田积粟**已用本类实装**（TUNTIAN_DECK，入 registry、有测）——「利息+」=高 atGold 档、
  // 「基础income+」=atGold:0 档。无需另设第 5 类 `econ-buff`（过度设计）；真要「连胜金」(banded by win_streak)
  // 再把本类 banded 源从写死 gold 泛化成可选 resource 字段即可，不新增 kind。
  | { kind: 'economy-band'; id: string; tiers: { atGold: number; bonus: number }[] }
  // 商店权重：把某些英雄码在牌袋里加权（预配权重，洗入更多某势力）。
  | { kind: 'shop-weight'; id: string; codes: number[]; copies: number }
  // 主动锦囊（P1 QTE 参与感）：局内可点手牌，每回合 charges 次。buff=系数类(craft 改资源)；fxTemplate=点地/范围效果(caster)。
  // buffTarget：buff 写入的资源（缺省 dmg_scale_a=我方攻；空城计写 dmg_scale_b 负值=敌伤减，防守版鼓舞）。
  | { kind: 'jinnang'; id: string; name: string; charges: number; buff?: number; buffTarget?: string; fxTemplate?: string; target?: 'pointer' | 'enemies' | 'self' };

export interface Deck {
  id: string;
  name: string;
  faction: Faction; // 出生倾向（轻风味）；深度在卡，不在势力
  cards: CardSpec[];
}

// 首发牌组「虎豹铁骑」(魏·速攻 Aggro)：deck-spec §1，全 ✅复用、零缺口依赖——验证闭环的最简基线。
export const HUBAO_DECK: Deck = {
  id: 'hubao',
  name: '虎豹铁骑',
  faction: 'wei',
  cards: [
    // 虎豹骑令 ⭐：每有 1 魏（骑）·全队 +攻。「魏骑」v1 简化=在板魏势力单位（骑兵职业位待 roster 扩充再细分）。
    { kind: 'synergy-buff', id: 'hubao_edict', tagMask: BENCH_OCC | FACT_WEI, perUnit: 0.06 },
    // 速攻令：前 3 回合伤害 +15%（序盘压制）。
    { kind: 'round-buff', id: 'blitz', untilRound: 3, bonus: 0.15 },
    // 募兵：商店魏国权重 +（魏码各多 2 张洗入牌袋）。
    { kind: 'shop-weight', id: 'levy', codes: [1, 2, 3, 4, 5, 6], copies: 2 },
    // 鼓舞（主动锦囊 P1）：战中点一下，全队 +20% 攻；每回合 1 次。
    { kind: 'jinnang', id: 'guwu', name: '鼓舞', charges: 1, buff: 0.2 },
    // 火烧连营（点地锦囊 P1.5）：点棋盘一块 → 范围 DoT 灼烧太阁；每回合 1 次。
    { kind: 'jinnang', id: 'huoshao', name: '火烧连营', charges: 1, fxTemplate: 'jinnang_huoshao', target: 'pointer' },
  ],
};

// 牌组 #2「兴复汉室」(蜀·连携)：deck-spec #2 现实修正（roster 无刘备 → 五虎/全蜀 conn"越多越强、满编质变"）。
// 与「虎豹铁骑」(魏·速攻) 对称——一势力一起手组。验证 threshold-buff 范式（阈值台阶，非线性）。
export const HANSHI_DECK: Deck = {
  id: 'hanshi',
  name: '兴复汉室',
  faction: 'shu',
  cards: [
    // 桃园誓 ⭐：在板蜀 ≥3 → +20%；≥5（满编）→ 再 +25%（兴复质变）。banded 阶梯，开战锁存。
    { kind: 'threshold-buff', id: 'taoyuan', tagMask: BENCH_OCC | FACT_SHU, tiers: [{ at: 3, bonus: 0.20 }, { at: 5, bonus: 0.25 }] },
    // 章武：前 3 回合伤害 +12%（序盘不被速攻压死）。
    { kind: 'round-buff', id: 'zhangwu', untilRound: 3, bonus: 0.12 },
    // 募贤：商店蜀码加权（蜀将各多 2 张洗入牌袋）。
    { kind: 'shop-weight', id: 'muxian', codes: [1, 2, 3, 4, 5, 6], copies: 2 },
    // 万箭齐发（点地锦囊 P1.5，爆发）：点棋盘一块 → 范围一击真伤太阁；每回合 1 次。
    { kind: 'jinnang', id: 'wanjian', name: '万箭齐发', charges: 1, fxTemplate: 'jinnang_wanjian', target: 'pointer' },
    // 妙手回春（点地锦囊 P1.5，治疗）：点棋盘一块 → 范围给友军回血（hitbox 负伤=回血、targetMask 我方）；每回合 1 次。
    { kind: 'jinnang', id: 'huichun', name: '妙手回春', charges: 1, fxTemplate: 'jinnang_huichun', target: 'pointer' },
    // 疑兵增援（自施锦囊，召援）：点一下 → 召 2 名友军杂兵(TEAM_A)落玩家半场参战；每回合 1 次。
    { kind: 'jinnang', id: 'yibing', name: '疑兵增援', charges: 1, fxTemplate: 'jinnang_yibing', target: 'self' },
  ],
};

// 牌组 #3「白衣渡江」(吴·刺客斩首)：game-f-wu-faction-seed.md §二。场上刺客越多越强；斩杀走 F-061 职业 trait（已 done）。
// 待命：依赖吴 faction（已落 WU_ROSTER）+ 3-faction plumbing（多人重构）。plumbing 到位前**不入 DECK_REGISTRY**（不可选、不会被错误构建）。
export const BAIYI_DECK: Deck = {
  id: 'baiyi',
  name: '白衣渡江',
  faction: 'wu',
  cards: [
    // 白衣 ⭐：在板刺客 ≥2 → +18%；≥4（成军）→ 再 +22%。斩杀=刺客职业 trait（F-061）。
    { kind: 'threshold-buff', id: 'baiyi', tagMask: BENCH_OCC | ASSASSIN, tiers: [{ at: 2, bonus: 0.18 }, { at: 4, bonus: 0.22 }] },
    { kind: 'round-buff', id: 'jinfan', untilRound: 3, bonus: 0.12 }, // 锦帆：序盘压制
    { kind: 'shop-weight', id: 'muci', codes: [1, 2, 3, 4, 5, 6], copies: 3 }, // 募刺：吴刺客加权（码待 3-faction codesFor 定）
  ],
};

// 牌组 #9「屯田积粟」(经济·Greed)：deck-spec §9。攒利息滚经济，后期接管。魏·曹屯田 lore；现成 banded（新 economy-band 卡类）。
export const TUNTIAN_DECK: Deck = {
  id: 'tuntian',
  name: '屯田积粟',
  faction: 'wei',
  cards: [
    // 屯田 ⭐：金币越多额外利息越高（攒钱滚雪球；利息上限翻倍语义）。
    { kind: 'economy-band', id: 'tuntian', tiers: [{ atGold: 20, bonus: 1 }, { atGold: 40, bonus: 2 }, { atGold: 60, bonus: 3 }] },
    // 重农：每回合结算基础额外金（稳态经济）。
    { kind: 'economy-band', id: 'zhongnong', tiers: [{ atGold: 0, bonus: 1 }] },
    // 募农：商店权重（攒钱期也能补人）。
    { kind: 'shop-weight', id: 'munong', codes: [1, 2, 3, 4, 5, 6], copies: 1 },
  ],
};

// 牌组 #4「卧龙八阵」(蜀·谋士控制)：designer #10 派单。谋士越多越强（threshold-buff TACTICIAN）；
// 八阵图(冻)走武将大招既有 ult（诸葛 ultFreeze 已接），牌组只管 synergy buff。全现有 CardSpec kind、零引擎。
export const WOLONG_DECK: Deck = {
  id: 'wolong',
  name: '卧龙八阵',
  faction: 'shu',
  cards: [
    // 八阵 ⭐：在板谋士 ≥2 → +15%；≥3 → 再 +20%（谋士堆叠质变）。
    { kind: 'threshold-buff', id: 'bazhen', tagMask: BENCH_OCC | TACTICIAN, tiers: [{ at: 2, bonus: 0.15 }, { at: 3, bonus: 0.20 }] },
    // 卧龙：前 3 回合伤害 +10%（运筹序盘）。
    { kind: 'round-buff', id: 'wolong', untilRound: 3, bonus: 0.10 },
    // 奇谋：商店加权诸葛亮（谋士码 3），多洗入便于成阵。
    { kind: 'shop-weight', id: 'qimou', codes: [3], copies: 2 },
    // 定身（点地锦囊 P1.5，控制流）：点棋盘一块 → 范围 FROZEN 定住太阁；每回合 1 次。
    //（即 catalog「铁索连环」同款 AoE FROZEN——同一数据形，不另设重复卡。）
    { kind: 'jinnang', id: 'dingshen', name: '定身', charges: 1, fxTemplate: 'jinnang_dingshen', target: 'pointer' },
    // 空城计（自施锦囊 P1.5，防守版鼓舞）：点一下 → 本回合敌伤 -20%（craft 扣充能 → dmg_scale_b 负值，prep 复位）；每回合 1 次。
    { kind: 'jinnang', id: 'kongcheng', name: '空城计', charges: 1, buff: -0.2, buffTarget: 'dmg_scale_b' },
  ],
};

// 牌组登记表（id → 真实 Deck）：大厅选牌组 → 取真组交引擎。未实装的展示牌组回退首发组。
// 白衣渡江（吴）：owner 2026-06-15 拍板「启用单机吴」→ 入表（rosterFor('wu') plumbing 已就绪；
// 三人同场孙刘曹仍随多人）。
export const DECK_REGISTRY: Record<string, Deck> = {
  hubao: HUBAO_DECK,
  hanshi: HANSHI_DECK,
  wolong: WOLONG_DECK,
  baiyi: BAIYI_DECK,
  tuntian: TUNTIAN_DECK,
};

export interface DeckRules {
  entities: Record<string, EntityBlueprint>;
  shopBias: { codes: number[]; copies: number }[];
}

// 物化：deck → 规则实体（合并进 world 蓝图）+ 商店牌袋偏置。
// 沿用蜀魂 bond 成熟模式（blueprint.ts §羁绊）：GroupCount→count 资源；开战 edge 锁存 → Effect 写 dmg_scale_a。
// dmg_scale_a 已由 prep 进入时复位为 1（round_ui prep onEnter），故此处只加锁存、不管复位（同蜀魂纪律）。
export function buildDeckRules(deck: Deck): DeckRules {
  const ents: Record<string, EntityBlueprint> = {};
  const shopBias: { codes: number[]; copies: number }[] = [];
  const combat = { kind: 'state', fsmId: 'round_ui', equals: 'combat' };
  // 附魔不在此（旧全局法已撤）：改由 assembleDeck 把附魔级烘进各卡 CardSpec 数值（Balatro modifier，designer #22）。
  for (const card of deck.cards) {
    if (card.kind === 'synergy-buff') {
      const cr = `deck_count_${card.id}`;
      ents[`gc_${card.id}`] = { GroupCount: { countResource: cr, requiredTag: card.tagMask, onBoard: true } };
      ents[`r_${cr}`] = { Resource: { id: cr, current: 0, min: 0, max: 99 } };
      ents[`when_${card.id}`] = { EventWhen: { signal: card.id, when: combat, mode: 'edge', armed: false } };
      // 线性：dmg_scale_a += count × perUnit，开战拍施加一次（封顶靠 dmg_scale_a 资源 max）。
      ents[`eff_${card.id}`] = { Effect: { onSignal: card.id, kind: 'modify-resource', targetId: 'dmg_scale_a', op: 'add', value: 0, valueFrom: { resourceId: cr, coeff: card.perUnit } } };
    } else if (card.kind === 'threshold-buff') {
      // 阈值连携：count = 在板某 tag 数；每档 banded（开战 ∧ count ≥ at → dmg_scale_a += bonus）。
      // = synergy-buff 的计数 + round-buff 的 banded 阈值拼装，零引擎改动。
      const cr = `deck_count_${card.id}`;
      ents[`gc_${card.id}`] = { GroupCount: { countResource: cr, requiredTag: card.tagMask, onBoard: true } };
      ents[`r_${cr}`] = { Resource: { id: cr, current: 0, min: 0, max: 99 } };
      card.tiers.forEach((t, k) => {
        const sig = `${card.id}_t${k}`;
        ents[`when_${sig}`] = { EventWhen: { signal: sig, when: { kind: 'and', of: [combat, { kind: 'resource', id: cr, cmp: 'gte', value: t.at }] }, mode: 'edge', armed: false } };
        ents[`eff_${sig}`] = { Effect: { onSignal: sig, kind: 'modify-resource', targetId: 'dmg_scale_a', op: 'add', value: t.bonus } };
      });
    } else if (card.kind === 'economy-band') {
      // 经济档：结算窗（income_armed）∧ 金币≥atGold → 追加金币（攒钱滚利息）。atGold=0=每结算拍恒发。
      card.tiers.forEach((t, k) => {
        const sig = `${card.id}_e${k}`;
        const when = t.atGold > 0
          ? { kind: 'and', of: [{ kind: 'flag', id: 'income_armed', equals: true }, { kind: 'resource', id: 'gold', cmp: 'gte', value: t.atGold }] }
          : { kind: 'flag', id: 'income_armed', equals: true };
        ents[`when_${sig}`] = { EventWhen: { signal: sig, when, mode: 'edge', armed: false } };
        ents[`eff_${sig}`] = { Effect: { onSignal: sig, kind: 'modify-resource', targetId: 'gold', op: 'add', value: t.bonus } };
      });
    } else if (card.kind === 'round-buff') {
      // banded：开战 ∧ round_idx ≤ untilRound → dmg_scale_a += bonus（前 N 回合压制）。
      ents[`when_${card.id}`] = { EventWhen: { signal: card.id, when: { kind: 'and', of: [combat, { kind: 'resource', id: 'round_idx', cmp: 'lte', value: card.untilRound }] }, mode: 'edge', armed: false } };
      ents[`eff_${card.id}`] = { Effect: { onSignal: card.id, kind: 'modify-resource', targetId: 'dmg_scale_a', op: 'add', value: card.bonus } };
    } else if (card.kind === 'jinnang') {
      // 主动锦囊（P1，designer #31）：局内可点手牌——充能资源 + 回合刷新 + keybind(按钮→信号) + craft 原子扣充能施放。
      // 鼓舞类(buff)=craft 充能→dmg_scale_a；点地类(fxTemplate at:pointer)走 caster（后续片接交互）。零引擎（全现成算子）。
      ents[`r_charge_${card.id}`] = { Resource: { id: `charge_${card.id}`, current: card.charges, min: 0, max: card.charges } };
      ents[`kb_cast_${card.id}`] = { KeyBinding: { key: `cast_${card.id}`, signal: `cast_${card.id}`, phase: 'action' } };
      ents[`when_jref_${card.id}`] = { EventWhen: { signal: `jref_${card.id}`, when: { kind: 'state', fsmId: 'round_ui', equals: 'prep' }, mode: 'edge', armed: false } };
      ents[`eff_jref_${card.id}`] = { Effect: { onSignal: `jref_${card.id}`, kind: 'modify-resource', targetId: `charge_${card.id}`, op: 'set', value: card.charges } };
      if (card.buff !== undefined) {
        ents[`craft_cast_${card.id}`] = { CraftRecipe: { onSignal: `cast_${card.id}`, costs: [{ id: `charge_${card.id}`, amount: 1 }], gains: [{ id: card.buffTarget ?? 'dmg_scale_a', amount: card.buff }] } };
      } else if (card.fxTemplate) {
        ents[`cast_caster_${card.id}`] = { Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, Caster: { onSignal: `cast_${card.id}`, template: card.fxTemplate, at: card.target === 'self' ? 'self' : 'pointer' } };
        ents[`craft_cast_${card.id}`] = { CraftRecipe: { onSignal: `cast_${card.id}`, costs: [{ id: `charge_${card.id}`, amount: 1 }], gains: [] } }; // 仅扣充能（caster 同信号展开 fx）
      }
    } else {
      shopBias.push({ codes: card.codes, copies: card.copies });
    }
  }
  return { entities: ents, shopBias };
}

// 把偏置应用到基础牌袋（追加副本；保持确定性次序——只追加不重排，既有验收断言不动）。
export function applyShopBias(baseDeck: number[], shopBias: { codes: number[]; copies: number }[]): number[] {
  const out = [...baseDeck];
  for (const b of shopBias) for (let i = 0; i < b.copies; i++) out.push(...b.codes);
  return out;
}

// ── 组牌器（designer #19；养成环 build 端：抽小丑牌→收藏→拼牌组→喂局内）──
// 卡目录：DECK_REGISTRY 全 deck 的 CardSpec 卡，按 id 索引（抽到的卡=catalog 里的 id）。
export const CARD_CATALOG: Record<string, CardSpec> = (() => {
  const cat: Record<string, CardSpec> = {};
  for (const deck of Object.values(DECK_REGISTRY)) for (const c of deck.cards) cat[c.id] = c;
  return cat;
})();

// 附魔放大（designer #22）：按 enchant 级把 CardSpec 数值 ×(1 + ENCHANT_MUL×级)；shop-weight 改 copies + 级。
// 深拷贝后改（不污染 CARD_CATALOG）。其余卡原样。= Balatro 数据 modifier，不进 sim、零引擎。
function enchantCardSpec(card: CardSpec, level: number): CardSpec {
  if (level <= 0) return card;
  const mul = 1 + ENCHANT_MUL * level;
  const c = JSON.parse(JSON.stringify(card)) as CardSpec;
  if (c.kind === 'synergy-buff') c.perUnit = +(c.perUnit * mul).toFixed(4);
  else if (c.kind === 'threshold-buff') c.tiers = c.tiers.map((t) => ({ ...t, bonus: +(t.bonus * mul).toFixed(4) }));
  else if (c.kind === 'round-buff') c.bonus = +(c.bonus * mul).toFixed(4);
  else if (c.kind === 'economy-band') c.tiers = c.tiers.map((t) => ({ ...t, bonus: t.bonus + level }));
  else if (c.kind === 'shop-weight') c.copies = c.copies + level;
  return c;
}

// 从一组卡 id 拼出自组牌组（id 来自玩家收藏；catalog 查不到的 id 丢弃）。faction 定出生势力（玩家选）。
// enchants：卡 id→附魔级，烘进各卡 CardSpec 数值。buildDeckRules 接口不变（仍吃 Deck）→ 与 preset 同路进局。
export function assembleDeck(cardIds: string[], faction: Faction, name = '自组牌组', enchants: Record<string, number> = {}): Deck {
  const cards = cardIds
    .map((id) => { const c = CARD_CATALOG[id]; return c ? enchantCardSpec(c, enchants[id] ?? 0) : undefined; })
    .filter((c): c is CardSpec => !!c);
  return { id: 'custom', name, faction, cards };
}
