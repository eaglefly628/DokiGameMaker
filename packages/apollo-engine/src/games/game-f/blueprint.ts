import type { WorldBlueprint, EntityBlueprint } from '../../assembly/demo.assembly.js';
import type { PrefabTemplate } from '@engine/protocol/components.js';
import { overlapDetectCapability } from '@skills/atoms/overlap-detect/index.js';
import { destroyCapability } from '@skills/atoms/destroy/index.js';
import { timerCapability } from '@skills/atoms/timer/index.js';
import { resourceCapability } from '@atom-skills/index.js';
import { lifetimeCapability, hierarchyResolveCapability, hierarchyCascadeCapability, motionApplyCapability, tweenCapability } from '@skills/tier1/index.js';
import {
  trayCapability,
  steeringCapability,
  triggerZoneCapability,
  hitboxCapability,
  overTimeCapability,
  mortalCapability,
  eventWhenCapability,
  effectApplyCapability,
  zoneOccupancyCapability,
  gaugeCapability,
  clickableCapability,
  keybindCapability,
  selfRuleCapability,
  cardPileCapability,
  craftRecipeCapability,
  textBindingCapability,
  groupCountCapability,
  cameraFollowCapability,
  gridMoveCapability,
  dragPlaceCapability,
  ZONE_FLAG,
} from '@skills/tier2/index.js';
import { prefabCapability, casterCapability, aggroCapability, flowCapability, mergeRuleCapability } from '@skills/tier3/index.js';
import { F_HERO, F_FX_STRIKE, F_HEX_WARM, F_HEX_COOL, F_PEDESTAL, F_THRONE } from './assets.js';
import { boardEntities, project, offsetToAxial, COLS, ROWS, TILE, ORIGIN_X, ORIGIN_Y, LAYOUT } from './hex.js';
// 拆分（基于完整代码，干净重做）：常量/助手 → constants.ts；英雄名册/阵营/装备 → heroes.ts；
// 关卡/野怪/预布阵 → stages.ts；经济/升星数值 → economy.ts；战斗模板库 → combat.ts。blueprint.ts=门面 + flow 装配。
import {
  TEAM_A, TEAM_B, WARRIOR, TACTICIAN, FACT_SHU, FROZEN,
  PROTAG, LOOT, BAG, EQUIP, RUNE, BENCH_OCC, MARKER_VIS, PROJ, RESULT, BUSHO, BOW,
  HP_SCALE, FONT_DISPLAY, FONT_BODY, xf, sprite, zlift,
} from './constants.js';
import { type Faction, ROSTER, rosterFor, codesFor } from './heroes.js';
import { STAGES, PVE_COMP, gameFEnemyPreview } from './stages.js';
import { unitByCode } from './taikou.js';
import { SHOP_DECK, SELL_PRICE } from './economy.js';
import { slotEntity, templatesFor, GAME_F_TEMPLATES } from './combat.js';
import { type Deck, buildDeckRules, applyShopBias } from './decks.js';
// 向后兼容重导出（index.ts / game-f.test.ts 从 './blueprint.js' 取）。
export { TEAM_A, TEAM_B, SHU_RED, WEI_BLUE, FROZEN } from './constants.js';
export { rosterFor, type Faction } from './heroes.js';
export { gameFEnemyPreview } from './stages.js';
export { GAME_F_TEMPLATES } from './combat.js';

// ═══════════════════════════════════════════════════════════════
//  Game F —— 《像素三分天下》自走棋 MVP-0 骨架 + 多回合循环（REQ-F-032）。**纯数据装配**，零自走棋专属代码。
//  整套战斗循环由通用能力涌现（= Game D 暗黑切片的数据，减去玩家操控、加一支镜像敌队）：
//
//    · 索敌走位 = aggro(Perception→Relation target) + steering(seek) + motion-apply   —— ai-chase（数据）
//    · 普攻     = 自身 loop Timer{id:'atk'} → SelfRule{timer ∧ whenGlobal(in_combat) → spawn strike at:'target'}
//                 （F-9 self 化，REQ-021/035/036；同模板多实例各按自身节拍不串台）      —— 自动普攻（数据）
//    · 结算     = overlap-detect → trigger-zone → hitbox(阵营 targetMask 过滤 + 伤害)
//    · 打击自毁 = Timer{id:'life'} → lifetime → destroy（瞬时 burst，无孤儿）
//    · 死亡     = resource-apply → mortal(hp≤0 销毁自己) → destroy
//    · 判胜负   = Zone{requiredTag:TEAM, count:1} 数某队存活 → 写 present Flag（存活=0 → flag false）
//    · 头顶名字 = Text + 队伍色 Color + Hierarchy 跟随单位（红=我方蜀/蓝=敌方魏；势力色留羁绊期，user 定）
//    · 血条蓝条 = gauge(REQ-F-029)：Resource 比例 → 条实体 Shape.width（PostResolve 终态投影，随走随死全自动）
//    · 控制定身 = 八阵图 Hitbox{setMask:FROZEN,statusDuration} + GridMover.haltStatusMask(REQ-F-030)，到点 over-time 自动解
//    · 回合重置 = 持久槽位 Caster{overrides} 每 prep 重展开复合棋子模板（'@local:' 内部引用，REQ-F-033）
//                 + resolution 'wipe' → destroy-tagged 按阵营清场，级联连名牌/条/sidecar（REQ-F-032）
//
//  普攻链已 self 化（F-9：timer id 共享 'atk' + SelfRule spawn + whenGlobal 阶段门）——重复棋子/三星的
//  **普攻与回蓝**不串台；大招半截（mp_<英雄> 蓝满→放→清）仍全局唯一 id，完整 self 化等 REQ-F-039。零自走棋 system。
//  简化（已知，后续）：① 普攻无距离门（condition 无距离叶子）→ 打击在目标处展开，移动仅表现；
//  ② 经济/商店/多回合循环 = MVP-1（被 REQ-F-032 回合重置阻塞，落地后按 flow-spec §6.2 队列接，见 inbox F-7）。
// ═══════════════════════════════════════════════════════════════

// ── §4.1/§4.2 banded 结算（Game E 已证形态）：armed 旗开窗 → EventWhen(edge) 带条件命中 → Effect 改资源一次。──
// （去腐：band 工厂已展平——调用点直接写字面 when_<sig> EventWhen + eff_<sig> Effect 双实体，见 build 体经济/贡献段。）
// 带宽语义注记：同窗内资源被前一 band 改写后，后续 band 的阈值按"改写后的值"再判；确定性单调、每窗至多一次。
const flagIs = (id: string): Record<string, unknown> => ({ kind: 'flag', id, equals: true });
const resCmp = (id: string, cmp: string, value: number): Record<string, unknown> => ({ kind: 'resource', id, cmp, value });
const and = (...of: Record<string, unknown>[]): Record<string, unknown> => ({ kind: 'and', of });
const or = (...of: Record<string, unknown>[]): Record<string, unknown> => ({ kind: 'or', of });


// 竞技场=棋盘区（7×8 盘 x≈±150 / y≈-155..95；下方托盘/商店带不在内——席上 marker 本就无 TEAM 位，双保险）。
const ARENA = { minX: -170, minY: -165, maxX: 170, maxY: 110 };
// 备战席托盘（用户钦定：下排英雄平台，非六角格；9 槽、可互换、买入自动落座；皮=placeholder 待 UI 资源）。
const TRAY = { originX: -176, originY: 118, gap: 44, capacity: 9 };
// L2 回合流程（flow-spec §3.3 round_flow 原样）：prep⟲combat⟲resolution⟲done 与 L1 round_done 握手。
// 回合重置（REQ-F-032）：prep 臂 deploy_armed → EventWhen(edge) → 'deploy'/'deploy_stage_<N>' → 槽位重展开；
// resolution 臂 wipe_armed → 'wipe' → destroy-tagged 清场。经济/伤害不再写死在 flow：prep 臂 income_armed、
// 败方臂 dmg_armed，由 banded EventWhen→Effect 按 §4.1/§4.2 表结算（见 goldBand/伤害 bands）。
// 尚缺 ready 开战输入（§6.2 P2，输入路由归主程）：prep 暂以 after 40 自动开战，接上后改读 ready Flag。
const makeRoundFlow = (PREP_TICKS: number, RESOLUTION_TICKS: number, CELEBRATE_TICKS: number, enemyDmgBase = 1) => {
  // 开战倒计时（用户第 3 条）：prep 末尾恒有 3 秒读数（玩家档 180 拍；快速档按比例缩、总时长不变=
  // 既有时序断言零漂移）。ready 提前 → 也先进 countdown 数完再打，不许瞬开。
  const CD_TICKS = Math.min(180, Math.max(6, Math.floor(PREP_TICKS / 4)));
  const PREP_SECONDS = Math.max(3, Math.round(PREP_TICKS / 60));
  const TO_COMBAT = [
    { kind: 'set-flag', targetId: 'in_combat', value: true },
    { kind: 'set-flag', targetId: 'in_prep', value: false },
    { kind: 'set-flag', targetId: 'cap_armed', value: true },
    { kind: 'set-flag', targetId: 'deploy_armed', value: true }, // 入战拍臂 deploy：双方棋子此拍从 marker/敌槽成型
    { kind: 'modify-resource', targetId: 'prep_left', op: 'set', value: 0 },
  ];
  return {
  id: 'round',
  current: 'prep',
  entered: false,
  elapsed: 0,
  states: [
    {
      id: 'prep', // 备战：臂收入（§4.1 banded 发钱），复位 wipe/伤害/ready；点「开战」或倒计时耗尽 → 3 秒读数 → 开打
      onEnter: [
        { kind: 'set-state', targetId: 'round_ui', value: 'prep' },
        { kind: 'set-flag', targetId: 'in_combat', value: false },
        { kind: 'set-flag', targetId: 'in_prep', value: true }, // 摆子/整理拖拽相位门（F-18 Draggable.onlyFlag）
        { kind: 'set-flag', targetId: 'ready', value: false }, // 每回合重臂（§3.3 操作表「开战」）
        { kind: 'set-flag', targetId: 'wipe_armed', value: false }, // 复位，下次结算再臂（edge 纪律）
        { kind: 'set-flag', targetId: 'dmg_armed', value: false },
        { kind: 'set-flag', targetId: 'cap_armed', value: false }, // 超员检查窗复位（F-17，入战拍再臂）
        { kind: 'set-flag', targetId: 'deploy_armed', value: false }, // 复位；部署窗在入战拍（REQ-F-049 拖拽即时反馈）
        { kind: 'set-flag', targetId: 'income_armed', value: false }, // 收入窗移到 resolution（结算当面进账=动态过程+TFT 语义）
        { kind: 'set-flag', targetId: 'shop_refresh_armed', value: true }, // → 自动刷新（锁店时门挡，v2 §4.6）
        { kind: 'modify-resource', targetId: 'prep_left', op: 'set', value: PREP_SECONDS }, // 倒计时表归位（OverTime -1/秒，0 钳停）
        { kind: 'modify-resource', targetId: 'xp', op: 'add', value: 2 }, // 每回合自动 +2 XP（§4.3）
        { kind: 'modify-resource', targetId: 'dmg_scale_a', op: 'set', value: 1 }, // 羁绊系数回 1（开战拍重新锁存）
        { kind: 'modify-resource', targetId: 'dmg_scale_b', op: 'set', value: enemyDmgBase }, // 敌方系数回基线（缺省 1；多人按人数 >1 让太阁更凶；信长/毛利/今川 在此之上叠加）
      ],
      transitions: [
        { when: { kind: 'flag', id: 'ready', equals: true }, to: 'countdown' }, // 点「开战」→ 3 秒读数（不瞬开）
        { when: { kind: 'always' }, after: Math.max(1, PREP_TICKS - CD_TICKS), to: 'countdown' }, // 倒计时兜底（总时长 = PREP_TICKS 不变）
      ],
    },
    {
      id: 'countdown', // 开战读数 3-2-1（round_ui 仍 prep：横幅/商店不变，仅 hud_timer 跳数；摆子在读数期仍可调）
      onEnter: [{ kind: 'modify-resource', targetId: 'prep_left', op: 'set', value: 3 }],
      transitions: [{ when: { kind: 'always' }, after: CD_TICKS, to: 'combat', do: TO_COMBAT }],
    },
    {
      id: 'combat', // 战斗：自动互砍 + 蓝满放大招；某队团灭(present flag→false)→结算。胜→连胜+1；败→连胜清零+臂伤害
      onEnter: [{ kind: 'set-state', targetId: 'round_ui', value: 'combat' }],
      transitions: [
        // after 30 = 最短驻留（部署移入战拍后，棋子成型前 present 旗仍是备战期的 false——给 deploy→prefab→zone
        // 链 ~4 拍落定 + 余量；0.5s 玩家不可感知，真团灭以「拍」计照常生效）。
        { when: { kind: 'flag', id: 'team_b_present', equals: false }, after: 30, to: 'celebrate', do: [{ kind: 'set-flag', targetId: 'won', value: true }, { kind: 'modify-resource', targetId: 'win_streak', op: 'add', value: 1 }, { kind: 'modify-resource', targetId: 'lose_streak', op: 'set', value: 0 }] },
        { when: { kind: 'flag', id: 'team_a_present', equals: false }, after: 30, to: 'celebrate', do: [{ kind: 'set-flag', targetId: 'won', value: false }, { kind: 'modify-resource', targetId: 'win_streak', op: 'set', value: 0 }, { kind: 'modify-resource', targetId: 'lose_streak', op: 'add', value: 1 }, { kind: 'set-flag', targetId: 'dmg_armed', value: true }] },
        // 加时强制结束（30s+15s=2700拍，一图流；单人改编=按败方路径结算+连败，准则双伤的单人合理化）
        { when: { kind: 'timer', id: 'combat_clock', cmp: 'gte', value: 2700 }, to: 'celebrate', do: [{ kind: 'set-flag', targetId: 'won', value: false }, { kind: 'modify-resource', targetId: 'win_streak', op: 'set', value: 0 }, { kind: 'modify-resource', targetId: 'lose_streak', op: 'add', value: 1 }, { kind: 'set-flag', targetId: 'dmg_armed', value: true }] },
      ],
    },
    {
      id: 'celebrate', // 庆祝亮相（用户「打完不要瞬间全消失，要有 win 展示」）：幸存棋子留板、胜/败横幅 +
      // 胜方金彩喷洒（ph_win 信号 → 彩点 Caster），停 CELEBRATE_TICKS 再进结算清场。
      onEnter: [{ kind: 'set-state', targetId: 'round_ui', value: 'celebrate' }],
      transitions: [{ when: { kind: 'always' }, after: CELEBRATE_TICKS, to: 'resolution' }],
    },
    {
      id: 'resolution', // 结算：停战 + 清场（wipe→destroy-tagged）；玩家血尽→gameover，否则数拍后进 done 与 L1 握手
      onEnter: [
        { kind: 'set-state', targetId: 'round_ui', value: 'resolution' },
        { kind: 'set-flag', targetId: 'in_combat', value: false },
        // 关部署窗（实测坑）：窗若跨 resolution 活到 advance，stage/round 指针翻转会让 deploy_stage_N 带
        // 在窗内 false→true 误发（清场后多铺一波=双倍敌阵）。窗语义=「恰本场战斗的入战拍」，结算即关。
        { kind: 'set-flag', targetId: 'deploy_armed', value: false },
        { kind: 'set-flag', targetId: 'income_armed', value: true }, // 结算窗发钱（§4.1 收入/利息/连胜带；战果面板看着金币进账）
        { kind: 'set-flag', targetId: 'wipe_armed', value: true }, // → 'wipe'
      ],
      transitions: [
        { when: { kind: 'resource', id: 'player_hp', cmp: 'lte', value: 0 }, to: 'gameover' },
        { when: { kind: 'always' }, after: RESOLUTION_TICKS, to: 'done' },
      ],
    },
    {
      id: 'done', // 通知 L1（round_done=true）；L1 advance 推进指针并复位 round_done → 回 prep 开下一回合
      onEnter: [{ kind: 'set-flag', targetId: 'round_done', value: true }],
      transitions: [{ when: { kind: 'flag', id: 'round_done', equals: false }, to: 'prep' }],
    },
    { id: 'gameover', onEnter: [{ kind: 'set-state', targetId: 'round_ui', value: 'gameover' }, { kind: 'set-flag', targetId: 'run_over', value: true }] },
  ],
  };
};

