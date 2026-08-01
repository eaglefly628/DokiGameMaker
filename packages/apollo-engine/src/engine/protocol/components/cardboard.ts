// Protocol · 牌与棋盘算法（Tier3「算法/解释器型机制」）─────────────────────────────
// Condition→Event→Effect 表达不了的"带网格扫描/有序迭代/计数排序"的算法型机制：三消棋盘(match3-board)、
// 扑克牌型(poker-hand)、逐张计分(card-scoring)、计分 trace、带牌库出牌(card-pile)。各自一台确定性解释器。
import type { Component, EntityId } from '../../core/types.js';

// ── match3-board ── 三消棋盘机制（REQ-C-001）：网格消除（交换/找连/消除产出/重力/补块/连锁）。
// 这是「算法/解释器型机制」大类的代表——Condition→Event→Effect 表达不了"带网格扫描/循环的算法"。
// 相位状态机：idle（读点击选格/发起交换）→ swapped（首扫，无连线则回退）→ match（找≥3连线）
// → clear（按 kindResource 发 ResourceModify 产料/币、置 -1）→ fall（按列下沉）→ refill（顶部确定性随机补）
// → match（连锁）…稳定无连线 → idle。确定性：整数网格 + RandomSeed 整数 PRNG 补块，不碰浮点超越函数。
// 产出走现成 ResourceModify → resource-apply 结算 → 游戏装配好的升级/解锁链自动点亮（游戏数据不动一行）。
export interface MatchBoard extends Component {
  readonly type: 'MatchBoard';
  cols: number;
  rows: number;
  kindCount: number; // 棋子种类数
  cells: number[]; // 长 cols*rows，值=种类 0..kindCount-1，-1=空
  kindResource: string[]; // 种类→产出 Resource id（消该种 → ResourceModify 该 id）
  matAmount: number; // 每消一格给对应材料的量
  coinResource: string; // 货币 Resource id（空串=不产币）
  coinPerTile: number; // 每消一格给的货币
  kindTint: number[]; // 种类→视图底色（match-view-sync 写 Color.tint）
  kindLabel: string[]; // 种类→视图文字（match-view-sync 写 Text.content）
  phase: string; // 'idle'|'swapped'|'match'|'clear'|'fall'|'refill'
  selIndex: number; // 当前选中格（-1=无）
  swapA: number; // 本次交换两格（-1=无）
  swapB: number;
  stepTimer: number; // 相位推进节拍计数
  stepDelay: number; // 相位间等待 tick 数（让连锁可见；0=即时）
  selectAction: string; // 选中格的信号名（clickable 命中格子时发的 Signal.name）
  // ── 可选扩展（game-j 三消彩排·2026-07-09·向后兼容缺省关）──
  movesResource?: string; // 步数 Resource id：**合法交换**（产生连线/特殊糖组合）时 -1（非法步弹回不扣）。''/缺省=不限步
  kindSkinEntities?: string[]; // 种类→皮肤定义实体 id（该实体持 Sprite{textureKey:'art:…'}·加载期已解析）：
  // view-sync 把其 textureKey 写到 BoardCell 的 Sprite——糖果式图片皮；缺省=纯色块+文字视图不变
  // ── REQ-M3-三消二期 可选扩展（特殊糖 + 格层 + 目标·2026-07-16·向后兼容缺省关）──
  // 格编码：cells 低 8 位=色（0xFF=彩球无色哨值），bit8-10=特殊糖 flag（0 NONE/1 STRIPED_H/2 STRIPED_V/3 WRAPPED/4 COLORBOMB）。
  // 旧纯色值 0..255 编码后=自身 → 一期数据逐字节兼容。
  stripedOrientation?: 'perpendicular' | 'parallel'; // 4 连生成条纹的方向：perpendicular（缺省·与连线垂直）| parallel（同向）
  comboTable?: Array<{ a: number; b: number; effect: string }>; // 特殊糖组合闭集；缺省=预置 4 条（纹+纹=cross、纹+包=threeRowsCols、包+包=fiveByFive、球+球=wholeBoard）
  jelly?: number[]; // 果冻层（长 cols*rows·0/1/2）：本格参与消除减 1；缺省=无果冻
  blockers?: number[]; // 障碍层（长 cols*rows）：>0=hp（邻接消除减 1，0=解锁）；-1=石块（不可动/消·重力补块绕行）；0=无；缺省=无障碍
  jellyResource?: string; // 果冻减层写入的 Resource id（沿 kindResource 模式→现成 Condition 判目标）
  blockerResource?: string; // 障碍减 hp 写入的 Resource id（→现成 Condition 判目标）
}

