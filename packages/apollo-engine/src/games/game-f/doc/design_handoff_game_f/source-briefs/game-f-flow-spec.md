# Game F《像素三分天下》对局流转规范（Flow Spec）—— 程序员开发的单一真相

> 作者：策划（PF，本 session）｜ 2026-06-10 ｜ 基于真实金铲铲/TFT 对局研究 + 引擎现有词汇
> **v2（2026-06-10 晚，用户拍板「严格按照金铲铲设计」）**：对齐基准 = **`game-f-tft-reference.md`**（用户提供的金铲铲流程图全文转录）。
> 本版变更：§2 裁决表按准则重裁（野怪/选秀/连败金/小小英雄收回）、§4.2 伤害公式改准则版、§4.6 商店/备战席/升星细则、新增 §4.7 主角与法球拾取、§5 路线 v2。
> **这份文档回答一个问题：一局游戏从头到尾怎么流转。** 所有 game-f 的流程/数值开发以本文为准；
> 能力映射与缺口评审见 `game-f-auto-chess.md`（§3/§6 仍有效）；本文 §6 是对当前实现的符合性审查。
> 宪法：`docs/design/data-driven-manifesto.md` —— 下面每一张表、每一台状态机都是**数据**，不是代码。

---

## 〇、怎么读（按角色）

- **看全局流程**：就看下面 **§〇.5 一图流**（对齐准则流程图的结构，标实现状态）。
- **程序员**：直接看 §3（三层流转状态机）+ §4（数值表）+ §6（差距与开发队列）。§3 的每台机就是一份 `GameFlow` 数据 + 一张全局 id 注册表。
- **Lead/主程**：§5 阶段路线（哪个阶段还哪笔债）+ `requests.md` REQ-F-032（本文唯一新增的引擎需求，候选两路待裁）。
- **策划同侪**：**准则 `game-f-tft-reference.md`**（用户提供金铲铲流程图全转录，v2 对齐基准）+ §1 研究结论 + §2 改编裁决（v2 重裁）。

---

## 〇.5、一图流（v2 全局流程，对齐准则；✅=已实现 ⬜N=路线第 N 段待接）

```
                                    ┌──────────────────────────────────────────────┐
  游戏开始 ──▶ 强化符文三选一 ✅(经济三符,回合1备战期点选,整组一次性) ──▶│            即将开始下个回合（大循环）          │◀────────────┐
                                    └──────────────────┬───────────────────────────┘             │
 ╔════════ 准备阶段 prep ✅（玩家档 30s 倒计时兜底+ready键✅；测试走快速档参数）════════╗             │
 ║ 回合数+1✅ 棋子满状态重展开✅(deploy,关卡表选敌阵✅)                                ║             │
 ║ 经济：基础收入✅ 利息✅ 连胜金✅ 连败金⬜MVP-1                                      ║             │
 ║ 商店：自动刷新✅ 2金手动刷✅ 锁店(门判定拍自动解锁)✅ 买棋子→备战席9格✅(e4c91db/248ca4d)  ║
 ║   商店5槽可视化+点击购买✅(F-14 两段脉冲重铺) 金币/回合等六数字HUD✅(F-15 text-binding)        ║             │
 ║ 经验：买经验4金→等级=人口上限 ⬜MVP-1尾                                            ║             │
 ║ 装备：分配/拆卸器回收 ⬜4（静态预配装备✅）                                         ║             │
 ║ 摆阵：上场/回备战席/调位(场上≤人口)⬜ 卖棋子按星级返金⬜                             ║             │
 ║ 合成：3同名自动连锁升星,封顶三星(含备战席) ⬜2                                      ║             │
 ╚══════════════════════════════════════┬═══════════════════════════════════════════╝             │
                          入战检查拍：超员且席满→自动出售 ⬜MVP-1尾                                  │
                                         ▼                                                        │
 ╔══════════ 自动战斗 combat ✅（羁绊开战拍锁定✅蜀魂×1.2 最小版；战斗期可买/刷/卖✅,不可摆⬜18）═══╗             │
 ║   回合种类（按关卡表）：                                                            ║            │
 ║   ├─ 普通回合 ──▶ 对战剧本敌阵 ✅（阶段2董卓/3吕布/4官渡/5赤壁Boss 全五阶段✅）        ║            │
 ║   ├─ 野怪回合 ✅（阶段1全部+各阶段r5；黄巾波次5档强度；死亡掉法球💰,未拾随结算清）     ║            │
 ║   └─ 选秀回合 ⬜3.5（单人版九选一：棋子/装备）                                      ║            │
 ║   战斗涌现链 ✅：索敌→六角A*走位(滑行✅)→普攻→攒蓝→大招(DoT/冰冻✅)→死亡级联✅       ║            │
 ║   终止：一方团灭 ✅ ｜ 30s+15s加时强制结束 ✅（单人改编=按败方路径结算,combat_clock）  ║            │
 ║   🧍 主角(小小英雄) ✅可控·碰球拾取→金币入账✅(044 consumeOnHit,单发两清)               ║            │
 ╚══════════════════════════════════════┬═══════════════════════════════════════════╝            │
                                         ▼                                                        │
 ┌──────────── 结算 resolution ✅ ────────────┐                                                    │
 │ 胜→连胜+1✅  败→连胜清零✅+玩家扣血✅        │                                                    │
 │   伤害=阶段基础+剩余棋子×星级权重(权重⬜3)   │                                                    │
 │ 清场 wipe✅(棋子+挂件级联,槽位/阵容持久)     │                                                    │
 └──────┬─────────────────────┬──────────────┘                                                    │
        │ player_hp ≤ 0       │ 关卡表打穿(stage>上限)                  │ 否则                     │
        ▼                     ▼                                        └──────────────────────────┘
   ❌ 败局 gameover ✅      🏆 通关 victory ✅
```