// L1 局流程（flow-spec §3.2 run_flow 原样）：boot 初始化 → round（等 L2 写 round_done）→ advance 推进
// 关卡指针 → 打穿关卡表胜利 / run_over 败北。round_idx>5 的进位（stage+1、round=1）由 when_stage_up banded 处理。
// 关卡表全 5 阶段（§4.5）→ stage_idx>5 即通关。
const STAGE_COUNT = 5;
const RUN_FLOW = {
  id: 'run',
  current: 'boot',
  entered: false,
  elapsed: 0,
  states: [
    {
      id: 'boot', // 开局初始化（重开局语义：资源/指针归位；与实体初值幂等）
      onEnter: [
        { kind: 'modify-resource', targetId: 'player_hp', op: 'set', value: 100 },
        { kind: 'modify-resource', targetId: 'stage_idx', op: 'set', value: 1 },
        { kind: 'modify-resource', targetId: 'round_idx', op: 'set', value: 1 },
      ],
      transitions: [{ when: { kind: 'always' }, to: 'round' }],
    },
    {
      id: 'round', // 控制权在 L2 round_flow；其打完写 round_done
      onEnter: [{ kind: 'set-flag', targetId: 'round_done', value: false }],
      transitions: [
        { when: { kind: 'flag', id: 'run_over', equals: true }, to: 'defeat' },
        { when: { kind: 'flag', id: 'island_taken', equals: true }, to: 'victory' }, // T4 攻岛进度满=岛陷落（与打穿关卡表并行的通关条件）
        { when: { kind: 'and', of: [{ kind: 'flag', id: 'round_done', equals: true }, { kind: 'resource', id: 'stage_idx', cmp: 'gt', value: STAGE_COUNT }] }, to: 'victory' },
        { when: { kind: 'flag', id: 'round_done', equals: true }, to: 'advance' },
      ],
    },
    {
      id: 'advance', // 推进：round_idx+1（满 5 进位走 banded；进位后的"空阶段巡场回合"≤1 个，victory 检查在下轮 round_done 拍兜住）
      onEnter: [{ kind: 'modify-resource', targetId: 'round_idx', op: 'add', value: 1 }],
      transitions: [{ when: { kind: 'always' }, to: 'round' }],
    },
    { id: 'victory', onEnter: [{ kind: 'set-flag', targetId: 'run_won', value: true }] },
    { id: 'defeat' },
  ],
};