// ── match3-board 视图格 ── 把逻辑格 index 绑到一个可点/可显示的实体（纯数据，游戏蓝图静态建好）。
// match-view-sync 据 cells 改它的 Color.tint/Text.content；clickable 命中它发选中信号。capability 不创建/销毁实体。
export interface BoardCell extends Component {
  readonly type: 'BoardCell';
  boardId: EntityId;
  index: number;
}

// ── poker-hand 牌（REQ-011）── 一张牌 = {花色, 点数}，纯整数枚举（确定性：相等/大小比较，不碰浮点）。
// suit：0..3（♠♥♦♣，仅用于"是否同花"的相等比较，无大小语义）。
// rank：2..14（J=11,Q=12,K=13,A=14；A 在顺子里也可当 1 凑 A-2-3-4-5 的"轮子"低顺）。
// 牌不是组件，是被 PlayedHand.cards 持有的纯数据（如 StatModifier 之于 Stats）。
export interface Card {
  suit: number;
  rank: number;
  // ── REQ-E-021 牌的**内禀修正**（附魔/版式/增强）── card-scoring 逐张 pass 在 baseChips 之后、外部小丑
  // (PerCardRule) 之前**按序套用**到对应 Resource。通用「实体携带修正、被处理时套用」原语（卡牌符文/牌面状态
  // 跨卡牌游戏复用），非 Buff 元系统：语境=计分循环本身（隐式）。版式/增强全是数据：
  //   foil=[{op:'add',target:'chips',value:50}]、holo=[{op:'add',target:'mult',value:10}]、poly=[{op:'mul',target:'mult',value:1.5}]。
  // held?(REQ-E-023③)：true=该 mod 只在 held-card-score pass（留手牌）套用（如 Steel 留手 ×1.5）；缺省=出牌 pass。两 pass 互不重复。
  mods?: Array<{ op: 'add' | 'mul'; target: string; value: number; held?: boolean }>;
  // ── REQ-E-021 牌的内禀重触发（红蜡封）── 并进逐张计分的 repeats（该牌连同其上 mods/小丑一起重复结算）。
  retrigger?: number;
  // ── REQ-GAMED #2 百搭/通配（wild）── true=这张可当任意 suit+rank，evaluateHand 小规模确定性枚举求**最优牌型**。
  // 内禀于牌（随 PlayedHand.cards 流经 poker-eval，零新配置）：game-d 百搭骰、game-e 通配类小丑各把某张 wild:true 即可。
  // 缺省/false=普通牌，判型逐字节等价旧行为（无 wild 不枚举）。
  wild?: boolean;
}

// ── poker-hand 出牌（REQ-011）── 本次"出"的一手牌（有序，供逐张迭代 / 按花色·点数计数）。
// 由选牌交互（clickable→signal→effect 装配）填充——**不在 poker-hand 能力里做选牌 UI / 洗牌发牌**
// （那些用现有 clickable/random/effect-apply 重组）。cards 为空=本帧不评估（基础分由装配层在新回合清零）。
export interface PlayedHand extends Component {
  readonly type: 'PlayedHand';
  cards: Card[];
  // 可选归属玩家 id（多人/coop）：card-play 按它把某玩家的「出牌」输入路由到对应牌桌的 PlayedHand。
  // 单人留空（装配层直接填 cards）。
  owner?: string;
}