> 本图与 §3 状态机一一对应（图框=flow 状态/armed 窗，图边=transitions）；⬜ 编号 = §5 路线段。改流程=改 §3 数据+本图同步。

---

## 一、研究结论：真·金铲铲（TFT）的对局骨架

> 来源：League wiki / lolchess / op.gg / metatft / TFT Ninja 等（链接见本节末）。已交叉核对；具体数值随赛季微调，**结构稳定**。

### 1.1 三层结构：局（Run）→ 阶段（Stage）→ 回合（Round）

- 一局 8 人，互相淘汰，活到最后。一局 ≈ 30–40 分钟，跨 5–7 个阶段。
- **阶段 1 特殊（教学/起步）**：`1-1` 选秀（所有人从转盘选免费英雄）；`1-2`～`1-4` 打野怪（PvE 小兵，掉金币/装备散件）。
- **阶段 2 起每阶段 7 个回合，模式固定**：
  `X-1 X-2 X-3` PvP → `X-4` **选秀**（血量低的先选）→ `X-5 X-6` PvP → `X-7` **野怪**（克格/狼/雷恐鸟/龙等，掉装备）。
- 回合种类只有三种：**PvP 对战 / 选秀（Carousel）/ 野怪（PvE）**。

### 1.2 单个回合内：备战 → 战斗 → 结算

- **备战（Planning）约 30 秒**：自动发钱（基础收入+利息+连胜金）→ 商店自动刷新 5 张 → 玩家买人/卖人/刷商店（2金）/买经验（4金）/拖子摆阵。
- **战斗（Combat）上限约 40 秒**：双方棋子**全自动**索敌、走位、普攻攒蓝、蓝满放大招；一方团灭即止；超时进入加速/按存活判定。
- **结算（Resolution）**：败方玩家扣血 = **阶段基础伤害 + 存活敌方单位数×1**（星级无关）；更新连胜/连败；血≤0 当场淘汰。

### 1.3 核心子系统（与流转强耦合的五件）

| 子系统 | 规则（结构稳定，数值随赛季） |
|---|---|
| **经济** | 基础收入逐回合爬坡到 5 金封顶（约 2/2/3/4/5…）；**利息** = ⌊存款/10⌋，上限 +5；**连胜金** 2–3连+1 / 4连+2 / 5+连+3（连败同形）。 |
| **商店** | 5 个槽；刷新 2 金；**买经验 4 金 = 4 XP**；每回合自动 +2 XP；**等级 = 上场人数上限**；各费用卡出现概率按等级查表；全场共享**有限卡池**（按费用每种 N 张）。 |
| **升星** | 3 张同名 1 星 → 自动合成 2 星；3 个 2 星 → 3 星。属性倍率约 HP×1.8、伤害×1.5 每星。 |
| **羁绊** | 按**场上**单位的势力/职业计数，达阈值激活层级效果；**开战那一拍锁定**，战斗中死人不掉羁绊。 |
| **装备** | 野怪掉散件、选秀携带；散件+散件=成装；装备给单位静态/触发属性。 |