// 节奏档（玩家视角修正：备战 ~30s 给操作时间——准则 §1.2；ready 可跳过；结算 4s 可读）。
// 测试传快速档 {prepTicks:40, resolutionTicks:60} 保持既有时序断言；缺省=玩家档。
export interface GameFPacing { prepTicks?: number; resolutionTicks?: number; celebrateTicks?: number; playerFaction?: Faction; deck?: Deck; difficulty?: number; enemyDmgBase?: number }
export function buildGameFBlueprint(pacing: GameFPacing = {}): WorldBlueprint {
  const DIFFICULTY = pacing.difficulty ?? 1; // 段位难度阀（×太阁 hp；缺省 1 = 默认局，snapshot 不变）
  const PREP_TICKS = pacing.prepTicks ?? 1800; // 30s@60tps
  const RESOLUTION_TICKS = pacing.resolutionTicks ?? 240; // 4s
  const CELEBRATE_TICKS = pacing.celebrateTicks ?? 110; // ~1.8s 战后亮相（横幅+彩点；测试快速档传小值）
  // ── 开局选阵营（REQ-F-061）：按所选阵营生成本局 ROSTER + 派生数据，shadow 模块级默认（玩家=蜀）。──
  // 下面全部局部 const 同名 shadow 模块级，使 500 行 build 体零改动绑定到本局数据；默认蜀=逐字等价旧行为。
  // 牌组（T2/T5）：deck.faction 决定出生势力（玩家未显式指定时）；deck 规则实体 + 商店偏置局末合并。
  const deckRules = pacing.deck ? buildDeckRules(pacing.deck) : null;
  const SHOP_DECK_BIASED = deckRules ? applyShopBias(SHOP_DECK, deckRules.shopBias) : SHOP_DECK;
  const ROSTER = rosterFor(pacing.playerFaction ?? pacing.deck?.faction ?? 'shu');
  const HERO_CODE = codesFor(ROSTER);
  const GAME_F_TEMPLATES = templatesFor(ROSTER);
  const enemyHeroes = ROSTER.filter((h) => h.team === TEAM_B); // 敌阵营 4 将（STAGES ei 解析用）
  const entities: Record<string, EntityBlueprint> = {
    // 技能/打击库（数据，单例）。
    library: { PrefabLibrary: { templates: GAME_F_TEMPLATES, seq: 0 } },
    // 六边形棋盘（56 格，表现层底；金铲铲 7×8 布局，蜀半场暖/魏半场冷）。
    ...boardEntities(F_HEX_WARM, F_HEX_COOL),
    // 棋盘配置单例（喂引擎 grid-move：尺寸 + 投影原点）。
    board: { HexBoard: { cols: COLS, rows: ROWS, tileSize: TILE, originX: ORIGIN_X, originY: ORIGIN_Y, layout: LAYOUT } },
    // 胜负旗标 + 竞技场存活计数 Zone（存活=0 → present flag 落 false；下游接 flow 阶段机，后续）。
    team_a_flag: { Flag: { id: 'team_a_present', active: true } },
    team_b_flag: { Flag: { id: 'team_b_present', active: true } },
    zone_a: { Zone: { outFlag: 'team_a_present', ...ARENA, requiredTag: TEAM_A, count: 1 } },
    zone_b: { Zone: { outFlag: 'team_b_present', ...ARENA, requiredTag: TEAM_B, count: 1 } },
    // —— 金铲铲回合流程（flow）+ 其读写的旗标/资源单例 ——
    flow_ctrl: { GameFlow: makeRoundFlow(PREP_TICKS, RESOLUTION_TICKS, CELEBRATE_TICKS, pacing.enemyDmgBase ?? 1) }, // L2 round_flow（节奏=装配参数 + 敌方伤害基线按人数）
    flow_run: { GameFlow: RUN_FLOW }, // L1 run_flow（§3.2）
    f_in_combat: { Flag: { id: 'in_combat', active: false } },
    f_in_prep: { Flag: { id: 'in_prep', active: false } }, // 备战相位（F-18 拖拽门；flow prep 进出维护）
    f_won: { Flag: { id: 'won', active: false } },
    f_over: { Flag: { id: 'run_over', active: false } },
    f_round_done: { Flag: { id: 'round_done', active: false } }, // L1↔L2 握手
    f_run_won: { Flag: { id: 'run_won', active: false } }, // 打穿关卡表=通关
    r_gold: { Resource: { id: 'gold', current: 5, min: 0, max: 999 } }, // 起手金 5（用户：10 太多）；收入仍在结算后发
    r_player_hp: { Resource: { id: 'player_hp', current: 100, min: 0, max: 100 } }, // §3.1：0..100（旧 20 是 MVP-0 占位）
    r_round_idx: { Resource: { id: 'round_idx', current: 1, min: 0, max: 999 } }, // 回合序号（advance +1，>5 进位）
    r_stage_idx: { Resource: { id: 'stage_idx', current: 1, min: 0, max: 99 } }, // 阶段序号（关卡表指针）
    r_win_streak: { Resource: { id: 'win_streak', current: 0, min: 0, max: 999 } }, // 连胜数（§4.1 连胜金）
    r_lose_streak: { Resource: { id: 'lose_streak', current: 0, min: 0, max: 999 } }, // 连败数（§4.1 连败金，准则 P2 与连胜同形）
    r_xp: { Resource: { id: 'xp', current: 0, min: 0, max: 999 } }, // 经验（每回合 +2；买经验 $4=+4，§4.3）
    r_level: { Resource: { id: 'level', current: 4, min: 1, max: 8 } }, // 等级=人口上限（起始 4=现固定阵容；摆子约束=输入域）
    // —— 回合重置接线（REQ-F-032）：flow 臂旗标 → EventWhen(edge) 产单拍信号 → 槽位展开 / destroy-tagged 清场 ——
    // —— ready 开战（§3.3 操作表，策划批注：输入→信号→set-flag 纯数据）：点按钮 → clickable 产 'ready_btn'
    // 信号 → Effect 置 ready → prep 的 ready 转移提前开战；不点则 40 拍倒计时兜底。按钮无 Tag 不参战不被清场。
    f_ready: { Flag: { id: 'ready', active: false } },
    // 操作按钮全部移入 DOM 壳层（点将台/玩家卡/底部条）；canvas 仅留隐形 clickable 命中靶（移出视口 x2000），
    // 供 DOM 注入世界坐标点击触发既有信号链（ready/reroll/lock/buyxp）。chrome 底盘已撤。
    btn_ready: {
      Transform: xf(300, 180), // 隐形命中靶（DOM 底部「开战」注入 click(2000,180)）
      Shape: { kind: 'box', width: 64, height: 24 },
      Clickable: { action: 'ready_btn' },
      Text: { content: '开战', fontSize: 13, fontFamily: FONT_DISPLAY, anchor: 'center', lineSpacing: 0 },
      Color: { tint: 0xffffff, alpha: 0 },
      Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 30 }, // 只为抬 zOrder（文本模式不绘）
    },
    eff_ready: { Effect: { onSignal: 'ready_btn', kind: 'set-flag', targetId: 'ready', value: true } },
    // —— 去腐：GameShell 按钮的非空间输入桥（keybind）。button{signal:S} → enqueueAction(S) →
    //    InputQueue{key:S,phase:'action'} → 这些 KeyBinding 产 Signal{name:S} → 既有 EventWhen/Effect/craft 链照常消费。
    //    买入信号 buy_slot 不经此（走既有 CardPile play 输入路，避免 cp↔keybind 再加一条 Signal 边）。
    kb_ready_btn: { KeyBinding: { key: 'ready_btn', signal: 'ready_btn', phase: 'action' } },
    kb_buyxp_btn: { KeyBinding: { key: 'buyxp_btn', signal: 'buyxp_btn', phase: 'action' } },
    kb_reroll_btn: { KeyBinding: { key: 'reroll_btn', signal: 'reroll_btn', phase: 'action' } },
    kb_lock_btn: { KeyBinding: { key: 'lock_btn', signal: 'lock_btn', phase: 'action' } },
    kb_unlock_btn: { KeyBinding: { key: 'unlock_btn', signal: 'unlock_btn', phase: 'action' } },
    kb_rune_a: { KeyBinding: { key: 'rune_a', signal: 'rune_a', phase: 'action' } },
    kb_rune_b: { KeyBinding: { key: 'rune_b', signal: 'rune_b', phase: 'action' } },
    kb_rune_c: { KeyBinding: { key: 'rune_c', signal: 'rune_c', phase: 'action' } },
    // —— 开战倒计时（用户第 3 条：按下开战不许瞬开，要数 3-2-1；备战全程也有可见倒计时）——
    // 零引擎件重组：prep_left 资源被 min=0 钳住即自停 → OverTime 永久 -1/秒 = 自终止秒表；
    // flow 各相位 set 30 / 3 / 0（prep 进 / countdown 进 / combat 进）。HUD 数字 TextBinding 实时投影。
    r_prep_left: {
      Resource: { id: 'prep_left', current: 30, min: 0, max: 99 },
      OverTime: { effects: [{ id: 'cd_tick', resource: 'prep_left', amountPerTick: -1, period: 60, duration: 0, elapsed: 0 }] },
    },
    // 老的「开战 NN」canvas 倒计时（屏幕正上方）已删——倒计时移入 DOM 顶栏状态栏（game-f.tsx），prep_left 资源保留供其投影。
    // —— marker 战斗期隐藏（REQ-F-056，消「武将复制、老的没删」幽灵）：开战拍藏全部 marker（seat+★），
    // 备战拍再显。marker 持久（记布阵不删），战斗期它的 Caster 生成会动的战斗棋子 → 不藏就双重显示。
    eff_marker_hide: { Effect: { onSignal: 'ph_combat', kind: 'set-visible-tagged', targetId: '', tagMask: MARKER_VIS, value: false } },
    eff_marker_show: { Effect: { onSignal: 'ph_prep', kind: 'set-visible-tagged', targetId: '', tagMask: MARKER_VIS, value: true } },
    // —— 商店（F-11，REQ-F-040；v2 §4.6 五件套之「买入核心」。刷新/锁店/卖出撞新缺口已提 REQ-F-041）——
    // 买 = 输入 play(槽下标)（点击→play 的指针路由属 launcher 输入域）：playCosts 原子验扣 金3 + 席位1
    // （钱不够/席满=拒单：牌不丢、金不动）→ 成交牌码写 bought_code → 每将 banded 分发 → marker 入备战席。
    shop: {
      // ⚠️ deck 必须取副本：装配是浅拷贝、嵌套数组按引用共享，发牌原地 shift 会跨 Engine/跨测试泄漏（确定性破口，实测踩过）
      // 三大框（用户钦定小丑牌式）：handSize 3；刷新=旧手回袋底（REQ-F-054 卡池守恒，连刷不枯竭）。
      CardPile: { owner: 'shop', deck: [...SHOP_DECK_BIASED], hand: [], handSize: 3, playCosts: [{ id: 'gold', amount: 3 }, { id: 'bench_space', amount: 1 }], playedCodeResource: 'bought_code', refreshOnSignal: 'shop_refresh', returnOnSignal: 'card_sold', returnCodeResource: 'sold_code', handCodeResources: ['shop_slot_1', 'shop_slot_2', 'shop_slot_3'], playOnSignals: ['buy_slot_1', 'buy_slot_2', 'buy_slot_3'] },
      PlayedHand: { owner: 'shop', cards: [] },
      Flag: { id: 'shop', active: false },
    },
    r_bought_code: { Resource: { id: 'bought_code', current: 0, min: 0, max: 9999 } }, // 最近一次成交牌码（0=无）
    // 去腐片3：商店 3 槽脸图 key（GameShell image bind→resolveAsset）。值=英雄资产 key，由表现层每帧据 shop_slot_i 投影。
    // 单人商店、表现投影（不进 tick，确定性测不跑 pump→恒空）；sim 只持 key（纯数据，非 URL）。
    r_shop_face_1: { StringVar: { id: 'shop_face_1', value: '' } },
    r_shop_face_2: { StringVar: { id: 'shop_face_2', value: '' } },
    r_shop_face_3: { StringVar: { id: 'shop_face_3', value: '' } },
    // —— 备战席容量（F-17 改派生）：bench_space = bench_cap − bench_occupied，每拍 level 信号重算 ——
    // 仍作 playCosts 第二货币（席满=0 原子拒单）；marker 增（买）/减（卖/合成 3→1）全自动对账，
    // 手工 ± 漂移（合成回 2 席没人加）从根上消除。playCosts 扣的 1 会被下一拍重算覆盖（≤3 拍自愈，人手速不可感知）。
    r_bench_space: { Resource: { id: 'bench_space', current: 9, min: 0, max: 11 } },
    r_bench_cap: { Resource: { id: 'bench_cap', current: 9, min: 0, max: 11 } }, // 容量（§4.6 席 9；符文「广纳」+2 改这里）
    r_bench_occupied: { Resource: { id: 'bench_occupied', current: 0, min: 0, max: 99 } },
    gc_bench: { GroupCount: { countResource: 'bench_occupied', requiredTag: BENCH_OCC, onBoard: false } }, // **在席**（无 HexPos）marker 数（REQ-F-052 onBoard:false——拖上板即让席，TFT 席/板分账）
    when_bench_sync: { EventWhen: { signal: 'bench_sync', when: resCmp('bench_cap', 'gte', 0), mode: 'level', armed: false } }, // 恒真 level=每拍重算
    eff_bench_set: { Effect: { onSignal: 'bench_sync', kind: 'modify-resource', targetId: 'bench_space', op: 'set', value: 0, valueFrom: { resourceId: 'bench_cap' }, order: 1 } },
    eff_bench_sub: { Effect: { onSignal: 'bench_sync', kind: 'modify-resource', targetId: 'bench_space', op: 'add', value: 0, valueFrom: { resourceId: 'bench_occupied', coeff: -1 }, order: 2 } },
    // —— 商店余三件（F-12，REQ-F-041）：刷新 / 锁店 / 卖出 ——
    // 自动刷新：prep 臂 shop_refresh_armed → EventWhen(¬锁店 门) → 'shop_refresh' → CardPile.refreshOnSignal 弃全手补满；
    // 自动解锁/撤臂 = 门判定脉冲同拍 Commit（见 when_shop_gate 注，躲"解锁先于门判定"与"解锁复燃 edge"双坑）。
    f_shop_refresh_armed: { Flag: { id: 'shop_refresh_armed', active: false } },
    f_shop_locked: { Flag: { id: 'shop_locked', active: false } },
    when_shop_refresh: { EventWhen: { signal: 'shop_refresh', when: and(flagIs('shop_refresh_armed'), { kind: 'not', of: flagIs('shop_locked') }), mode: 'edge', armed: false } },
    // 门判定脉冲（次序坑正解）：armed 升沿当拍先「判」（上行 refresh 门读 Commit 前的 locked 值），同拍 Commit
    // 再「拆」（撤臂+解锁）——armed 一拍即逝，解锁不会让 edge 复燃补刷；锁存活到下个 prep 的门判定拍=恰跳过一次（v2 §4.6）。
    when_shop_gate: { EventWhen: { signal: 'shop_gate_done', when: flagIs('shop_refresh_armed'), mode: 'edge', armed: false } },
    eff_gate_disarm: { Effect: { onSignal: 'shop_gate_done', kind: 'set-flag', targetId: 'shop_refresh_armed', value: false } },
    eff_gate_unlock: { Effect: { onSignal: 'shop_gate_done', kind: 'set-flag', targetId: 'shop_locked', value: false } },
    // —— 买经验/等级（§4.3，MVP-1 尾）：$4=+4XP（craft-recipe 原子）；升级=banded（xp 阈值→level set N，单调不回退）——
    btn_xp: {
      Transform: xf(300, 64),
      Shape: { kind: 'box', width: 40, height: 20 },
      Clickable: { action: 'buyxp_btn' },
      CraftRecipe: { onSignal: 'buyxp_btn', costs: [{ id: 'gold', amount: 4 }], gains: [{ id: 'xp', amount: 4 }] },
      Text: { content: '经验$4', fontSize: 11, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 },
      Color: { tint: 0x6a4a4f, alpha: 0 },
      Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 30 },
    },
    when_lvl_5: { EventWhen: { signal: 'lvl_5', when: resCmp('xp', 'gte', 8), mode: 'edge', armed: false } },
    eff_lvl_5: { Effect: { onSignal: 'lvl_5', kind: 'modify-resource', targetId: 'level', op: 'add', value: 1 } },
    when_lvl_6: { EventWhen: { signal: 'lvl_6', when: resCmp('xp', 'gte', 18), mode: 'edge', armed: false } },
    eff_lvl_6: { Effect: { onSignal: 'lvl_6', kind: 'modify-resource', targetId: 'level', op: 'add', value: 1 } },
    when_lvl_7: { EventWhen: { signal: 'lvl_7', when: resCmp('xp', 'gte', 30), mode: 'edge', armed: false } },
    eff_lvl_7: { Effect: { onSignal: 'lvl_7', kind: 'modify-resource', targetId: 'level', op: 'add', value: 1 } },
    when_lvl_8: { EventWhen: { signal: 'lvl_8', when: resCmp('xp', 'gte', 44), mode: 'edge', armed: false } }, // 阈值下调（用户：买经验/打赢要看得见升级）；+2/回合、买经验$4=+4，edge 单发+1，封顶 8
    eff_lvl_8: { Effect: { onSignal: 'lvl_8', kind: 'modify-resource', targetId: 'level', op: 'add', value: 1 } },
    // 手动刷新（2 金）：按钮信号 → craft-recipe 原子扣 2 金置 reroll_paid → EventWhen(edge) → 'shop_refresh' → 复位。
    // 扣不起=配方整单不动（inbox 提示"扣不起就别发信号"的原子等价实现）；手动刷新不吃锁店门（锁住时也可花钱换牌）。
    btn_reroll: {
      Transform: xf(300, 150),
      Shape: { kind: 'box', width: 56, height: 20 },
      Clickable: { action: 'reroll_btn' },
      CraftRecipe: { onSignal: 'reroll_btn', costs: [{ id: 'gold', amount: 2 }], grantsFlag: 'reroll_paid' },
      Text: { content: '刷新$2', fontSize: 11, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 },
      Color: { tint: 0x6a4a4f, alpha: 0 },
      Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 30 },
    },
    f_reroll_paid: { Flag: { id: 'reroll_paid', active: false } },
    when_reroll: { EventWhen: { signal: 'shop_refresh', when: flagIs('reroll_paid'), mode: 'edge', armed: false } },
    eff_reroll_reset: { Effect: { onSignal: 'shop_refresh', kind: 'set-flag', targetId: 'reroll_paid', value: false } },
    // 锁店/解锁（v2"翻转"用两按钮达成——Effect 无 toggle，零缺口拼法）；每回合 prep→combat 自动解锁。
    btn_lock: {
      Transform: xf(300, 120),
      Shape: { kind: 'box', width: 40, height: 20 },
      Clickable: { action: 'lock_btn' },
      Text: { content: '锁店', fontSize: 11, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 },
      Color: { tint: 0xd8607b, alpha: 0 },
      Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 30 },
    },
    btn_unlock: {
      Transform: xf(300, 92),
      Shape: { kind: 'box', width: 40, height: 20 },
      Clickable: { action: 'unlock_btn' },
      Text: { content: '解锁', fontSize: 11, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 },
      Color: { tint: 0x6a4a4f, alpha: 0 },
      Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 30 },
    },
    eff_lock: { Effect: { onSignal: 'lock_btn', kind: 'set-flag', targetId: 'shop_locked', value: true } },
    eff_unlock: { Effect: { onSignal: 'unlock_btn', kind: 'set-flag', targetId: 'shop_locked', value: false } },
    // 卖出（048② 袋归还版）：点席 → sell_<将>（source=被点席位）→ destroy '@signal-source' + 金2 + 席+1
    // + sold_code=码 → sold_code>0 边沿 → 'card_sold' → CardPile.returnOnSignal 袋底归还（引擎自清 sold_code）。
    r_sold_code: { Resource: { id: 'sold_code', current: 0, min: 0, max: 9999 } },
    when_sold: { EventWhen: { signal: 'card_sold', when: resCmp('sold_code', 'gt', 0), mode: 'edge', armed: false } },
    // 商店在售（F-14/REQ-F-042）：CardPile.handCodeResources 镜像 shop_slot_1..3 终态码 → GameShell 商店面板按码取脸图（shop_face StringVar）。
    // 旧 canvas 卡面/两段脉冲（destroy-tagged 重铺）已退役：壳层 image 直读镜像，无需引擎侧脉冲重绘。
    // —— 相位横幅（F-15 配套）：round_ui 状态镜像 → state 叶 edge → set-visible 三选一；胜/败终幕横幅走旗标。——
    f_round_state: { State: { fsmId: 'round_ui', current: 'prep' } },
    banner_prep: {
      Transform: xf(0, -186),
      Text: { content: '备 战 —— 买人/刷新/锁店，点「开战」或等倒计时', fontSize: 15, fontFamily: FONT_DISPLAY, anchor: 'center', lineSpacing: 0 },
      Color: { tint: 0xcf9a3f, alpha: 1 },
      Visibility: { visible: true },
      Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 31 },
    },
    banner_combat: {
      Transform: xf(0, -186),
      Text: { content: '战 斗 中', fontSize: 16, fontFamily: FONT_DISPLAY, anchor: 'center', lineSpacing: 0 },
      Color: { tint: 0xd8607b, alpha: 1 },
      Visibility: { visible: false },
      Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 31 },
    },
    banner_resolution: {
      Transform: xf(0, -186),
      Text: { content: '回 合 结 算', fontSize: 15, fontFamily: FONT_DISPLAY, anchor: 'center', lineSpacing: 0 },
      Color: { tint: 0x8aa0e6, alpha: 1 },
      Visibility: { visible: false },
      Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 31 },
    },
    banner_gameover: {
      Transform: xf(0, -60),
      Text: { content: '败 局 —— 玩家血量耗尽', fontSize: 22, fontFamily: FONT_DISPLAY, anchor: 'center', lineSpacing: 0 },
      Color: { tint: 0xd65668, alpha: 1 },
      Visibility: { visible: false },
      Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 32 },
    },
    banner_victory: {
      Transform: xf(0, -60),
      Text: { content: '通 关 —— 打穿关卡表！', fontSize: 22, fontFamily: FONT_DISPLAY, anchor: 'center', lineSpacing: 0 },
      Color: { tint: 0x54ad8e, alpha: 1 },
      Visibility: { visible: false },
      Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 32 },
    },
    banner_win: {
      Transform: xf(0, -60),
      Text: { content: '🎉 胜 利 ！', fontSize: 26, fontFamily: FONT_DISPLAY, anchor: 'center', lineSpacing: 0 },
      Color: { tint: 0xcf9a3f, alpha: 1 },
      Visibility: { visible: false },
      Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 32 },
    },
    banner_lose: {
      Transform: xf(0, -60),
      Text: { content: '败 阵 …', fontSize: 22, fontFamily: FONT_DISPLAY, anchor: 'center', lineSpacing: 0 },
      Color: { tint: 0xd65668, alpha: 1 },
      Visibility: { visible: false },
      Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 32 },
    },
    // —— 垃圾桶（REQ-F-058，用户「不想要的英雄扔垃圾桶」）：拖 marker 进桶=卖出（DropZone 代点其
    // sell 动作，任何相位可卖）；指针点选卖出停用（click_sell_off 恒假——「点谁谁消失」陷阱已除）。——
    f_click_sell_off: { Flag: { id: 'click_sell_off', active: false } }, // 恒假：点选卖出永闭
    // 备战台两侧各一个小垃圾桶（用户：左右各放一个、小一点）；任一 DropZone 落子=卖出（hitDropZone 通配）。
    trash_bin_edge: { Transform: xf(200, 118), Shape: { kind: 'box', width: 36, height: 36 }, Color: { tint: 0xd65668, alpha: 1 }, Sprite: zlift(18.5) },
    trash_bin_bg: { Transform: xf(200, 118), Shape: { kind: 'box', width: 32, height: 32 }, Color: { tint: 0xfbeee4, alpha: 1 }, Sprite: zlift(18.6) },
    trash_bin: {
      Transform: xf(200, 118),
      Shape: { kind: 'box', width: 30, height: 30 },
      DropZone: {},
      Text: { content: '🗑', fontSize: 17, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 },
      Color: { tint: 0xd65668, alpha: 0.95 },
      Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 27 },
    },
    trash_bin_l_edge: { Transform: xf(-200, 118), Shape: { kind: 'box', width: 36, height: 36 }, Color: { tint: 0xd65668, alpha: 1 }, Sprite: zlift(18.5) },
    trash_bin_l_bg: { Transform: xf(-200, 118), Shape: { kind: 'box', width: 32, height: 32 }, Color: { tint: 0xfbeee4, alpha: 1 }, Sprite: zlift(18.6) },
    trash_bin_l: {
      Transform: xf(-200, 118),
      Shape: { kind: 'box', width: 30, height: 30 },
      DropZone: {},
      Text: { content: '🗑', fontSize: 17, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 },
      Color: { tint: 0xd65668, alpha: 0.95 },
      Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 27 },
    },
    // —— 战后清扫（用户「死亡时机/残留一坨」）：庆祝拍清在飞弹道——战斗已分胜负，不许补刀/暴毙。——
    eff_projsweep_w: { Effect: { onSignal: 'ph_win', kind: 'destroy-tagged', targetId: '', value: PROJ } },
    eff_projsweep_l: { Effect: { onSignal: 'ph_lose', kind: 'destroy-tagged', targetId: '', value: PROJ } },
    // —— 战果面板（用户「结算要动态过程，把成绩列出来」）：庆祝/结算期右侧逐行淡入战果，金币/连胜/血量
    // 数字 TextBinding 实时跳动（收入窗已移至 resolution=进账当面发生）；下个 prep 整组收走。——
    rescast_w: { Transform: xf(210, -26), Caster: { onSignal: 'ph_win', template: 'result_win', at: 'self' } },
    rescast_l: { Transform: xf(210, -26), Caster: { onSignal: 'ph_lose', template: 'result_lose', at: 'self' } },
    eff_result_sweep: { Effect: { onSignal: 'ph_prep', kind: 'destroy-tagged', targetId: '', value: RESULT } },
    // 庆祝相位带（celebrate 进场拍按胜负分流一次）：横幅三选一 + 胜方金彩喷洒（3 个 Caster 同信号齐喷）。
    when_ph_win: { EventWhen: { signal: 'ph_win', when: and({ kind: 'state', fsmId: 'round_ui', equals: 'celebrate' }, flagIs('won')), mode: 'edge', armed: false } },
    when_ph_lose: { EventWhen: { signal: 'ph_lose', when: and({ kind: 'state', fsmId: 'round_ui', equals: 'celebrate' }, { kind: 'not', of: flagIs('won') }), mode: 'edge', armed: false } },
    burst_l: { Transform: xf(-70, -50), Caster: { onSignal: 'ph_win', template: 'win_burst', at: 'self' } },
    burst_m: { Transform: xf(0, -80), Caster: { onSignal: 'ph_win', template: 'win_burst', at: 'self' } },
    burst_r: { Transform: xf(70, -50), Caster: { onSignal: 'ph_win', template: 'win_burst', at: 'self' } },
    when_ph_prep: { EventWhen: { signal: 'ph_prep', when: { kind: 'state', fsmId: 'round_ui', equals: 'prep' }, mode: 'edge', armed: false } },
    when_ph_combat: { EventWhen: { signal: 'ph_combat', when: { kind: 'state', fsmId: 'round_ui', equals: 'combat' }, mode: 'edge', armed: false } },
    when_ph_res: { EventWhen: { signal: 'ph_res', when: { kind: 'state', fsmId: 'round_ui', equals: 'resolution' }, mode: 'edge', armed: false } },
    when_ph_over: { EventWhen: { signal: 'ph_over', when: flagIs('run_over'), mode: 'edge', armed: false } },
    when_ph_won: { EventWhen: { signal: 'ph_won', when: flagIs('run_won'), mode: 'edge', armed: false } },
    // 横幅相位显隐（去腐：原 visSwap 生成器展平为字面 set-visible 效果，逐字等价）。
    eff_ph_prep_show: { Effect: { onSignal: 'ph_prep', kind: 'set-visible', targetId: '', targetEntity: 'banner_prep', value: true } },
    eff_ph_prep_hide0: { Effect: { onSignal: 'ph_prep', kind: 'set-visible', targetId: '', targetEntity: 'banner_combat', value: false } },
    eff_ph_prep_hide1: { Effect: { onSignal: 'ph_prep', kind: 'set-visible', targetId: '', targetEntity: 'banner_resolution', value: false } },
    eff_ph_prep_hide2: { Effect: { onSignal: 'ph_prep', kind: 'set-visible', targetId: '', targetEntity: 'banner_win', value: false } },
    eff_ph_prep_hide3: { Effect: { onSignal: 'ph_prep', kind: 'set-visible', targetId: '', targetEntity: 'banner_lose', value: false } },
    eff_ph_combat_show: { Effect: { onSignal: 'ph_combat', kind: 'set-visible', targetId: '', targetEntity: 'banner_combat', value: true } },
    eff_ph_combat_hide0: { Effect: { onSignal: 'ph_combat', kind: 'set-visible', targetId: '', targetEntity: 'banner_prep', value: false } },
    eff_ph_combat_hide1: { Effect: { onSignal: 'ph_combat', kind: 'set-visible', targetId: '', targetEntity: 'banner_resolution', value: false } },
    eff_ph_res_show: { Effect: { onSignal: 'ph_res', kind: 'set-visible', targetId: '', targetEntity: 'banner_resolution', value: true } },
    eff_ph_res_hide0: { Effect: { onSignal: 'ph_res', kind: 'set-visible', targetId: '', targetEntity: 'banner_prep', value: false } },
    eff_ph_res_hide1: { Effect: { onSignal: 'ph_res', kind: 'set-visible', targetId: '', targetEntity: 'banner_combat', value: false } },
    eff_ph_res_hide2: { Effect: { onSignal: 'ph_res', kind: 'set-visible', targetId: '', targetEntity: 'banner_win', value: false } },
    eff_ph_res_hide3: { Effect: { onSignal: 'ph_res', kind: 'set-visible', targetId: '', targetEntity: 'banner_lose', value: false } },
    eff_ph_win_show: { Effect: { onSignal: 'ph_win', kind: 'set-visible', targetId: '', targetEntity: 'banner_win', value: true } },
    eff_ph_win_hide0: { Effect: { onSignal: 'ph_win', kind: 'set-visible', targetId: '', targetEntity: 'banner_combat', value: false } },
    eff_ph_lose_show: { Effect: { onSignal: 'ph_lose', kind: 'set-visible', targetId: '', targetEntity: 'banner_lose', value: true } },
    eff_ph_lose_hide0: { Effect: { onSignal: 'ph_lose', kind: 'set-visible', targetId: '', targetEntity: 'banner_combat', value: false } },
    eff_ph_over_show: { Effect: { onSignal: 'ph_over', kind: 'set-visible', targetId: '', targetEntity: 'banner_gameover', value: true } },
    eff_ph_won_show: { Effect: { onSignal: 'ph_won', kind: 'set-visible', targetId: '', targetEntity: 'banner_victory', value: true } },
    // —— HUD 数字：金币/血/等级/经验/阶段/回合/空席已移入 DOM 壳层（game-f.tsx 左下/右下玩家卡 + 顶栏），
    //    canvas 不再画左上角文本（去重，消「左上角八角字块」观感）。——
    f_deploy_armed: { Flag: { id: 'deploy_armed', active: false } },
    f_wipe_armed: { Flag: { id: 'wipe_armed', active: false } },
    f_income_armed: { Flag: { id: 'income_armed', active: false } }, // §4.1 结算窗
    f_dmg_armed: { Flag: { id: 'dmg_armed', active: false } }, // §4.2 败方结算窗
    // 我方部署带：入战拍窗（deploy_armed 于 prep→combat 臂）→ 'deploy' → 全部在板 marker 的 Caster
    // （requireHexPos 门：在席不响应）各自出兵。窗内无其它条件叶 → edge 一窗一发，无复燃面。
    when_deploy: { EventWhen: { signal: 'deploy', when: flagIs('deploy_armed'), mode: 'edge', armed: false } },
    // —— 超员自动卖（F-17/REQ-F-048①）：入战拍 destroy-tagged 保额——保最早入场的 level 个我方（挂件级联）。
    // 棋子在部署后 ~3 拍才成型 → 检查带以 count_team_a≥1 为门（部署落地才查，不空放）；拖拽限额已在执行点
    // 强制 ≤level，此带=纵深保险丝（level 中途掉档/未来多源入场仍兜得住）。
    f_cap_armed: { Flag: { id: 'cap_armed', active: false } },
    r_count_team_a: { Resource: { id: 'count_team_a', current: 0, min: 0, max: 99 } },
    gc_team_a: { GroupCount: { countResource: 'count_team_a', requiredTag: TEAM_A } }, // 我方在场棋子数（§4.2 真值伤害将来同源）
    when_cap: { EventWhen: { signal: 'enforce_cap', when: and(flagIs('cap_armed'), resCmp('count_team_a', 'gte', 1)), mode: 'edge', armed: false } },
    eff_cap: { Effect: { onSignal: 'enforce_cap', kind: 'destroy-tagged', targetId: '', value: TEAM_A, keepResource: 'level' } },
    when_deploy_stage2: { EventWhen: { signal: 'deploy_stage_2', when: and(flagIs('deploy_armed'), resCmp('stage_idx', 'eq', 2), resCmp('round_idx', 'lte', 4)), mode: 'edge', armed: false } }, // 普通回合=各阶段 r1-4（r5 野怪）
    when_deploy_stage3: { EventWhen: { signal: 'deploy_stage_3', when: and(flagIs('deploy_armed'), resCmp('stage_idx', 'eq', 3), resCmp('round_idx', 'lte', 4)), mode: 'edge', armed: false } }, // 普通回合=各阶段 r1-4（r5 野怪）
    when_deploy_stage4: { EventWhen: { signal: 'deploy_stage_4', when: and(flagIs('deploy_armed'), resCmp('stage_idx', 'eq', 4), resCmp('round_idx', 'lte', 4)), mode: 'edge', armed: false } }, // 普通回合=各阶段 r1-4（r5 野怪）
    when_deploy_stage5: { EventWhen: { signal: 'deploy_stage_5', when: and(flagIs('deploy_armed'), resCmp('stage_idx', 'eq', 5), resCmp('round_idx', 'lte', 4)), mode: 'edge', armed: false } }, // 普通回合=各阶段 r1-4（r5 野怪）
    // —— 野怪回合分流（一图流：阶段1 全部 + 各阶段 r5）——
    when_deploy_pve1: { EventWhen: { signal: 'deploy_pve_1', when: and(flagIs('deploy_armed'), resCmp('stage_idx', 'eq', 1)), mode: 'edge', armed: false } },
    when_deploy_pve2: { EventWhen: { signal: 'deploy_pve_2', when: and(flagIs('deploy_armed'), resCmp('stage_idx', 'eq', 2), resCmp('round_idx', 'gte', 5)), mode: 'edge', armed: false } },
    when_deploy_pve3: { EventWhen: { signal: 'deploy_pve_3', when: and(flagIs('deploy_armed'), resCmp('stage_idx', 'eq', 3), resCmp('round_idx', 'gte', 5)), mode: 'edge', armed: false } },
    when_deploy_pve4: { EventWhen: { signal: 'deploy_pve_4', when: and(flagIs('deploy_armed'), resCmp('stage_idx', 'eq', 4), resCmp('round_idx', 'gte', 5)), mode: 'edge', armed: false } },
    when_deploy_pve5: { EventWhen: { signal: 'deploy_pve_5', when: and(flagIs('deploy_armed'), resCmp('stage_idx', 'eq', 5), resCmp('round_idx', 'gte', 5)), mode: 'edge', armed: false } },
    wipe_loot: { Effect: { onSignal: 'wipe', kind: 'destroy-tagged', targetId: '', value: LOOT } }, // 未拾取法球随结算清（主角拾取=批C）
    // 装备宝箱（EQUIP，无 LOOT）不随结算清——整个备战期留在场上可捡（用户：宝箱备战期别消失），
    // 仅在下场战斗开打拍清掉未拾的（ph_combat），避免跨多回合无限堆积。
    eff_equip_sweep: { Effect: { onSignal: 'ph_combat', kind: 'destroy-tagged', targetId: '', value: EQUIP } },
    // —— 主角小小英雄（批C，§4.7 映射零新能力）：WASD/方向键自由移动（Controllable→Velocity→motion-apply）。
    // 不带队伍位 → 不被 aggro 锁/打击区命中/wipe 清场；常驻跨回合。拾取（过渡版）：主角=zone，碰球即收走
    // （trigger-zone"恰好一方 zone"互斥 + hitbox 无 consume 语义 → 赏金两清的原子缺口已提 REQ-F-044
    //  `Hitbox.consumeOnHit`；落地后球改 zone 单发写 loot 自毁，下方入账链即时生效——链已就位）。
    // 主公宝座（归位处，棋盘左下角；主公金龙初始坐其上，WASD 离座拾取战利品）。
    throne: { Transform: xf(-150, 96), Shape: { kind: 'box', width: 40, height: 46 }, Color: { tint: 0xffffff, alpha: 1 }, Sprite: { textureKey: F_THRONE, anchorX: 0.5, anchorY: 0.5, zOrder: 1 } },
    throne_label: { Transform: xf(-150, 122), Text: { content: '主公宝座', fontSize: 9, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 }, Color: { tint: 0xcf9a3f, alpha: 1 }, Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 2 } },
    protag: {
      Transform: xf(-150, 86), // 棋盘左下角宝座上（用户钦定主公默认位）
      Velocity: { vx: 0, vy: 0, angular: 0 },
      Controllable: { playerId: 'p1', speed: 1.6 },
      Shape: { kind: 'box', width: 14, height: 14 },
      Tag: { flags: PROTAG }, // 044 后主角零附件：球自带 consumeOnHit 两清
      Resource: { id: 'loot', current: 0, min: 0, max: 999 },
      Sprite: sprite(F_HERO.protag, 12), // 主公小小英雄 = 金龙（独特奇异生物，非在册英雄/非真人）
    },
    // 主公行囊（装备系统 A）：**全盘自动归集**（提交版 P1：删「主公捡 orb」摩擦）——静态收集体覆盖整个棋盘
    // (ARENA)，敌死掉落的装备 orb 落在任意格都同拍命中它 → items 累加。无 Sprite 不可见；BAG 位无 TEAM 不参战。
    item_bag: {
      Transform: xf(0, -28),
      Shape: { kind: 'box', width: 380, height: 320 }, // 覆盖 ARENA(±170/-165..110) → 全盘任意落点即收
      Visibility: { visible: false, active: true }, // 隐形收集区（裸 Shape 否则渲成大方块）；Hitbox 仍 sim 收集
      Tag: { flags: BAG },
      Resource: { id: 'items', current: 0, min: 0, max: 60 }, // 拾取累加上限 60（战利品滚动槽，金铲铲式不再卡 8）；跨回合持久（行囊不清场）
    },
    protag_name: {
      Transform: xf(-150, 70),
      Text: { content: '主公', fontSize: 10, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 },
      Color: { tint: 0xcf9a3f, alpha: 1 },
      Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 30 },
      Hierarchy: { parentId: 'protag', localX: 0, localY: -16, localRotation: 0, localScaleX: 1, localScaleY: 1 },
    },
    when_loot: { EventWhen: { signal: 'loot_cash', when: resCmp('loot', 'gt', 0), mode: 'edge', armed: false } },
    eff_loot_gold: { Effect: { onSignal: 'loot_cash', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 0, valueFrom: { resourceId: 'loot' }, order: 1 } }, // order 钉死：先搬运后清零（effect-apply 按 id 序，'clear'<'gold' 会先清——实测踩到的搬运 0 坑）
    eff_loot_clear: { Effect: { onSignal: 'loot_cash', kind: 'modify-resource', targetId: 'loot', op: 'set', value: 0, order: 2 } },
    // —— 开局强化符文三选一（批D，一图流入口；单人化=三选一无争抢）：回合1备战期顶部三卡，点选即生效，
    // 整组 destroy-tagged 收走（天然一次性，无需 armed 旗）。效果=经济型（全现有词汇，无 buff 施加依赖）。
    // 开局强化三选一（一次性，仅回合1）：加标题说明 + 开战拍自动收走（用户报「永远在中央、不知何意」——
    // 真打的时候就去掉）。Tag RUNE → 点选生效后 destroy-tagged 整组收（含标题），没点则 ph_combat 兜底收走。
    // 符文三选一底盘（去腐：原 chrome 生成器展平为字面 edge+bg 双 Shape，逐字等价；Tag RUNE 随整组收走）。
    rune_title_edge: { Transform: xf(0, -128), Shape: { kind: 'box', width: 348, height: 26 }, Color: { tint: 0xe3c896, alpha: 1 }, Tag: { flags: RUNE }, Sprite: zlift(32.5) },
    rune_title_bg: { Transform: xf(0, -128), Shape: { kind: 'box', width: 344, height: 22 }, Color: { tint: 0xfffdfa, alpha: 1 }, Tag: { flags: RUNE }, Sprite: zlift(32.6) },
    rune_a_edge: { Transform: xf(-110, -100), Shape: { kind: 'box', width: 104, height: 48 }, Color: { tint: 0xe3c896, alpha: 1 }, Tag: { flags: RUNE }, Sprite: zlift(32.5) },
    rune_a_bg: { Transform: xf(-110, -100), Shape: { kind: 'box', width: 100, height: 44 }, Color: { tint: 0xfffdfa, alpha: 1 }, Tag: { flags: RUNE }, Sprite: zlift(32.6) },
    rune_b_edge: { Transform: xf(0, -100), Shape: { kind: 'box', width: 104, height: 48 }, Color: { tint: 0xe3c896, alpha: 1 }, Tag: { flags: RUNE }, Sprite: zlift(32.5) },
    rune_b_bg: { Transform: xf(0, -100), Shape: { kind: 'box', width: 100, height: 44 }, Color: { tint: 0xfffdfa, alpha: 1 }, Tag: { flags: RUNE }, Sprite: zlift(32.6) },
    rune_c_edge: { Transform: xf(110, -100), Shape: { kind: 'box', width: 104, height: 48 }, Color: { tint: 0xe3c896, alpha: 1 }, Tag: { flags: RUNE }, Sprite: zlift(32.5) },
    rune_c_bg: { Transform: xf(110, -100), Shape: { kind: 'box', width: 100, height: 44 }, Color: { tint: 0xfffdfa, alpha: 1 }, Tag: { flags: RUNE }, Sprite: zlift(32.6) },
    rune_title: { Transform: xf(0, -128), Shape: { kind: 'box', width: 340, height: 18 }, Tag: { flags: RUNE }, Text: { content: '◆ 开局强化 · 三选一（点击生效，开战后消失）', fontSize: 13, fontFamily: FONT_DISPLAY, anchor: 'center', lineSpacing: 0 }, Color: { tint: 0xcf9a3f, alpha: 1 }, Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 33 } },
    rune_a: { Transform: xf(-110, -100), Shape: { kind: 'box', width: 96, height: 40 }, Clickable: { action: 'rune_a' }, Tag: { flags: RUNE }, Text: { content: '屯粮：+5 金', fontSize: 12, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 }, Color: { tint: 0xcf9a3f, alpha: 1 }, Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 33 } },
    rune_b: { Transform: xf(0, -100), Shape: { kind: 'box', width: 96, height: 40 }, Clickable: { action: 'rune_b' }, Tag: { flags: RUNE }, Text: { content: '砺兵：+8 经验', fontSize: 12, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 }, Color: { tint: 0xc98fc4, alpha: 1 }, Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 33 } },
    rune_c: { Transform: xf(110, -100), Shape: { kind: 'box', width: 96, height: 40 }, Clickable: { action: 'rune_c' }, Tag: { flags: RUNE }, Text: { content: '广纳：备战席 +2', fontSize: 12, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 }, Color: { tint: 0x8aa0e6, alpha: 1 }, Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 33 } },
    eff_rune_a: { Effect: { onSignal: 'rune_a', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 5 } },
    eff_rune_b: { Effect: { onSignal: 'rune_b', kind: 'modify-resource', targetId: 'xp', op: 'add', value: 8 } },
    eff_rune_c: { Effect: { onSignal: 'rune_c', kind: 'modify-resource', targetId: 'bench_cap', op: 'add', value: 2 } }, // F-17 后席位空余是派生值 → 扩容改容量源
    eff_rune_a_done: { Effect: { onSignal: 'rune_a', kind: 'destroy-tagged', targetId: '', value: RUNE } },
    eff_rune_b_done: { Effect: { onSignal: 'rune_b', kind: 'destroy-tagged', targetId: '', value: RUNE } },
    eff_rune_c_done: { Effect: { onSignal: 'rune_c', kind: 'destroy-tagged', targetId: '', value: RUNE } },
    // 兜底收走：没点也在开战拍清掉（回合1 后无 RUNE 实体 → 后续 ph_combat 空转无害）。
    eff_rune_sweep: { Effect: { onSignal: 'ph_combat', kind: 'destroy-tagged', targetId: '', value: RUNE } },
    // —— 羁绊（F-16/REQ-F-047，Phase 3 先行最小版）：蜀魂——场上蜀将 ≥3 → 我方伤害 ×1.2（开战拍 edge 锁存，
    // 战斗中减员不掉档；prep 复位 ×1）。计数=group-count（REQ-022）；施加=hitbox scaleByResource 乘区。——
    // 羁绊计数=「在板 marker」（备战期就真实反映布阵；战斗期 marker 持久仍在板→不变）。BENCH_OCC 限定只数
    // marker（战斗单位无此位→不双计），onBoard:true 只数已上场（拖回备战席=不计，TFT 上场羁绊语义）。
    bond_counter_shu: { GroupCount: { countResource: 'count_shu', requiredTag: BENCH_OCC | FACT_SHU, onBoard: true } },
    r_count_shu: { Resource: { id: 'count_shu', current: 0, min: 0, max: 99 } },
    bond_counter_warrior: { GroupCount: { countResource: 'count_warrior', requiredTag: BENCH_OCC | WARRIOR, onBoard: true } },
    r_count_warrior: { Resource: { id: 'count_warrior', current: 0, min: 0, max: 99 } },
    bond_counter_tactician: { GroupCount: { countResource: 'count_tactician', requiredTag: BENCH_OCC | TACTICIAN, onBoard: true } },
    r_count_tactician: { Resource: { id: 'count_tactician', current: 0, min: 0, max: 99 } },
    r_dmg_scale_a: { Resource: { id: 'dmg_scale_a', current: 1, min: 0, max: 9 } },
    r_dmg_scale_b: { Resource: { id: 'dmg_scale_b', current: 1, min: 0, max: 9 } }, // 敌方系数（信长·天下布武 全军 atk buff 在此锁存；mob hitbox 全读 dmg_scale_b）
    // 信长·天下布武（T-F1，REQ-F-064 现成能力重组：deploy_pve_<N> 信号 → 全局 Effect modify-resource，零引擎；
    // = decks round-buff 同款 banded 锁存，只是 banded by 关卡阶段而非回合）。守军全军伤害**阶段递增**：
    // 国人众/天守关越深，太阁守军越凶，终盘信长坐镇天守 ×1.40。prep 每回合把 dmg_scale_b 复位回 1（round_ui prep onEnter）。
    // 全 mob hitbox 已 scaleByResource:'dmg_scale_b'（与玩家 dmg_scale_a 羁绊乘区对称）。
    // op:add（从 prep 复位的基线 1 累加）→ 与毛利·三矢 buff 可叠加（同 dmg_scale_b，避免 set 覆盖）。
    eff_tenka_s2: { Effect: { onSignal: 'deploy_pve_2', kind: 'modify-resource', targetId: 'dmg_scale_b', op: 'add', value: 0.08 } },
    eff_tenka_s3: { Effect: { onSignal: 'deploy_pve_3', kind: 'modify-resource', targetId: 'dmg_scale_b', op: 'add', value: 0.16 } },
    eff_tenka_s4: { Effect: { onSignal: 'deploy_pve_4', kind: 'modify-resource', targetId: 'dmg_scale_b', op: 'add', value: 0.25 } },
    eff_tenka_s5: { Effect: { onSignal: 'deploy_pve_5', kind: 'modify-resource', targetId: 'dmg_scale_b', op: 'add', value: 0.40 } },
    // 毛利元就·三矢（国人众招牌，REQ-F-064 现成能力重组）：场上部将(国人众/天守)≥3 → 守军全军伤害 +0.18。
    // = 玩家羁绊 bond 的敌方镜像（group-count 部将 tag → 战斗态 edge → Effect 累加 dmg_scale_b）。零引擎。
    gc_busho: { GroupCount: { countResource: 'count_busho', requiredTag: BUSHO } },
    r_count_busho: { Resource: { id: 'count_busho', current: 0, min: 0, max: 99 } },
    when_busho_sanshi: { EventWhen: { signal: 'busho_sanshi', when: and({ kind: 'state', fsmId: 'round_ui', equals: 'combat' }, resCmp('count_busho', 'gte', 3)), mode: 'edge', armed: false } },
    eff_busho_sanshi: { Effect: { onSignal: 'busho_sanshi', kind: 'modify-resource', targetId: 'dmg_scale_b', op: 'add', value: 0.18 } },
    // 今川义元·弓阵（国人众招牌）：场上弓兵(远程 mob)≥3 → 守军全军伤害 +0.12（弓阵齐射压制）。同毛利镜像法。
    gc_bow: { GroupCount: { countResource: 'count_bow', requiredTag: BOW } },
    r_count_bow: { Resource: { id: 'count_bow', current: 0, min: 0, max: 99 } },
    when_bow_jin: { EventWhen: { signal: 'bow_jin', when: and({ kind: 'state', fsmId: 'round_ui', equals: 'combat' }, resCmp('count_bow', 'gte', 3)), mode: 'edge', armed: false } },
    eff_bow_jin: { Effect: { onSignal: 'bow_jin', kind: 'modify-resource', targetId: 'dmg_scale_b', op: 'add', value: 0.12 } },
    when_bond_shu: { EventWhen: { signal: 'bond_shu', when: and({ kind: 'state', fsmId: 'round_ui', equals: 'combat' }, resCmp('count_shu', 'gte', 3)), mode: 'edge', armed: false } },
    eff_bond_shu: { Effect: { onSignal: 'bond_shu', kind: 'modify-resource', targetId: 'dmg_scale_a', op: 'set', value: 1.2 } },
    // —— 加时强制结束（一图流：30s+15s；单人改编=超时按败方路径结算，注记于 flow-spec）——
    overtime_clock: { Timer: { id: 'combat_clock', elapsed: 0, duration: 999999, loop: false } },
    when_ot_reset: { EventWhen: { signal: 'ot_reset', when: { kind: 'state', fsmId: 'round_ui', equals: 'combat' }, mode: 'edge', armed: false } },
    eff_ot_reset: { Effect: { onSignal: 'ot_reset', kind: 'reset-timer', targetId: '', targetEntity: 'overtime_clock' } },
    when_wipe: { EventWhen: { signal: 'wipe', when: flagIs('wipe_armed'), mode: 'edge', armed: false } },
    wipe_team_a: { Effect: { onSignal: 'wipe', kind: 'destroy-tagged', targetId: '', value: TEAM_A } }, // 清场：按阵营批量销毁，级联连名牌/条/sidecar
    wipe_team_b: { Effect: { onSignal: 'wipe', kind: 'destroy-tagged', targetId: '', value: TEAM_B } },
    // —— 关卡进位（§3.2 注：advance 只 +1，满 5 进位走 banded）——
    when_stage_up: { EventWhen: { signal: 'stage_up', when: resCmp('round_idx', 'gt', 5), mode: 'edge', armed: false } },
    eff_stage_up_stage: { Effect: { onSignal: 'stage_up', kind: 'modify-resource', targetId: 'stage_idx', op: 'add', value: 1 } },
    eff_stage_up_round: { Effect: { onSignal: 'stage_up', kind: 'modify-resource', targetId: 'round_idx', op: 'set', value: 1 } },
    // —— §4.1 基础收入（按回合全局序 1,2,3,4,≥5 → 2,2,3,4,5 金；全局序≥5 ⇔ 阶段>1 或 round≥5）——
    when_income_2: { EventWhen: { signal: 'income_2', when: and(flagIs('income_armed'), resCmp('stage_idx', 'eq', 1), resCmp('round_idx', 'lte', 2)), mode: 'edge', armed: false } },
    eff_income_2: { Effect: { onSignal: 'income_2', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 2 } },
    when_income_3: { EventWhen: { signal: 'income_3', when: and(flagIs('income_armed'), resCmp('stage_idx', 'eq', 1), resCmp('round_idx', 'eq', 3)), mode: 'edge', armed: false } },
    eff_income_3: { Effect: { onSignal: 'income_3', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 3 } },
    when_income_4: { EventWhen: { signal: 'income_4', when: and(flagIs('income_armed'), resCmp('stage_idx', 'eq', 1), resCmp('round_idx', 'eq', 4)), mode: 'edge', armed: false } },
    eff_income_4: { Effect: { onSignal: 'income_4', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 4 } },
    when_income_5: { EventWhen: { signal: 'income_5', when: and(flagIs('income_armed'), or(resCmp('stage_idx', 'gt', 1), resCmp('round_idx', 'gte', 5))), mode: 'edge', armed: false } },
    eff_income_5: { Effect: { onSignal: 'income_5', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 5 } },
    // —— §4.1 利息 ⌊gold/10⌋ 上限 +5（5 条 banded）——
    when_interest_1: { EventWhen: { signal: 'interest_1', when: and(flagIs('income_armed'), resCmp('gold', 'gte', 10), resCmp('gold', 'lt', 20)), mode: 'edge', armed: false } },
    eff_interest_1: { Effect: { onSignal: 'interest_1', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 1 } },
    when_interest_2: { EventWhen: { signal: 'interest_2', when: and(flagIs('income_armed'), resCmp('gold', 'gte', 20), resCmp('gold', 'lt', 30)), mode: 'edge', armed: false } },
    eff_interest_2: { Effect: { onSignal: 'interest_2', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 2 } },
    when_interest_3: { EventWhen: { signal: 'interest_3', when: and(flagIs('income_armed'), resCmp('gold', 'gte', 30), resCmp('gold', 'lt', 40)), mode: 'edge', armed: false } },
    eff_interest_3: { Effect: { onSignal: 'interest_3', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 3 } },
    when_interest_4: { EventWhen: { signal: 'interest_4', when: and(flagIs('income_armed'), resCmp('gold', 'gte', 40), resCmp('gold', 'lt', 50)), mode: 'edge', armed: false } },
    eff_interest_4: { Effect: { onSignal: 'interest_4', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 4 } },
    when_interest_5: { EventWhen: { signal: 'interest_5', when: and(flagIs('income_armed'), resCmp('gold', 'gte', 50)), mode: 'edge', armed: false } },
    eff_interest_5: { Effect: { onSignal: 'interest_5', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 5 } },
    // —— §4.1 连胜金：2–3 连 +1；4 连 +2；5+ 连 +3 ——
    when_streak_1: { EventWhen: { signal: 'streak_1', when: and(flagIs('income_armed'), resCmp('win_streak', 'gte', 2), resCmp('win_streak', 'lte', 3)), mode: 'edge', armed: false } },
    eff_streak_1: { Effect: { onSignal: 'streak_1', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 1 } },
    when_streak_2: { EventWhen: { signal: 'streak_2', when: and(flagIs('income_armed'), resCmp('win_streak', 'eq', 4)), mode: 'edge', armed: false } },
    eff_streak_2: { Effect: { onSignal: 'streak_2', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 2 } },
    when_streak_3: { EventWhen: { signal: 'streak_3', when: and(flagIs('income_armed'), resCmp('win_streak', 'gte', 5)), mode: 'edge', armed: false } },
    eff_streak_3: { Effect: { onSignal: 'streak_3', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 3 } },
    // —— §4.1 连败金（准则 P2，与连胜同形档位）——
    when_lstreak_1: { EventWhen: { signal: 'lstreak_1', when: and(flagIs('income_armed'), resCmp('lose_streak', 'gte', 2), resCmp('lose_streak', 'lte', 3)), mode: 'edge', armed: false } },
    eff_lstreak_1: { Effect: { onSignal: 'lstreak_1', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 1 } },
    when_lstreak_2: { EventWhen: { signal: 'lstreak_2', when: and(flagIs('income_armed'), resCmp('lose_streak', 'eq', 4)), mode: 'edge', armed: false } },
    eff_lstreak_2: { Effect: { onSignal: 'lstreak_2', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 2 } },
    when_lstreak_3: { EventWhen: { signal: 'lstreak_3', when: and(flagIs('income_armed'), resCmp('lose_streak', 'gte', 5)), mode: 'edge', armed: false } },
    eff_lstreak_3: { Effect: { onSignal: 'lstreak_3', kind: 'modify-resource', targetId: 'gold', op: 'add', value: 3 } },
    // —— §4.2 玩家伤害（败方）：阶段基础伤(1/2 阶段=0/2) + 存活敌数近似 2（REQ-022 group-count 接入后换真值，队列 P1 注记）——
    when_dmg_stage_1: { EventWhen: { signal: 'dmg_stage_1', when: and(flagIs('dmg_armed'), resCmp('stage_idx', 'eq', 1)), mode: 'edge', armed: false } },
    eff_dmg_stage_1: { Effect: { onSignal: 'dmg_stage_1', kind: 'modify-resource', targetId: 'player_hp', op: 'add', value: -2 } },
    when_dmg_stage_2: { EventWhen: { signal: 'dmg_stage_2', when: and(flagIs('dmg_armed'), resCmp('stage_idx', 'gt', 1)), mode: 'edge', armed: false } },
    eff_dmg_stage_2: { Effect: { onSignal: 'dmg_stage_2', kind: 'modify-resource', targetId: 'player_hp', op: 'add', value: -4 } },
    // —— T3 贡献度（单机 scaffold，game-f-core-combat-dev §二）：对太阁打赢的波次累加贡献（胜多败少）。──
    // 单机=自己的分；多人=岛主排名口径（后置）。真·补刀归属(kill-attribution)是贡献系统特性，非 v1 战斗算子。
    // 挂结算窗（income_armed 每结算拍真）：胜（won）多记、败（!won，仍造成伤害）少记。stage 越深贡献越高。
    r_contribution: { Resource: { id: 'contribution', current: 0, min: 0, max: 99999 } },
    // 贡献「后置」曲线（designer #27 防独大/anti-snowball）：按关卡敌阵层级加权——滩头杂兵(stage≤2)=6、
    // 国人众部将(stage3-4)=18、天守 Boss(stage≥5)=45。序盘领先锁不死，岛主到终盘抢 Boss 才定（翻盘悬念+人头高光）。
    when_contrib_win_1: { EventWhen: { signal: 'contrib_win_1', when: and(flagIs('income_armed'), flagIs('won'), resCmp('stage_idx', 'lte', 2)), mode: 'edge', armed: false } },
    eff_contrib_win_1: { Effect: { onSignal: 'contrib_win_1', kind: 'modify-resource', targetId: 'contribution', op: 'add', value: 6 } },
    when_contrib_win_2: { EventWhen: { signal: 'contrib_win_2', when: and(flagIs('income_armed'), flagIs('won'), resCmp('stage_idx', 'gte', 3), resCmp('stage_idx', 'lte', 4)), mode: 'edge', armed: false } },
    eff_contrib_win_2: { Effect: { onSignal: 'contrib_win_2', kind: 'modify-resource', targetId: 'contribution', op: 'add', value: 18 } },
    when_contrib_win_boss: { EventWhen: { signal: 'contrib_win_boss', when: and(flagIs('income_armed'), flagIs('won'), resCmp('stage_idx', 'gte', 5)), mode: 'edge', armed: false } },
    eff_contrib_win_boss: { Effect: { onSignal: 'contrib_win_boss', kind: 'modify-resource', targetId: 'contribution', op: 'add', value: 45 } },
    when_contrib_loss: { EventWhen: { signal: 'contrib_loss', when: and(flagIs('income_armed'), { kind: 'not', of: flagIs('won') }), mode: 'edge', armed: false } },
    eff_contrib_loss: { Effect: { onSignal: 'contrib_loss', kind: 'modify-resource', targetId: 'contribution', op: 'add', value: 2 } },
    // —— T4 岛屿进度条（game-f-core-combat-dev §二）：每打赢一波推进攻岛进度；满 100 = 岛陷落 → 通关。──
    // 单机攻岛进度资源，胜利波累加（败北不推进，但靠 player_hp 兜底败局）；满即 island_taken → run_flow 转 victory。
    r_island: { Resource: { id: 'island_progress', current: 0, min: 0, max: 100 } },
    f_island_taken: { Flag: { id: 'island_taken', active: false } },
    when_island_tick: { EventWhen: { signal: 'island_tick', when: and(flagIs('income_armed'), flagIs('won')), mode: 'edge', armed: false } },
    eff_island_tick: { Effect: { onSignal: 'island_tick', kind: 'modify-resource', targetId: 'island_progress', op: 'add', value: 20 } },
    when_island_taken: { EventWhen: { signal: 'island_taken_sig', when: resCmp('island_progress', 'gte', 100), mode: 'edge', armed: false } },
    eff_island_taken: { Effect: { onSignal: 'island_taken_sig', kind: 'set-flag', targetId: 'island_taken', value: true } },
    // 静态相机（表现，排除出 hash）。720p 画布 + zoom 把棋盘放大填满视口。
    camera: { Transform: xf(0, 0), Camera: { zoom: 1.8, offsetX: 0, offsetY: 0, rotation: 0, viewportW: 1280, viewportH: 720 } },
  };
  // 开局阵容播种（REQ-F-049 统一架构）：4 个 bootcast 在经典站位上各放一个 **在板** 1 星 marker
  // （'@origin-hex' 哨兵把 bootcast 自身的格写进 seat——marker 经 prefab 出身戳，与买入 marker 同族可合成）。
  // when_boot：stage_idx≥1 自世界首拍恒真 → edge 恰发一次。旧固定槽 slot_<将> 系列由此整段替代：
  // 上场=「板上有 marker」一个事实源，拖动/买卖/合成全自动跟。
  entities['when_boot'] = { EventWhen: { signal: 'boot_roster', when: resCmp('stage_idx', 'gte', 1), mode: 'edge', armed: false } };
  for (const h of ROSTER.filter((x) => x.team === TEAM_A && x.seed !== false)) { // 只播种原 4 将（seed≠false）；新增 2 将商店专属可买
    const a = offsetToAxial(h.q, h.r);
    const p = project(a.q, a.r);
    entities[`bootcast_${h.id}`] = {
      Transform: xf(p.x, p.y),
      HexPos: { q: a.q, r: a.r }, // 持位者的格（无 GridMover → F-051 不占格不挡路）
      Caster: { onSignal: 'boot_roster', template: `bench_${h.id}`, at: 'self', requireHexPos: true, overrides: { seat: { HexPos: '@origin-hex' } } },
    };
  }
  // 商店买入分发（每将一组，F-11 ②③）：bought_code 命中码 → buy_<将> 信号 → 备战席位生成 marker
  // + 复位 bought_code=0（F-11 坑：防同码二连买 edge 不触发）。席位 x 按将错开（重复购买同将暂叠同位）。
  ROSTER.filter((x) => x.team === TEAM_A).forEach((h, i) => {
    const sig = `buy_${h.id}`;
    entities[`when_${sig}`] = { EventWhen: { signal: sig, when: resCmp('bought_code', 'eq', HERO_CODE[h.id]), mode: 'edge', armed: false } };
    entities[`buycast_${h.id}`] = { Transform: xf(0, TRAY.originY), Caster: { onSignal: sig, template: `bench_${h.id}`, at: 'self' } };
    entities[`eff_${sig}_reset`] = { Effect: { onSignal: sig, kind: 'modify-resource', targetId: 'bought_code', op: 'set', value: 0 } };
    // 048② 每将卖出链（点席=sell_<将>）；席位归还不再手工 +1——bench_space 派生自 marker 计数（F-17）
    const sell = `sell_${h.id}`;
    entities[`eff_${sell}_destroy`] = { Effect: { onSignal: sell, kind: 'destroy', targetId: '', targetEntity: '@signal-source' } };
    entities[`eff_${sell}_gold`] = { Effect: { onSignal: sell, kind: 'modify-resource', targetId: 'gold', op: 'add', value: SELL_PRICE[1] } };
    entities[`eff_${sell}_code`] = { Effect: { onSignal: sell, kind: 'modify-resource', targetId: 'sold_code', op: 'set', value: HERO_CODE[h.id] } };
    // —— F-17 升星（REQ-F-046 接入）：席位 marker 三连合成（最老 3 个原子换 1，挂件级联、while 连锁；
    // 板上合成产物留板上原格、席上合成留席——merge-rule 出身格继承，REQ-F-049）。星级数值烘在
    // bench2/bench3 模板的 Caster.overrides 里（模板家族即星级，旧星级资源带契约已删）。——
    entities[`mr2_${h.id}`] = { MergeRule: { template: `bench_${h.id}`, need: 3, into: `bench2_${h.id}`, intoOverrides: { seat: { HexPos: '@origin-hex' } } } };
    entities[`mr3_${h.id}`] = { MergeRule: { template: `bench2_${h.id}`, need: 3, into: `bench3_${h.id}`, intoOverrides: { seat: { HexPos: '@origin-hex' } } } };
    // 合成品卖出链（点席=sell<星>_<将>，@signal-source 点谁卖谁）：星级卖价；袋**不**归还
    // ——3 张已熔毁成 1 个高星 marker，按张归还语义不成立（known wart，回执/TUNE 注记）。
    for (const s of [2, 3]) {
      const sk = `sell${s}_${h.id}`;
      entities[`eff_${sk}_destroy`] = { Effect: { onSignal: sk, kind: 'destroy', targetId: '', targetEntity: '@signal-source' } };
      entities[`eff_${sk}_gold`] = { Effect: { onSignal: sk, kind: 'modify-resource', targetId: 'gold', op: 'add', value: SELL_PRICE[s] } };
    }
  });
  // 商店三槽镜像资源（F-14）：CardPile.handCodeResources 写入在售英雄码，GameShell 商店面板按码取脸图。
  // 旧 canvas 大卡面/底板/框（持位 Caster + Shape 占位）已退役 → 壳层 image 直读 shop_face StringVar。
  for (let i = 0; i < 3; i++) {
    entities[`r_shop_slot_${i + 1}`] = { Resource: { id: `shop_slot_${i + 1}`, current: 0, min: 0, max: 9999 } };
  }
  // 备战席托盘（REQ-F-055）：9 槽英雄平台（非六角；placeholder 槽框）。买入自动落座/席内拖拽互换/上板让座。
  entities['bench_tray'] = { Tray: { ...TRAY, requiredTag: BENCH_OCC } };
  for (let i = 0; i < TRAY.capacity; i++) {
    entities[`bench_frame_${i}`] = { Transform: xf(TRAY.originX + i * TRAY.gap, TRAY.originY + 6), Shape: { kind: 'box', width: 40, height: 32 }, Color: { tint: 0xffffff, alpha: 1 }, Sprite: { textureKey: F_PEDESTAL, anchorX: 0.5, anchorY: 0.5, zOrder: 1 } }; // 朴素石墩台座（每槽一个）
  }
  // 敌方关卡槽（持久）：每阶段一组，prep 按 stage_idx 分流的 deploy_stage_<N> 展开（§4.5 敌阵=数据）。
  for (const st of STAGES) {
    st.comp.forEach((c, ci) => {
      // ei → 敌阵营第 ei 将（选阵营翻转后仍成立）；id 带序号防同模板多实例撞键。默认蜀：ei0=b_zhangliao..。
      const eh = enemyHeroes[c.ei];
      entities[`slot_s${st.n}_${ci}_${eh.id}`] = slotEntity(eh, `deploy_stage_${st.n}`, c.q, c.r, c.hpMul);
    });
  }
  // 太阁守军部署槽（C·slice2）：每波多兵种编成（PVE_COMP）横向铺位（7×8 盘敌前排 r3 起，超 7 折到 r2）；
  // 血量取 master unit.hp（经 overrides 写）。国人众/Boss 据此进战斗。
  for (const w of PVE_COMP) {
    let i = 0;
    for (const slot of w.comp) {
      const u = unitByCode(slot.code)!;
      for (let k = 0; k < slot.count; k++, i++) {
        const a = offsetToAxial(1 + (i % 6), i < 6 ? 3 : 2); // 前排 r3 排 6 个，溢出到 r2
        const p2 = project(a.q, a.r);
        const mobHp = Math.round(u.hp * DIFFICULTY); // 段位难度阀：高段位太阁更肉
        entities[`pveslot_s${w.stage}_${i}`] = {
          Transform: xf(p2.x, p2.y),
          Caster: { onSignal: `deploy_pve_${w.stage}`, template: `mob_${slot.code}`, at: 'self', overrides: { main: { HexPos: { q: a.q, r: a.r }, Tag: { flags: TEAM_B | (u.seg === 'kokujin' || u.seg === 'tenshu' ? BUSHO : 0) | (u.atkType !== 'melee' ? BOW : 0) }, Resource: { current: mobHp, max: mobHp } } } }, // 部将(毛利三矢)/弓兵(今川弓阵) group-count tag
        };
      }
    }
  }

  // 牌组规则实体合并（T2）：deck → group-count/EventWhen/Effect 规则；与逻辑同源，开战 edge 锁存写 dmg_scale_a。
  // 装牌组时牌组**拥有羁绊**：拆掉硬编码「蜀魂」基线（否则它的 op:set 1.2 会与牌组 connection 的 op:add 在 dmg_scale_a 上互撞）。
  // 不装牌组的默认蜀局仍保留蜀魂（向后兼容，既有经济测试不动）。
  if (deckRules) {
    for (const k of ['bond_counter_shu', 'r_count_shu', 'when_bond_shu', 'eff_bond_shu']) delete entities[k];
    Object.assign(entities, deckRules.entities);
  }

  return {
    capabilities: [
      // 金铲铲回合流程机（备战→战斗→结算→结束/gameover；战斗用 in_combat 门控普攻/攒蓝）
      flowCapability,
      // AI：索敌 + 六边形网格寻路走位（aggro 写目标 → grid-move 沿确定性 A* 逐格走，REQ-024）
      aggroCapability,
      gridMoveCapability,
      steeringCapability, // 远程/法术弹道（用户打击感批）：追踪弹 seek（aggro 锁敌 → Velocity → motion-apply）
      motionApplyCapability, // 主角自由移动（批C：Controllable dx/dy→Velocity→Transform；棋子仍走 grid-move）
      // 自动普攻（F-9 self 化）：timer → self-rule(whenGlobal 门 + spawn at target) → prefab；
      // 大招半截 + deploy/wipe/banded：event-when → caster/effect-apply（大招完整 self 化等 REQ-F-039）
      timerCapability,
      selfRuleCapability,
      eventWhenCapability,
      effectApplyCapability,
      casterCapability,
      prefabCapability,
      // 结算：overlap → trigger-zone → hitbox → resource
      overlapDetectCapability,
      triggerZoneCapability,
      hitboxCapability,
      overTimeCapability, // 大招 DoT（灼烧/吸取）持续伤害
      resourceCapability,
      // 生命周期：打击区自毁 + 单位死亡
      lifetimeCapability,
      destroyCapability,
      mortalCapability,
      // 胜负 + 表现 + 输入
      zoneOccupancyCapability,
      gaugeCapability, // 实时血条/蓝条（REQ-F-029）：Resource 比例 → 条宽，PostResolve 终态投影（REQ-F-031 定序）
      clickableCapability, // ready 开战按钮：指针命中 → 'ready_btn' 信号（引擎已对 event-when 定序）
      keybindCapability, // 去腐：GameShell button→enqueueAction(信号) → InputQueue{key,phase:'action'} → KeyBinding 产 Signal（假点击桥的非空间替代；card-pile.runsBefore 已含 keybind 破环）

      cardPileCapability, // 商店（F-11/REQ-F-040）：牌袋发牌/play 原子验扣/据码写 bought_code（引擎已按"输入先行"钉七件套定序）
      craftRecipeCapability, // 手动刷新 $2（F-12）：reroll_btn 信号 → 原子扣金置 reroll_paid（扣不起整单不动）
      textBindingCapability, // HUD 数字（F-15/REQ-F-043）：Resource → Text.content 投影
      groupCountCapability, // 羁绊计数（F-16/REQ-022+047）+ 升星 marker 计数 + 备战席占用派生（F-17）
      mergeRuleCapability, // 升星合成（F-17/REQ-F-046）：席位 marker 三连 N 换 1（最老先合、挂件级联、出身格继承）
      dragPlaceCapability, // 摆子拖拽（F-18/REQ-F-045+049+050）：备战期拖 marker 上板/调位/回席；snap 六角格+人口限额
      trayCapability, // 备战席托盘（REQ-F-055）：9 槽英雄平台——买入自动落座/席内拖拽互换/上板让座/无效落点弹回
      hierarchyResolveCapability,
      hierarchyCascadeCapability, // 子随父死（REQ-F-026）：棋子死亡→头顶名字一并消失
      cameraFollowCapability,
      tweenCapability, // 表现缓动（打击感批）：红闪/余韵/碎裂渐隐/呼吸微动/落子弹跳(keep 重放)/合成闪光/胜利彩点
    ],
    entities,
  };
}

export const GAME_F_HERO_IDS = ROSTER.map((h) => h.id);