// ── held-card-score 留手牌（REQ-E-023③）── 本次**留在手里没出**的牌（有序）。held-card-score pass 遍历它，
// 套用 held 标记的 Card.mods（如 Steel 留手 ×1.5）+ held 标记的 PerCardRule（如 Baron 留手 K ×1.5）。出牌 pass
// 只管出的牌、读不到留手牌，故需此独立入口。与 PlayedHand 同实体（牌桌）；装配层每次出牌结算时填"未出的手牌"。空=无留手结算。
export interface HeldHand extends Component {
  readonly type: 'HeldHand';
  cards: Card[];
}

// ── poker-hand 评估器配置（REQ-011；Tier3「算法/解释器型机制」大类，与 match3-board/tilemap 同构）──
// Condition→Event→Effect 表达不了"5 张是不是同花顺"这种带计数/排序的算法；本配置 + poker-eval 系统补这格缺口。
// rankingTable = 牌型名→{baseChips, baseMult} 的纯数据表（最弱 LLM 能产；设计可调，不写死在代码）。
// 系统读同实体上的 PlayedHand → 确定性判定最高牌型 → 把基础 chips/mult **set** 进两个 Resource（基础值），
// 再由小丑（effect-apply 的 op:'mul'/order，REQ-012）在其上做修正 → score=chips×mult 与盲注线（condition）比。
// 只算分、不碰渲染、不驱动逻辑外状态。确定性：纯整数/枚举比较与计数，牌型判定是纯函数（有序卡集→稳定输出）。
// 派生事实输出（REQ-011 完善）：poker-eval 把求值器已算出的「包含谓词原语 + 出牌张数」写成 condition 可读的
// Resource/Flag/StringVar，全部**可选、按需配**（配了且目标存在才写）。有了这组原语，"含对子/含三条/含两对/含顺/含同花/
// 含葫芦"等**包含**判定就是 condition 的组合表达（如 rankMaxCount≥2=含对子、and(rankMaxCount≥3,pairCount≥2)=含葫芦），
// 不必为每种牌型写专门 flag。修正「含对子≠最高牌型是对子」（葫芦也含对子）这一真 bug——只看 handTypeVar 会漏触发。
export interface PokerHand extends Component {
  readonly type: 'PokerHand';
  rankingTable: Record<string, { chips: number; mult: number }>; // 牌型名 → 基础分（纯数据表）
  chipsResource: string; // 写基础 chips 的 Resource id（按 id 全局定位）
  multResource: string; // 写基础 mult 的 Resource id
  handTypeVar?: string; // 可选：写**最高**牌型名的 StringVar id（"打出同花顺→某小丑"这类"恰是某型"判定）
  rankMaxCountResource?: string; // 可选：最大同点张数（2=含对子,3=含三条,4=含四条,5=含五条）写入此 Resource
  pairCountResource?: string; // 可选：点数计数≥2 的种数（2=含两对）写入此 Resource
  isStraightFlag?: string; // 可选：是否含顺子写入此 Flag.id
  isFlushFlag?: string; // 可选：是否含同花写入此 Flag.id
  handSizeResource?: string; // 可选：本次出牌张数写入此 Resource（Half Joker「出牌≤3张」等）
  // 判型规则修饰（REQ-E-023⑤）：各值=一个 Flag.id；被动小丑 set-flag 置位后，poker-eval 读它改判定（不引入新牌型）。
  // four_fingers=fourFlush+fourStraight（4 张成同花/顺）；shortcut=gappedStraight（顺子隔1）；smeared=suitMerge（红/黑各算同花）。
  handMods?: { fourFlushFlag?: string; fourStraightFlag?: string; gappedStraightFlag?: string; suitMergeFlag?: string };
}

