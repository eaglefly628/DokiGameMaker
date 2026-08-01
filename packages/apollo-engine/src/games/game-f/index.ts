// Game F · 《像素三分天下》自走棋（MVP-0 骨架）。负责人：Programmer F。
// 纯数据装配，零自走棋专属代码：整套战斗由通用能力涌现（= Game D 数据 ×2 队，减玩家操控）：
//   ai-chase = aggro(感知→Relation target) + steering(走位) + motion-apply
//   自动普攻 = loop Timer → event-when(自身唯一 timer 叶子) → caster(at:target) → prefab 展开打击区 → hitbox
//   死亡 = resource → mortal(hp≤0 销毁)；判胜负 = Zone 数某队存活 → present Flag
// 三国感靠命名+势力分色（头顶 Text+Color），美术走 DCSS 换皮（docs/game-design/game-f-art-data.md）。
// 下一轮：蓝条/大招/经济/商店/flow 阶段机；重复棋子+羁绊待 REQ-021/022 接入。
export {
  buildGameFBlueprint,
  gameFEnemyPreview,
  GAME_F_TEMPLATES,
  GAME_F_HERO_IDS,
  TEAM_A,
  TEAM_B,
  SHU_RED,
  WEI_BLUE,
} from './blueprint.js';
export { GAME_F_ASSETS, F_HERO, F_FX_STRIKE } from './assets.js';
// 牌组（T2 加载器 + T5 首发数据）：游戏=数据，卡牌→现成 capability 规则实体。
export { HUBAO_DECK, HANSHI_DECK, BAIYI_DECK, TUNTIAN_DECK, WOLONG_DECK, DECK_REGISTRY, buildDeckRules, applyShopBias } from './decks.js';
export type { Deck, CardSpec, DeckRules } from './decks.js';
export type { Faction } from './heroes.js';
export { WU_ROSTER, rosterFor, codesFor } from './heroes.js'; // 吴刺客核心（待命）+ 阵营名册/英雄码（商店脸图投影用）