> 来源：
> [League wiki · TFT](https://leagueoflegends.fandom.com/wiki/Teamfight_Tactics_(game)) ·
> [lolchess · Rounds](https://lolchess.gg/guide/rounds?hl=en-US) ·
> [op.gg · Round Guides](https://op.gg/tft/game-guide/rounds) ·
> [TFT Ninja · Stages](https://tft.ninja/guides/game-mechanics/stages) ·
> [metatft · Economy](https://www.metatft.com/guides/tft-economy-guide) ·
> [metatft · Shop Odds](https://www.metatft.com/tables/shop-odds) ·
> [op.gg · Damage Formula](https://op.gg/tft/game-guide/damage-formula) ·
> [Esports Tales · PvE drops](https://www.esportstales.com/teamfight-tactics/item-and-gold-drop-rate-by-pve-round)

---

## 二、PvE 改编裁决（v2 · 按准则重裁——「严格金铲铲」，唯一系统性替换 = 单人化）

立项已定**单人 PvE 优先**（绕开跨端浮点确定性，见设计稿 §〇）。**v2 用户拍板**：除"真人对手"维度外严格照金铲铲（准则=`game-f-tft-reference.md`），此前以工作量为由砍/押后的准则内要素全部**收回入路线**（排期见 §5）：

| 金铲铲要素（准则 §一/§二） | v2 裁决 | 说明 |
|---|---|---|
| 8 人对战/匹配 | **改**：剧本敌阵关卡表（唯一系统性替换） | 单人 PvE 定义；敌阵=数据与我方同构 |
| PvP 回合 | **留** ✅ 已落 | 核心循环 |
| **野怪回合**（阶段1×4回合 + 每阶段末回合；**掉法球**） | **收回，Phase 2.5**（原 Phase 4） | 用户点名（主角捡掉落）；野怪=敌阵数据+掉落表，结构已通 |
| **选秀**（开局**强化符文三选一** + 选秀回合棋子/装备） | **收回，Phase 3.5**（单人化=九选一，无争抢；原"押后/砍"） | 用户拍板严格金铲铲；"血少先选"在单人下无意义项删除 |
| 备战 30s + 玩家确认 | ready 键已落 ✅ + 40 拍倒计时兜底（金铲铲本体也是倒计时） | 双门并存=准则形 |
| 战斗 30s + **加时 15s 强制双伤** | **收回**：时限=数据参数；超时双方各按对方存活棋子受伤 | 准则 §一.4；防极端配置保险丝 |
| 经济（基础收入/利息/**连胜与连败奖励**） | 收入/利息/连胜 ✅ 已落；**连败金收回 MVP-1 补**（原押后） | 准则 P2 明示连败奖励 |
| 商店五件套（5槽/2金刷/**锁店**/买入→**备战席9**/卖出按等级返还） | **细则化 MVP-1**（§4.6；锁店/备战席/卖价/超员自动卖均准则硬性） | 唯一引擎缺口=REQ-F-040（待主程） |
| 等级=人口上限 / 买经验 / **超员且席满自动出售** | **留**，细则进 §4.3/§4.6 | 准则 P5/§一.3 |
| **升星**（3 同名自动合成、含备战席+棋盘连锁、**封顶三星**） | **留，Phase 2**（REQ-021/035/036 已就绪，F-9 迁移后接） | 准则 P9 |
| 羁绊（**开战拍激活锁定**） | **留，Phase 3**（REQ-022 done） | 准则 §一.4 原文"战斗开始时自动激活" |
| 装备（分配/**拆卸器回收**/野怪掉散件/合成） | 静态装备 ✅ 已落；分配/回收/掉落合成 **Phase 4→部分随 Phase 2.5 掉落先行** | 准则 P6 |
| **小小英雄（主角）**：承载玩家血量、场上可控、**拾取法球/宝箱** | **新增收回，Phase 2.5**（用户点名）；§4.7 数据映射 | 准则 §一.6 |
| 玩家伤害公式 | **改准则版**：阶段基础 + Σ对方剩余棋子×**星级权重表**；加时双伤同式 | §4.2（权重全 1 即现代口径，数据可调） |
| 淘汰/胜利 | **改**：血≤0 败局；打穿关卡表=通关（单人终点） | 不变 |
| 排位积分/段位/公示等待 | **砍**（纯多人社交层，单人无对象） | 准则 §三 既定 |

> **v2 的一局**：开局符文三选一 → 跨 5 阶段（每阶段 5 回合：1-4 野怪/PvP 按关卡表、第 5 回合野怪，穿插选秀）→ 每回合 备战(全套商店操作+摆阵+ready)→战斗(全自动,羁绊开战锁定)→结算(伤害/经济) → 打穿=通关、血尽=败局。

---

## 三、权威流转（给程序员）：三层状态机，全部是 `GameFlow` 数据

> 引擎词汇：`flow`（REQ-020，states/onEnter/transitions{when,after,to,do}）+ `EventWhen/Effect/Zone/card-pile/craft-recipe`。
> 流程读写的一切都是**全局单例** id（flow 链对单例完美，见设计稿 §2 注）；棋子内部链用**每实例作用域**（REQ-021 已 done）或 MVP 唯一 id。

### 3.1 全局 id 注册表（防串台的宪法级纪律：新增 id 必须先登记在这）

| id | 类型 | 含义 | 写者 → 读者 |
|---|---|---|---|
| `gold` | Resource 0..999 | 玩家金币 | flow/利息/连胜 → 商店/买经验 |
| `player_hp` | Resource 0..100 | 玩家血量 | 结算 → run 终止判定 |
| `xp` / `level` | Resource | 经验 / 等级（=上场人数上限） | 买经验/回合+2 → 商店概率/摆子约束 |
| `win_streak` | Resource | 当前连胜数 | 结算 → 连胜金 banded |
| `stage_idx` / `round_idx` | Resource | 当前阶段 / 回合序号（关卡表指针） | run 流程 → 敌阵装载/伤害公式 |
| `in_combat` | Flag | 战斗进行中（门控普攻/攒蓝） | round 流程 → 棋子 EventWhen |
| `ready` | Flag | 玩家点了「开战」 | 输入 → round 流程 prep 转移 |
| `team_a_present` / `team_b_present` | Flag | 两队还有人（Zone 写） | zone-occupancy → combat 转移 |
| `won` | Flag | 本回合胜负 | round 流程 → 结算分支 |
| `round_done` / `run_over` / `run_won` | Flag | 回合完 / 败局 / 通关 | round ↔ run 两台机的握手 |
| `mp_<棋子实例>` / `atk_<实例>` / `ult_<实例>` | Resource/信号 | 棋子蓝条/普攻/大招（**每实例唯一**或 self 作用域） | 棋子内部闭环 |
| `deploy_armed` / `wipe_armed` | Flag | 展开/清场触发臂（flow onEnter 置位，edge 纪律：下一相位复位） | round 流程 → EventWhen(edge) |
| `deploy` / `deploy_stage_<N>` | 信号 | 我方/第 N 阶段敌方阵容展开（单拍） | EventWhen → 槽位 Caster |
| `wipe` | 信号 | 清场（单拍） | EventWhen → destroy-tagged Effect×2 |
| `income_armed` / `dmg_armed` | Flag | §4.1 收入结算窗（prep 臂）/ §4.2 败方伤害结算窗（败方转移臂） | round 流程 → bands |
| `income_*` / `interest_*` / `streak_*` / `dmg_stage_*` | 信号 | §4.1/§4.2 banded 结算（每窗每带至多一发） | EventWhen → Effect(gold/player_hp) |
| `stage_up` | 信号 | round_idx>5 进位（stage_idx+1、round_idx=1） | EventWhen → Effect×2 |
| `ready_btn` | 信号 | 点「开战」按钮（指针命中，单拍） | clickable → Effect(set-flag ready) |
| `bought_code` | Resource 0..9999 | 最近一次商店成交的英雄码（0=无，买后复位防二连买失效） | card-pile(playedCodeResource) → buy_* bands |
| `bench_space` | Resource 0..9 | 备战席余位（playCosts 第二货币：席满=0 原子拒单；卖出 +1 归还） | card-pile 扣 ↔ 卖出还 |
| `buy_<将>` | 信号 | 据码分发的买入信号（单拍） | EventWhen(bought_code eq 码) → buycast + 复位 |
| `shop` | Flag | card-pile 出牌脉冲（契约自带，owner 同名） | card-pile 内部 |
| `shop_refresh` / `shop_refresh_armed` / `shop_gate_done` | 信号/Flag/信号 | 商店刷新（auto=prep 臂；manual=$2）与门判定脉冲（先判后拆） | flow/按钮 → card-pile.refreshOnSignal |
| `shop_locked` / `lock_btn` / `unlock_btn` | Flag/信号 | 锁店（锁=跳过下个 prep 自动刷新一次，门判定拍自动解锁） | 按钮 → Effect ↔ 刷新门 |
| `reroll_btn` / `reroll_paid` | 信号/Flag | 手动刷新 $2（craft-recipe 原子扣金，付讫旗→shop_refresh） | 按钮 → craft-recipe → EventWhen |
| `sell_seat` | 信号 | 点席卖出（source=被点席位 → '@signal-source' 点谁卖谁） | clickable → destroy+返还 Effects |
| `shop_slot_1..5` / `buy_slot_1..5` | Resource/信号 | 商店 5 槽手牌码镜像（F-042 终态）/ 点卡购买 | card-pile ↔ 面板带/playOnSignals |
| `shop_marks_armed` / `shop_marks2_armed` / `shop_marks` / `shop_marks2` | Flag/信号 | 面板两段脉冲（T+1 整槽清 / T+2 按码重铺，错拍防同拍误杀） | 刷新/买入 → destroy-tagged/重铺带 |
| `round_ui` | State | 相位镜像（prep/combat/resolution/gameover），横幅/未来 UI 读 | round 流程 set-state → state 叶 |
| `ph_*` 信号 / `buyxp_btn` / `lose_streak` / `deploy_pve_<N>` / `ot_reset` / `combat_clock` | 信号/Resource/Timer | 横幅切换 / 买经验 / 连败 / 野怪分流 / 加时钟 | 各对应链 |

### 3.2 L1 · Run 流程（局）：`run_flow` 实体一台机

```jsonc
"GameFlow": { "id": "run", "current": "boot", "states": [
  { "id": "boot",        // 开局：初始化资源（gold=0,hp=100,level=1,关卡指针=1-1），发首回合
    "onEnter": [ /* set 初值… */ ],
    "transitions": [ { "when": { "kind": "always" }, "to": "round" } ] },
  { "id": "round",       // 把控制权交给 L2 round_flow（其打完写 round_done）
    "onEnter": [ { "kind": "set-flag", "targetId": "round_done", "value": false } ],
    "transitions": [
      { "when": { "kind": "flag", "id": "run_over", "equals": true },  "to": "defeat"  },   // 血≤0（L2 写）
      { "when": { "kind": "and", "of": [ { "kind": "flag", "id": "round_done", "equals": true },
                                          { "kind": "resource", "id": "stage_idx", "cmp": "gt", "value": 5 } ] },
        "to": "victory" },                                                                   // 打穿关卡表
      { "when": { "kind": "flag", "id": "round_done", "equals": true }, "to": "advance" } ] },
  { "id": "advance",     // 推进关卡指针（round_idx+1；满 5 则 stage_idx+1、round_idx=1），回到 round
    "onEnter": [ { "kind": "modify-resource", "targetId": "round_idx", "op": "add", "value": 1 } /* 进位由 banded EventWhen 处理 */ ],
    "transitions": [ { "when": { "kind": "always" }, "to": "round" } ] },
  { "id": "victory", "onEnter": [ { "kind": "set-flag", "targetId": "run_won", "value": true } ] },
  { "id": "defeat" } ] }
```

### 3.3 L2 · Round 流程（回合）：`round_flow` 实体一台机 —— **开发主战场**

```jsonc
"GameFlow": { "id": "round", "current": "prep", "states": [
  { "id": "prep",        // 备战：① 发基础收入(查表 stage/round) ② 触发利息 banded ③ 触发连胜金 banded
                          //      ④ 商店刷新(发 shop_refresh 信号→card-pile 补满 5 槽) ⑤ 重置 ready
                          //      ⑥ 【REQ-F-032】按阵容/关卡表展开 我方+敌方 棋子实例（满血满蓝，站到各自 HexPos）
    "onEnter": [ /* …上述全是 set-flag/modify-resource/发信号的数据动作… */ ],
    "transitions": [ { "when": { "kind": "flag", "id": "ready", "equals": true }, "to": "combat",
                      "do": [ { "kind": "set-flag", "targetId": "in_combat", "value": true }
                              /* + 羁绊锁存信号（Phase 3：group-count 在此拍算一次） */ ] } ] },
  { "id": "combat",      // 战斗：全自动（涌现链见 §3.4）。终止 = 任一队 present flag 落 false。
    "transitions": [
      { "when": { "kind": "flag", "id": "team_b_present", "equals": false }, "to": "resolution",
        "do": [ { "kind": "set-flag", "targetId": "won", "value": true } ] },
      { "when": { "kind": "flag", "id": "team_a_present", "equals": false }, "to": "resolution",
        "do": [ { "kind": "set-flag", "targetId": "won", "value": false } ] } ] },
  { "id": "resolution",  // 结算：胜→连胜+1；败→连胜清零 + 扣血（阶段基础伤+存活敌数；存活数=Phase 内用
                          //      REQ-022 group-count 读，MVP-1 先用固定伤害表近似）。清场（销毁本回合战斗实例）。
    "onEnter": [ { "kind": "set-flag", "targetId": "in_combat", "value": false } /* + 结算账本动作 */ ],
    "transitions": [
      { "when": { "kind": "resource", "id": "player_hp", "cmp": "lte", "value": 0 }, "to": "gameover" },
      { "when": { "kind": "always" }, "after": 60, "to": "done" } ] },
  { "id": "done",        // 通知 L1（round_done），自身回 prep 等下一回合
    "onEnter": [ { "kind": "set-flag", "targetId": "round_done", "value": true } ],
    "transitions": [ { "when": { "kind": "flag", "id": "round_done", "equals": false }, "to": "prep" } ] }, // L1 重臂后回跳
  { "id": "gameover", "onEnter": [ { "kind": "set-flag", "targetId": "run_over", "value": true } ] } ] }
```

**prep 期玩家可用操作（输入域，全部=信号/命令，不是 UI 代码）**：

| 操作 | 数据通路（现有词汇） |
|---|---|
| 买人（点商店槽 i） | `buy_slot` 信号 + 下标 → `card-pile` play(i) 同拍 `craft-recipe` 扣卡价（设计稿 §4.5 原样） |
| 刷商店 | `reroll` 信号 → `craft-recipe` 扣 2 金 + `card-pile` 弃手补 5 |
| 买经验 | `buy_xp` 信号 → `craft-recipe` 扣 4 金 + `Effect` xp+4（升级=banded EventWhen 读 xp 阈值表写 level） |
| 卖人 | `sell_<实例>` → 按等级返金（§4.6 卖价表）+ 销毁实例、归还卡池（Phase 2 与升星一起做） |
| 锁店 | `lock_shop` 信号 → 翻转 `shop_locked` Flag；prep 刷新动作以 `shop_locked==false` 为门；**每回合 prep 自动解锁**（onEnter set false 在刷新门判定之后，次序注意） |
| 摆子 | 拖拽写棋子 `HexPos`（约束：场上数 ≤ `level`，约束执行点交主程；**超员且备战席满→自动出售**=入战检查拍 banded） |
| 开战 | `ready` Flag 置 true（✅ 已落：clickable→`ready_btn`→set-flag） |

> **相位可用性（准则 §一.4）**：买/刷/卖/锁店 **prep 与 combat 期均可用**；摆子/移回备战席 **仅 prep**。实现=操作信号的 Effect 加相位门（combat 期摆子信号无效化）。

### 3.4 L3 · Combat 内（已实现 ✅，参考实现 = `src/games/game-f/blueprint.ts`）

战斗内**没有状态机**，是涌现链（一拍不差地已在跑，5 个 vitest 盖住）：

```
aggro(锁最近敌) → grid-move(六角 A* 逐格走) → loop Timer(攻速) → EventWhen(timer∧in_combat, edge)
→ 唯一信号 → Caster(at:'target') → 打击区 prefab → overlap→trigger-zone→hitbox(扣血/DoT)
→ Effect 攒蓝 → 蓝满 EventWhen → 大招 Caster → mortal(hp≤0 销毁) → hierarchy-cascade(名牌随死)
→ Zone 数存活 → present flag → (回到 L2 combat 转移)
```

**纪律**：战斗实例的 mana/timer/信号 id 必须每实例唯一（MVP 法）或挂 self 作用域（REQ-021 已 done，Phase 2 起用）；
`in_combat` 门控普攻/攒蓝（备战/结算期不动手）—— 已实现。

---

## 四、数值表（初版基线，全部可调 TUNE；改数值=改这几张表，不碰任何逻辑）

### 4.1 经济

| 项 | 值 |
|---|---|
| 基础收入（按回合全局序 1,2,3,4,≥5） | 2, 2, 3, 4, 5 金 |
| 利息 | ⌊gold/10⌋，上限 +5（= 5 条 banded EventWhen，设计稿 §4.4 原样） |
| 连胜金 | 2–3 连 +1；4 连 +2；5+ 连 +3（banded 读 `win_streak`） |
| 刷商店 / 买经验 | 2 金 / 4 金（=4 XP） |

### 4.2 玩家伤害（结算，败方；v2 准则版）

**公式**：`伤害 = 阶段基础 + Σ(对方剩余棋子 × 星级权重)`；**加时(15s)未分胜负 → 强制结束，双方各按对方存活棋子计伤**（同式）。

| 阶段基础 | 1 / 2 / 3 / 4 / 5 = 0 / 2 / 5 / 8 / 10 |
|---|---|
| **星级权重** | 1星=1 / 2星=2 / 3星=3（TUNE；全 1 即退化为现代 TFT 口径） |

> 现实现为"存活近似 2"占位；真存活数+星级权重 = Phase 3 接 REQ-022 group-count（按星级 Tag 位分别计数）后换表。

### 4.3 等级与经验（等级 = 上场人数上限；每回合自动 +2 XP）

| 升到 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|
| 需 XP | 2 | 6 | 10 | 20 | 36 | 56 | 80 |

### 4.4 商店概率（按等级，行和=100%；卡池：1费×12 / 2费×8 / 3费×6 张每种）

| 等级 | 1费 | 2费 | 3费 |
|---|---|---|---|
| 1–2 | 100 | 0 | 0 |
| 3 | 75 | 25 | 0 |
| 4 | 55 | 35 | 10 |
| 5 | 40 | 40 | 20 |
| 6+ | 25 | 45 | 30 |

> MVP 实现形态（设计稿 §7 既定）：**按等级预洗权重牌袋**（升级=切换 card-pile 的 deck 数据），不做运行时加权抽样。

### 4.5 关卡表（Run 的脊柱：5 阶段 × 5 回合 = 25 回合，敌阵=数据）

| 阶段 | 敌阵规模与强度 | 主题（剧本敌阵，三国感） |
|---|---|---|
| 1 | 2–3 子，弱（教学） | 黄巾散兵 |
| 2 | 3–4 子 + 1 件装 | 董卓先锋 |
| 3 | 4–5 子 + 2 星点缀 | 吕布陷阵 |
| 4 | 5–6 子 + 羁绊成型 | 官渡精锐 |
| 5 | 7–8 子 + Boss 单位 | 赤壁决战（终关） |

> 敌阵条目 = `{ heroes: [{ 模板, 星级, HexPos, items }], 掉落? }` —— 与我方棋子**同构**，最弱 LLM 能填。

### 4.6 商店 · 备战席 · 升星 · 卖价（v2 准则细则，MVP-1/Phase 2 实现基准）

- **备战席**：**9 槽**（槽位实体，与上场槽同构、无 HexPos 上场标记）；买入→入席；**席满或钱不够 → 买入无效**（craft-recipe 原子性天然保证钱；席满判定=入席 band 的条件）。
- **锁店**：`shop_locked` Flag；锁定期间 prep 自动刷新跳过；**每回合自动解锁**。
- **超员自动出售**（准则 §一.3）：入战检查拍，棋盘数 > `level` 且席满 → 自动卖出多余棋子（按入场逆序，TUNE）。
- **升星**（Phase 2）：3 张同名同星 → 自动合成高一星，**含备战席+棋盘、连锁**（3×1→2 可再触发 3×2→3）；**封顶三星**。倍率：HP ×1.8 / 攻 ×1.5 / 大招伤 ×1.5 每星（TUNE）。
- **卖价表**（准则 P8"按等级归还部分金钱"）：

| 星级 | 1 星 | 2 星 | 3 星 |
|---|---|---|---|
| 卖价 | 卡价 | 卡价×3 −1 | 卡价×9 −1 |

- **公共牌库→单人有限牌袋**：抽走/买走从袋中扣，卖出归还——三星可达性语义保真（袋大小见 §4.4）。

### 4.7 主角（小小英雄）与法球拾取（v2 新增，用户点名；Phase 2.5）

**语义（准则 §一.6）**：场上一个**可控主角**，承载 `player_hp`（表现绑定），野怪/战利品掉**法球/宝箱**，主角走过去拾取得金币（后续：装备散件）。

**数据映射（全部现有词汇，零新 capability——已逐项核对引擎）**：

| 要素 | 数据形 |
|---|---|
| 主角实体 | `Transform+Velocity+Shape+Sprite`；**不带任何队伍/势力位** → 不被 aggro 锁、不被打击区 targetMask 命中；专属位 `PROTAG=1<<11`、法球位 `LOOT=1<<12`（Tag 注册表新增） |
| 操控 | 仿 game-d 玩家操控（action-map → Velocity）；点地走作增强（指针命令→移动标记实体→Steering seek） |
| 掉落 | 野怪单位 `Mortal.dropTemplate:'loot_orb'`（引擎现成字段，mortal.ts:45）；宝箱=关卡表掉落条目经 deploy 同链展开 |
| 法球实体 | `Sensor+Shape+Tag{LOOT}+Resource{id:'hp',1}+Mortal` + `Hitbox{resource:'loot', amount:+N, targetMask:PROTAG}`（把赏金写进主角的**本地** loot 资源——hitbox 局部路由，与棋子 hp 同机制） |
| 拾取销毁 | 主角挂 `Hitbox{resource:'hp', amount:-9999, targetMask:LOOT}`——碰到法球即"杀"它（双向 hitbox，碰撞即两清） |
| 入账 | 主角 `loot` 累积 → `EventWhen{loot>0,edge}` → `Effect{targetId:'gold', op:'add', valueFrom:{resourceId:'loot'}}` + `Effect{loot set 0}`（valueFrom=REQ-013 现成） |
| ⚠️ 防串台 | 主角的 `loot` 是它**独有** id（全局唯一一份）→ 全局链取它不歧义；**别**用 'gold' 当本地袋（与全局金币撞 id=陷阱②） |

> 阶段位：**Phase 2.5**（野怪回合同期——掉落源就位才有东西捡）。若 PE-F 接入时发现 hitbox→非 hp 资源路由有隐藏假设，照例 requests.md 提主程，勿 hack。

---

## 五、阶段路线（**v2**，按准则重排；每阶段=本规范的一个流转切片）

| 阶段 | 流转切片（本文坐标） | 新 capability |
|---|---|---|
| **MVP-0 ✅** | §3.4 战斗涌现链 + 单回合流程 | 0（顺手还了 REQ-F-024~028） |
| **MVP-1 ⬅ 进行中** | 多回合双层机 ✅ + 经济 ✅ + 关卡表前2阶段 ✅ + ready ✅；**余：商店五件套全套（§4.6 细则：5槽/刷/锁店/备战席9/卖价/超员自动卖）+ 连败金** | **REQ-F-040 待主程**（牌码分发，商店唯一缺口）；余纯数据 |
| **Phase 2** | §4.6 升星合体（3 同名自动连锁、封顶三星、含备战席）+ §4.3 等级/人口 + 卖人归还卡池 | 0（REQ-021/035/036 已 done；大招去唯一 id 看 REQ-F-039） |
| **Phase 2.5（用户点名拉前）** | **野怪回合**（阶段1×4+每阶段末回合、固定阵容、掉法球）+ **主角小小英雄**（§4.7：可控/承载血量/拾取入账） | 0（映射已核，§4.7） |
| **Phase 3** | 羁绊（开战拍 group-count 锁存→全局 buff）+ §4.2 伤害公式换真存活×星级权重 | 0–1（REQ-022 done；Gap C 届时再裁） |
| **Phase 3.5** | **选秀单人版**（开局强化符文三选一 + 选秀回合九选一棋子/装备） | 按届时评审（预计 0：card-pile 三/九选一同形） |
| **Phase 4** | 装备分配/拆卸器/散件合成、锦囊、时限加时强制双伤、关卡表 3–5 阶段 Boss | 按届时评审 |

---

## 六、符合性审查（2026-06-10，对照 mainbranch@`706758e`）

### 6.1 已达成 ✓（全部有测试背书，`src/games/game-f/game-f.test.ts` 10/10 绿）

| 本规范条目 | 实现/测试证据 |
|---|---|
| §3.4 战斗涌现链全套 | blueprint.ts 纯数据装配；测试「两队自动对冲互砍」「蓝条→大招」 |
| §3.3 combat→resolution 转移（团灭→present flag→结算） | 测试「战斗收敛到团灭」+ GAME_FLOW combat 转移 |
| §3.3 prep ⑥ 回合重置 + resolution 清场 + 多回合循环（REQ-F-032/033） | 棋子=复合模板实例（'@local:main' 整族生灭）+ 持久槽位 + deploy/wipe 信号 + destroy-tagged；测试「备战拍展开」「回合重置：清场无孤儿/槽位库持久/新实例满状态 id 全新」 |
| §3.2 L1 run_flow 全套（boot/round/advance/victory/defeat + round_done 握手 + >5 进位 banded） | `flow_run` 实体 + `when_stage_up`；测试「L1 run_flow + §4.1/§4.2 表」（advance 推进 / 进位换敌阵断言） |
| §4.1 经济三件套（收入爬坡 2,2,3,4,≥5 / 利息 ⌊g/10⌋≤5 / 连胜金）+ §4.2 伤害（阶段基础+存活近似2） | 14 组 band 实体（armed 窗 + EventWhen(edge) + Effect）；测试断言 回合1=2金、回合2=4金、败扣2/4 |
| §4.5 关卡表前 2 阶段（敌阵=数据条目、deploy_stage_N 按 stage_idx 分流；黄巾散兵×0.45 / 董卓先锋全强度） | STAGES 表 + 阶段敌槽；测试「进位换关卡敌阵：阶段2 4 子」 |
| 确定性 | 测试「同初值重跑 hash 一致」（注：当前无 RandomSeed，商店接入后升级为真 seed 检验） |
| `in_combat` 门控、名牌级联死、六角棋盘+A*、独立血攻、大招/DoT、静态装备、势力/职业 Tag 位 | b14d109/674728e/706758e 等提交 + 对应测试 |
| 工程纪律：唯一 id 防串台、零游戏 system | blueprint 全文 grep 无 system；id 形如 `mp_a_guanyu` |

### 6.2 与本规范的差距（= MVP-1 开发队列，按优先级）

| # | 差距 | 对应规范 | 备注 |
|---|---|---|---|
| ~~P0~~ | ✅ **多回合 run/round 双层机全落（2026-06-10）**：round 循环+回合重置+L1 run_flow（victory/defeat/握手/进位 banded） | §3.2/§3.3 | 余 ready 接上后 prep 的 `after 40` 改读 ready Flag（P2）；进位后有 ≤1 个空阶段巡场回合（victory 在下轮 round_done 拍兜住，spec 形状如此） |
| ~~P0~~ | ✅ **商店五件套主体落地（2026-06-10）**：买入（playCosts 金3+bench_space——备战席9当第二货币，席满原子拒单）/ prep 自动刷新 / $2 手动刷新 / 锁店（门判定脉冲先判后拆）/ 点席卖出（'@signal-source'）| §4.6 | 余：袋归还（deck 写回无接缝）、超员自动卖与摆子上场（输入路由主程域）、按等级加权袋（P2 随等级系统） |
| ~~P1~~ | ✅ **经济三件套落地（2026-06-10）**：收入爬坡/利息/连胜金 = armed 窗 + banded | §4.1 | 带宽注记：同窗后序 band 读改写后的 gold（利息可能含本回合收入），TUNE 改阈值即可 |
| ~~P1~~ | ✅ **玩家伤害落地（2026-06-10）**：阶段基础伤 + 存活敌数**近似 2** | §4.2 | 真存活数待 REQ-022 group-count 接入（Phase 3 同期），换 band 值即可 |
| ~~P1~~ | ✅ **关卡表前 2 阶段落地（2026-06-10）**：STAGES 数据 + deploy_stage_N 分流 | §4.5 | 强度暂只缩 HP（攻烘在 strike 模板；按阶段缩攻=每阶段一套 strike 模板，真需要再加）；阶段 3-5 = 填表+加 when 行 |
| ~~P2~~ | ✅ **ready 开战落地（2026-06-10）**：clickable 按钮 → 'ready_btn' → set-flag ready，prep 的 ready 转移优先、40 拍倒计时兜底（金铲铲本体语义） | §3.3 | 策划批注路线原样；其余备战输入（买/卖/挪子）随商店（REQ-F-040）一起接 |
| P2 | 等级/经验/商店概率牌袋 | §4.3/§4.4 | 纯数据 banded |

### 6.3 守住的纪律（审查通过项）

- **游戏=数据**：game-f 目录无任何游戏 system/手写战斗 UI；blueprint=装配数据。`hex.ts` 的投影辅助与 `.ts` 蓝图形态 = 全仓库既有债（manifesto §8），game-f 未新增债种。
- **回驳纪律**：REQ-023 维持不 greenlit（YAGNI，先重组）；本文未捡回任何已回驳项（草船借箭/调虎离山/每帧羁绊等仍按设计稿 §7 押后）。
- **确定性**：流转全部走 flow/EventWhen/Resource（进 hash）；表现（特效/名牌/相机）不进 hash。

---

> 复诵：**一局自走棋 = 两台 GameFlow 数据机（run/round）× 几张数值表 × 一条已验证的战斗涌现链。**
> 程序员加的每一行代码都应该在引擎里、且对着 `requests.md` 的一条已 greenlit 需求；游戏目录里只多数据。