// ── card-scoring 逐张谓词（REQ-014）── 对"当前计分牌"求值的小词汇表（纯数据，最弱 LLM 可产）。
// 刻意只含卡面属性（花色/点数集合/序号）+ 布尔组合；**不烘焙任何 Balatro 常量**：
//   人头 = rankIn[11,12,13]；偶(Even Steven)=rankIn[2,4,6,8,10]；奇(Odd Todd)=rankIn[3,5,7,9,14]——全由数据表达。
// 与通用 Condition 不同：Condition 读世界 Flag/Resource/State，这里读的是迭代中瞬态的"当前牌"，故是卡域专用谓词。
export type PerCardWhen =
  | { kind: 'always' }
  | { kind: 'suit'; suit: number } // 该牌花色 == suit（0..3）
  | { kind: 'rankIn'; ranks: number[] } // 该牌点数 ∈ ranks（人头/偶/奇/具体点数都用它）
  | { kind: 'index'; eq: number } // 该牌在出牌序列中的序号 == eq（首张=0，供 retrigger/首张型小丑）
  | { kind: 'and'; of: PerCardWhen[] }
  | { kind: 'or'; of: PerCardWhen[] }
  | { kind: 'not'; of: PerCardWhen };

// ── card-scoring 配置（REQ-014；Tier3「算法/解释器型机制」，poker-hand 的逐张伴生件）──
// 挂"牌桌"单例（与 PlayedHand 同实体）：逐张 pass 按序遍历 PlayedHand.cards，对每张（含 retrigger 重复）
// 把该牌 baseChips 累加进 chipsResource。Condition→Event→Effect 是反应式布尔、表达不了"有序迭代 + 逐元素上下文 +
// retrigger 乘性耦合"——正是本能力补的缺口（与 match3-board/poker-hand 同构）。baseChipsByRank 纯数据，引擎不写死。
export interface PerCardScore extends Component {
  readonly type: 'PerCardScore';
  chipsResource: string; // 逐张 baseChips 累加进此 Resource（在 poker-eval set 的牌型基础分之上 add）
  baseChipsByRank: Record<string, number>; // 点数(字符串键)→该牌基础筹码，如 {"10":10,"11":10,"14":11}；缺键=0
}

// ── card-scoring 逐张规则（REQ-014）── 一条逐张小丑 = 一个 PerCardRule 组件（与 effect-apply 的 Effect 同构，
// 每张小丑一个实体）。逐张 pass 遍历每张计分牌，对每条 when 命中当前牌的规则，按 op 改 targetResource（钳上下限）。
// 例：Greedy{when:{kind:'suit',suit:2},op:'add',targetResource:'mult',value:3}（每张♦+3 倍率）。
export interface PerCardRule extends Component {
  readonly type: 'PerCardRule';
  when: PerCardWhen;
  op: 'add' | 'mul';
  targetResource: string;
  value: number;
  // 概率门（REQ-E-023②）：在场则该牌命中 when 后再掷世界 RandomSeed，nextRandom < num/den 才施用（逐张独立 roll，
  // 如 Bloodstone「每张♥ 1/2 概率 ×1.5」）。确定性同 Effect.chance（引擎种子 PRNG，lockstep 安全）。
  chance?: { num: number; den: number };
  // 留手规则（REQ-E-023③）：true=在 held-card-score pass 对**手里没出的牌**求值（如 Baron 留手 K ×1.5、Shoot the Moon 留手 Q +13）；
  // 缺省=在出牌 pass 对出的牌求值（原语义）。两 pass 各按 held 标记取自己的规则，互不重复。
  held?: boolean;
}

// ── card-scoring retrigger（REQ-014）── 重触发规则（Hanging Chad/Red Seal/Mime 折叠于此）。
// when 命中的牌，在逐张 pass 里被额外计分 extra 次（共 1+extra 次）：该牌的 baseChips 与所有命中它的 PerCardRule
// 都随之重复结算——这正是聚合计数表达不了、必须逐张迭代的乘性耦合。例：Hanging Chad{when:{kind:'index',eq:0},extra:2}。
export interface PerCardRetrigger extends Component {
  readonly type: 'PerCardRetrigger';
  when: PerCardWhen; // 哪些牌重触发（如 index==0 = 首张）
  extra: number; // 额外重复次数（Hanging Chad = 2）
}

// ── score-trace（REQ-019）── 逐步计分 trace：计分链各系统按真实执行序 append 每一步，UI 只回放、不重算。
// 通用「分步结算演出」输出（卡牌计分 / 遗物结算 / 伤害分解皆可复用）。**排除出 hashSnapshot**（纯表现输出，同 Camera）。
// opt-in：只有世界存在 ScoreTrace 单例时计分链才记录；非此类玩法零开销。每次计分由首系统(poker-eval)清空重建。
export interface ScoreEvent {
  seq: number; // 步序（= append 时 events 长度，0,1,2…）
  phase: string; // 阶段语义（自由 string：'base'|'percard'|'percard-rule'|'effect'…，保通用复用面）
  target: string; // 本步改的 Resource id（如 'chips'/'mult'/'score'）
  op: 'set' | 'add' | 'mul'; // 本步运算
  value: number; // 本步的量（add 加量 / mul 倍率 / set 值）
  after: number; // 本步后 target 的当前值（供 UI 计数器跳动）
  source?: string; // 语义来源（牌型名 / 'card:<i>' / Effect 实体 id），UI 据它高亮/抖动
}
export interface ScoreTrace extends Component {
  readonly type: 'ScoreTrace';
  events: ScoreEvent[];
}

// ── card-pile（REQ-017）── 牌库/手牌的 sim 内确定性管理（卡牌品类 staple）。
// deck=抽牌堆（预洗好的牌码数组，front=下一张，纯数据→确定性，lockstep 双端同序）；hand=当前手牌；
// handSize=目标手牌数。card-pile 系统：处理 play/discard 输入（按手牌**下标**选牌）+ 抽牌补到 handSize。
// 让"发牌→选→出/弃→补牌"全进 sim（非 React），是回合流程数据状态机化 + lockstep 联机的共同前置。
// 与 card-play(直接喂牌码、无牌库) 的区别：card-pile 是**带牌库的完整出牌管理**（下标选牌 + 自动补牌）。
export interface CardPile extends Component {
  readonly type: 'CardPile';
  owner?: string; // 输入路由 + scoring Flag id（多人各一份 CardPile）
  deck: number[]; // 抽牌堆（牌码 suit*100+rank，预洗好；front=下一张）
  hand: number[]; // 当前手牌（牌码）
  handSize: number; // 目标手牌数（抽牌补到这个数）
  // REQ-F-040(A1)「按数据值分发」最后一环：成交拍把取出的牌码写进该 id 的 Resource（恰取 1 张时；
  // 商店/锦囊/事件卡同形）→ 既有 banded EventWhen{resource eq 码} 即可分发到专属信号。
  playedCodeResource?: string;
  // REQ-F-040(A2) 可负担门：全部代价付得起才执行 play（验→扣→取牌原子在本系统内完成；
  // 付不起则整次 play 不执行、牌不丢——修"card-pile 先取牌、craft-recipe(Commit) 后查钱"的时序硬伤）。
  playCosts?: Array<{ id: string; amount: number }>;
  // REQ-F-041(A) 信号刷新桥：该名 Signal 在场 → 弃全部手牌 + 按 handSize 补满（商店刷新/prep 自动换批）。
  // 配 edge 信号（event-when/clickable 一拍脉冲）；锁店=信号链上游用 Flag 条件挡（EventWhen 重组，零引擎）。
  // 同拍撞上 play/discard 输入则忽略该输入（刷新优先，下标已失效）。
  refreshOnSignal?: string;
  // REQ-F-042(A) 手牌可视化出口：每拍把 hand[i] 牌码镜像进第 i 个 Resource（id 列表；空槽写 0）。
  // banded EventWhen{resource eq 码} 即可驱动每槽 marker 展开/销毁（与 bought_code 买入分发同构）。
  handCodeResources?: string[];
  // REQ-F-042(B) 信号出牌桥：第 i 个名字的 Signal 在场 = play(i)（clickable 槽位按钮→信号→购买）。
  // 每拍至多处理一个（最低下标优先；同拍双击=退化输入）；刷新拍忽略；照常过 playCosts 可负担门。
  playOnSignals?: string[];
  // REQ-F-048② 袋归还：returnOnSignal 在场 → 读 returnCodeResource 的牌码（>0），插回 deck **底部**并清零
  // （有限袋语义保真：卖出的将回袋可再抽）。码由卖出链写入（每将 banded sell Effect set 该资源，纯数据）。
  returnOnSignal?: string;
  returnCodeResource?: string;
}

// ── dice-roll（REQ-GAMED #1）── 骰能力族：声明骰池 → 种子化掷骰 → 结果（供 poker-hand/dice 对掷消费）。
// 「掷一份声明好的骰池」此前无能力（poker-hand 只消费已填好的 PlayedHand，random 原子只给 [0,1)/整数）——
// game-d《骰途》正卡在这缺口（手写 sim + 裸 Math.random）。本组件族补上：骰面/骰池=纯数据（最弱 LLM 可产），
// 掷骰/锁定重掷/结算前禁骰=引擎确定性系统（dice-roll，消费 RandomSeed 整数 PRNG，lockstep/录放安全）。
// 与 poker-hand 同族：RolledDice 结果按 element(→suit)/value(→rank) 映射即可喂 poker-eval 判"骰型"（六色同花等）。

// 一个骰面 = {点数, 可选元素}。element 是无约束 int（六色元素/百搭都是数据编码，非枚举）——与 Card.suit 同哲学。
export interface DiceFace {
  value: number; // 该面点数（任意 int；六面骰=6 项、八面骰=8 项，面数任意）
  element?: number; // 可选：该面元素/花色编码（如六色 0..5；映射到 Card.suit 判同花）。缺省=无元素
}
// 一颗骰的声明 = 它的面集（有序，faceIndex 即此数组下标）。
export interface DieSpec {
  faces: DiceFace[]; // 骰面数组；掷骰=在 [0, faces.length) 内确定性取一个下标
}
// 一颗骰的掷出结果（由 dice-roll 系统写；faceIndex=命中的面下标，可回放校验）。
export interface RolledDie {
  value: number; // 命中面的点数
  element?: number; // 命中面的元素（面无 element 则缺省）
  faceIndex: number; // 命中的面在 DieSpec.faces 中的下标（确定性审计/重放）
  // 结算前过滤（DicePool.ban）标记：true=本颗被禁（highest/lowest N）。**保留在 results 中不移出**——
  // 保持与 dice/locked 的下标对齐（重掷锁定掩码按下标寻址，移出会错位）；消费方（映射成 PlayedHand 时）自行剔除 banned。
  banned?: boolean;
}

// ── DicePool（config）── 声明一份骰池 + 触发/锁定/禁骰规则。挂"骰盅"实体，配 RandomSeed（世界单例 PRNG）。
export interface DicePool extends Component {
  readonly type: 'DicePool';
  dice: DieSpec[]; // 骰池：每颗骰声明自己的面集（面数任意）
  // 触发：收到名为 rollOnSignal 的 Signal 当拍掷骰（惯例同 caster.onSignal / card-pile.*OnSignal）。
  // 缺省/无此信号 → 本拍不掷（数据驱动、确定性；绝不每帧自动掷）。
  rollOnSignal?: string;
  // 重掷锁定掩码：这些下标的骰**不重掷**，保留上一次 RolledDice 对应下标的结果（首掷时无前值 → 照常掷）。
  // 「只重掷未锁骰」= 掷骰爽感核（骰子游戏保留好骰、重掷坏骰）。
  locked?: number[];
  // 结算前禁骰（REQ-GAMED #4 并入本能力）：掷完后按 kind 标记 n 颗为 banned（不移出 results，保下标对齐）。
  //   'banHighest'=禁最高的 n 颗、'banLowest'=禁最低的 n 颗（按 value；同值按下标升序，确定性）。
  //   n≥骰数 → 全禁；n≤0 → 不禁。敌"反制禁骰"由 foe 数据驱动这两字段（非游戏层代码）。
  ban?: { kind: 'banHighest' | 'banLowest'; n: number };
}
// ── RolledDice（event）── 骰池的掷出结果（有序，下标与 DicePool.dice 一一对齐）。由 dice-roll 系统写，
// 早于任何消费（poker-eval / 对掷判定）。空=本拍未掷。
export interface RolledDice extends Component {
  readonly type: 'RolledDice';
  results: RolledDie[];
}

// ── slot-payout（t3-slot-payout·REQ-K 下沉）── 网格连线赔付 + 老虎机经济（确定性解释器）─────
// 真缺口：dice-roll 只掷出符号网格（RolledDice），random 原子只给 [0,1)；没有「按 20 条线左起连消
// （百搭代入）+ 分散计数 → 查赔付表 → 记账下注/赢分/免费旋转」的能力。line-eval 是带**有序线扫描 +
// 前缀连数 + 百搭代入**的算法，Condition→Event→Effect / 聚合计数都表达不了——正是周期表缺的「Line-Eval」格。
// 通用性：任何老虎机 / 连线消除 / 连珠计分都消费它（非 game-k 专属）。确定性：纯整数扫描，不掷随机（随机在 dice-roll）。
// 分工（严守 manifesto）：掷轮=dice-roll(RolledDice)；触发哪拍结算=Signal(clickable/keybind 重组)；
//   下注/赢分/余额=Resource；免费旋转态=Resource(freeResource>0)。本能力只补「判线赔付 + 老虎机记账」真缺口。
export interface SlotMachine extends Component {
  readonly type: 'SlotMachine';
  source: EntityId;        // 持 RolledDice 的实体（轮结果来源）
  reels: number;           // 列数（轮数）
  rows: number;            // 行数（每轮可见格）
  // 赔付线：每条 = 每轮的行号(0..rows-1)，长度 = reels，左→右。
  lines: number[][];
  // 赔付表：symbolId(字符串键) → { 连数(3/4/5 字符串键) → 线注倍率 }。
  pay: Record<string, Record<string, number>>;
  wild: number;            // 百搭符号 value（代入除分散外任意符号）
  scatter: number;         // 分散符号 value（任意位置计数）
  scatterMin: number;      // 触发分散赔付/免费旋转的最少命中数（通常 3）
  scatterPay: Record<string, number>; // 命中数(字符串键) → 总注倍率
  spinSignal: string;      // 收到此信号当拍解算一次旋转（与 dice-roll 同拍·读后于其）
  betResource: string;     // 总注资源 id
  balanceResource: string; // 余额资源 id（扣注 / 记赢）
  winResource?: string;    // 可选：写入本旋总赢（HUD「上次赢」）
  // 免费旋转经济（可选）：freeResource>0 时本旋不扣注、线赢×freeMultiplier；≥scatterMin 分散则 +freeAward。
  freeResource?: string;
  freeAward?: number;
  freeMultiplier?: number;
  // 下注升降（可选·数据驱动）：收到信号时按 betStep 调 betResource，钳制 [betMin,betMax]。
  betUpSignal?: string;
  betDownSignal?: string;
  betStep?: number;
  betMin?: number;
  betMax?: number;
}
// ── LineWins（event）── 一次旋转的结算结果（供 HUD/演出层 outcome-first 投影）。由 slot-payout 写在机器实体上。
export interface LineWin { line: number; symbol: number; count: number; pay: number; }
export interface LineWins extends Component {
  readonly type: 'LineWins';
  spin: number;            // 结算序号（每解算一次 +1；宿主据此识别新结果）
  total: number;           // 本旋总赢（线赢×倍率 + 分散赢）
  scatterCount: number;    // 分散命中数
  triggeredFree: number;   // 本旋触发/再触发赠送的免费旋转数（0=未触发）
  wins: LineWin[];         // 各中奖线
}

// ── block-grid ── 方块网格棋盘机制（REQ-CAP-block-grid）：多格 polyomino 落点判定 + 整行整列消除 +
// 无子可落判负。Condition→Event→Effect 表达不了这类「多格落点合法性 + 网格扫描消除」算法；t2-drag-place
// 只吸附六边格、t3-match3-board 是交换/三连/重力的正交规则——Block Blast/Woodoku/俄罗斯方块类的通用缺口。
// 确定性：整数网格 + RandomSeed 整数 PRNG 补托盘。视图复用 match3 的 BoardCell（据 cells 写 Color.tint）。

// 形状定义（polyomino·非组件·被 BlockGrid.shapes 持有的纯数据，如 Card 之于 PlayedHand）。
// cells = 扁平相对偏移 [dc0,dr0,dc1,dr1,…]（锚点为 (0,0)，向右下为正）；tint = 落子后底色。
export interface BlockShapeDef {
  id: string;
  cells: number[];
  tint?: number;
}

// 棋盘单例：占位网格 + 形状目录 + 托盘 + 计分/判负配置。cells 长 cols*rows，-1=空、≥0=已填（值=底色 tint）。
export interface BlockGrid extends Component {
  readonly type: 'BlockGrid';
  cols: number;
  rows: number;
  cells: number[];
  shapes: BlockShapeDef[];
  tray: number[];              // shapes 下标数组，-1=该槽已用空
  traySize: number;            // 托盘槽数（全空时确定性补这么多个）
  scoreResource?: string;      // 计分 Resource id（空=不计分）
  cellScore?: number;          // 每落一格给的分
  lineScore?: number;          // 每清一行/列给的分
  gameOverFlag?: string;       // 判负 Flag id（托盘全形状无处可落时置真；空=不判负）
  fillTint?: number;           // 可选·已填格视图底色（cells 值为占位 1 时用）
  emptyTint?: number;          // 可选·空格视图底色
  // ── 方形网格像素几何（grid-drag-square 输入桥用·像素↔格；缺省=无几何，走点击/测试直接写意图）──
  originX?: number;            // 格 (0,0) 中心的世界 x
  originY?: number;            // 格 (0,0) 中心的世界 y
  cellSize?: number;           // 单格边长（世界像素）
}

// 放置意图（Intent·一次性被 block-place 消费）：把 tray[slot] 的形状落到锚点 (col,row)。
// 由 grid-drag-square 输入桥 / 点击 / 测试产生——本能力只判定+结算，不管拖拽输入。
export interface PlaceBlockIntent extends Component {
  readonly type: 'PlaceBlockIntent';
  slot: number;
  col: number;
  row: number;
}

// ── grid-drag-square 托盘块 ── 把一个可拖拽的托盘形状实体绑到 (棋盘, 槽位)。蓝图静态建（Transform+Shape 命中体）。
// grid-drag-square 命中 drag 起点所在的托盘块 → 取 slot；drag 终点吸附方格 → 写 PlaceBlockIntent{slot,col,row}。
export interface BlockTrayPiece extends Component {
  readonly type: 'BlockTrayPiece';
  boardId: EntityId;   // 所属 BlockGrid 实体 id（取其像素几何做吸附）
  slot: number;        // 对应 BlockGrid.tray 的槽下标
}
