// Game F · 战斗模板库（从 blueprint.ts 拆出）：普攻/弹道/大招打击区 + 棋子复合体 + 席位/野怪/结算/商店卡模板。
// 全数据装配：strike/projectile/ultTemplate 是 PrefabTemplate 工厂；templatesFor 按当局 ROSTER 批量铺开三张/英雄。
import type { PrefabTemplate } from '@engine/protocol/components.js';
import type { EntityBlueprint } from '../../assembly/demo.assembly.js';
import { ZONE_FLAG } from '@skills/tier2/index.js';
import {
  TEAM_A, TEAM_B, SHU_RED, WEI_BLUE, FROZEN, ASSASSIN, PROTAG, LOOT, BAG, EQUIP, BENCH_OCC, MARKER_VIS, RESULT, PROJ,
  MOVE_PERIOD, ATK_CD, MANA_REGEN, FONT_DISPLAY, FONT_BODY, FONT_NUM, xf, sprite, zlift,
} from './constants.js';
import { type HeroSpec, rosterFor, finalHp, finalAtk } from './heroes.js';
import { F_HERO, F_FX_STRIKE, F_FX_ARROW, F_FX_BOLT, F_FX_FLAME, F_FX_DRAIN, F_FX_FROST } from './assets.js';
import { STAR_HP_MUL, STAR_DMG_MUL, STAR_SCALE, STAR_GLYPH } from './economy.js';
import { PVE_CODES } from './stages.js';
import { type TaikouUnit, unitByCode } from './taikou.js';
import { project, offsetToAxial } from './hex.js';

// 普攻打击区：目标处小 sensor 伤害区，2 tick 自毁 + 表现两件（用户打击感批）：
// redflash=被击红闪（红 Shape 盖在受击位上方 alpha 速褪）；fx=斩光余韵（特效图 alpha 慢褪）。
// 表现实体无 Tag/Sensor/Hitbox 不参战，Timer+lifetime 自清。fxKey=按攻击类型的特效（近战斩/远程箭/法术弹）。
const strike = (targetMask: number, amount: number, fxKey: string, scaleId = 'dmg_scale_b', execBelow?: number, dot = false, freezeTicks = 0): PrefabTemplate => ({
  entities: {
    area: {
      Transform: xf(0, 0),
      Shape: { kind: 'box', width: 18, height: 18 },
      Sensor: {},
      Tag: { flags: ZONE_FLAG },
      Hitbox: { resource: 'hp', amount, targetMask, scaleByResource: scaleId, ...(execBelow !== undefined ? { executeBelow: execBelow } : {}), ...(dot ? DOT : {}), ...(freezeTicks > 0 ? { setMask: FROZEN, statusDuration: freezeTicks } : {}) }, // 047 羁绊乘区 + F-061 斩杀 + 毒沼DoT/群冻FROZEN（太阁招牌）
      Timer: { id: 'life', elapsed: 0, duration: 2, loop: false },
      Sprite: sprite(fxKey, 6),
    },
    redflash: {
      Transform: xf(0, 0),
      Shape: { kind: 'box', width: 26, height: 26 },
      Color: { tint: 0xd65668, alpha: 0.7 },
      Tween: { target: 'Color.alpha', from: 0.7, to: 0, elapsed: 0, duration: 9, easing: 'easeOut', done: false },
      Timer: { id: 'life', elapsed: 0, duration: 10, loop: false },
      Sprite: zlift(9),
    },
    fx: {
      Transform: xf(0, 0),
      Color: { tint: 0xffffff, alpha: 0.9 },
      Tween: { target: 'Color.alpha', from: 0.9, to: 0, elapsed: 0, duration: 14, easing: 'easeOut', done: false },
      Timer: { id: 'life', elapsed: 0, duration: 15, loop: false },
      Sprite: sprite(fxKey, 8),
    },
  },
});

// DoT（灼烧/吸取）：命中后每 30 tick 掉血、持续 ~4s，由 over-time 处理。
const DOT = { dotPerTick: 25, dotPeriod: 30, dotDuration: 240 };

// 装备 atk 加成打击区（REQ-F-065 per-caster scaleByResource）：裸 hitbox（无 fx）amount=1 × 施法者本地 eq_atk
// （=Σ装备atk，默认 0）→ 0 时 0 伤无表现（未装备者零副作用）；与主普攻同拍展开在目标，装武器即附带平砍加伤。
const eqStrike = (targetMask: number): PrefabTemplate => ({
  // Visibility.visible:false → 不绘几何（裸 Shape 否则会画方块）；Hitbox 仍 sim 生效。加伤并入主普攻数字、无独立表现(v1)。
  entities: { area: { Transform: xf(0, 0), Shape: { kind: 'box', width: 18, height: 18 }, Sensor: {}, Visibility: { visible: false, active: true }, Tag: { flags: ZONE_FLAG }, Hitbox: { resource: 'hp', amount: 1, targetMask, scaleByResource: 'eq_atk' }, Timer: { id: 'life', elapsed: 0, duration: 2, loop: false } } },
});

// 远程/法术弹道（用户打击感批「远程要有弹道」）：从攻击者自身射出的**追踪弹**——全现有词汇拼装：
// Perception(敌方)+aggro 锁最近敌 → Steering{seek} 追 → 命中(consumeOnHit 真结算)即灭 + 命中处红闪由
// strike 同款表现实体补（弹体自带 redflash 子实体不可行——单实体单 Tween，红闪随弹体走会提前闪）→
// 弹体只带 Hitbox，命中即消失（视觉=弹道飞行+消失在目标身上）。目标死于途中=aggro 重锁最近敌（追踪续航）；
// 无敌可锁=滞空到 lifetime 自清（120 拍）。无 TEAM 位：不被 zone 计存活/不被锁/不被 wipe。
const projectile = (targetMask: number, amount: number, fxKey: string, scaleId = 'dmg_scale_b', execBelow?: number, dot = false, freezeTicks = 0): PrefabTemplate => ({
  entities: {
    p: {
      Transform: xf(0, 0),
      Shape: { kind: 'box', width: 10, height: 10 },
      Sensor: {},
      Tag: { flags: ZONE_FLAG | PROJ }, // PROJ：庆祝拍 destroy-tagged 清在飞弹（战后不补刀）
      Velocity: { vx: 0, vy: 0, angular: 0 },
      Perception: { targetTag: targetMask, sightRadius: 0 },
      Steering: { mode: 'seek', speed: 3.2, stopRange: 0 },
      Hitbox: { resource: 'hp', amount, targetMask, scaleByResource: scaleId, consumeOnHit: true, ...(execBelow !== undefined ? { executeBelow: execBelow } : {}), ...(dot ? DOT : {}), ...(freezeTicks > 0 ? { setMask: FROZEN, statusDuration: freezeTicks } : {}) },
      Timer: { id: 'life', elapsed: 0, duration: 120, loop: false },
      Sprite: sprite(fxKey, 7),
    },
  },
});

// 治疗区（石田三成·辅助）：负 amount = 回血（hitbox.ts:140 queueResourceMod(-dmg) → +hp，钳在 max）；
// targetMask=太阁方(TEAM_B)，无 scaleByResource（治疗量不吃敌方系数）。短驻 AoE，命中范围内友军即回血。
const healPulse = (amount: number, size: number): PrefabTemplate => ({
  entities: {
    area: {
      Transform: xf(0, 0),
      Shape: { kind: 'box', width: size, height: size },
      Sensor: {},
      Tag: { flags: ZONE_FLAG },
      Hitbox: { resource: 'hp', amount: -amount, targetMask: TEAM_B }, // 负=回血
      Timer: { id: 'life', elapsed: 0, duration: 3, loop: false },
      Sprite: sprite(F_FX_DRAIN, 7),
      Color: { tint: 0x54ad8e, alpha: 0.8 },
    },
  },
});

// 大招打击区：目标处大范围真伤（范围 size、伤害 amount），fxKey=主题特效，dot=是否附 DoT，
// freezeTicks>0=命中冰冻 N tick（八阵图类控制技：hitbox 置 FROZEN + 挂 OverTime 到点自动解，REQ-F-030）。
const ultTemplate = (targetMask: number, amount: number, size: number, fxKey: string, dot = false, freezeTicks = 0, scaleId = 'dmg_scale_b'): PrefabTemplate => ({
  entities: {
    area: {
      Transform: xf(0, 0),
      Shape: { kind: 'box', width: size, height: size },
      Sensor: {},
      Tag: { flags: ZONE_FLAG },
      Hitbox: { resource: 'hp', amount, targetMask, scaleByResource: scaleId, ...(dot ? DOT : {}), ...(freezeTicks > 0 ? { setMask: FROZEN, statusDuration: freezeTicks } : {}) },
      Timer: { id: 'life', elapsed: 0, duration: 3, loop: false },
      Sprite: sprite(fxKey, 7),
    },
    redflash: {
      Transform: xf(0, 0),
      Shape: { kind: 'box', width: Math.round(size * 0.7), height: Math.round(size * 0.7) },
      Color: { tint: 0xd65668, alpha: 0.5 },
      Tween: { target: 'Color.alpha', from: 0.5, to: 0, elapsed: 0, duration: 12, easing: 'easeOut', done: false },
      Timer: { id: 'life', elapsed: 0, duration: 13, loop: false },
      Sprite: zlift(9),
    },
    fx: {
      Transform: xf(0, 0),
      Color: { tint: 0xffffff, alpha: 0.95 },
      Tween: { target: 'Color.alpha', from: 0.95, to: 0, elapsed: 0, duration: 22, easing: 'easeOut', done: false },
      Timer: { id: 'life', elapsed: 0, duration: 23, loop: false },
      Sprite: sprite(fxKey, 8),
    },
  },
});

// 普攻特效按攻击类型：近战斩光 / 远程箭 / 法术弹。
const FX_BY_TYPE: Record<HeroSpec['atkType'], string> = { melee: F_FX_STRIKE, ranged: F_FX_ARROW, magic: F_FX_BOLT };

// ── 棋子复合模板（REQ-F-032/033）：单位+名牌+血蓝条×4+蓝 sidecar = 一个 PrefabTemplate 整体生灭 ──
// 内部互指一律 '@local:main'（REQ-F-033，展开时重映射为实例 id）；sidecar 虽可无 Transform
// 也必须挂 Hierarchy{parentId:'@local:main'} 才随主体级联（主程坑提示：级联只沿 Hierarchy 边走）。
// Tag/Resource(hp)/HexPos 是占位，由槽位 Caster.overrides 写真值（星级数值进槽位数据，Phase 2 复用）。
// 全链已 per-instance（F-9 完结）：timer 'atk'/资源 'mp' 皆普通共享 id，self/局部作用域各读各的——
// 同模板任意多实例（重复购买/三星合体）普攻、回蓝、放大招全不串台，零唯一 id。
const BAR_W = 28;
const trackColor = 0xd9c4b8; // 锦霞 --track（浅底深槽）
const HP_Y = -26, MP_Y = -20;
const sidecarLink = { parentId: '@local:main', localX: 0, localY: 0, localRotation: 0, localScaleX: 1, localScaleY: 1 };
function heroTemplate(h: HeroSpec): PrefabTemplate {
  const bar = (localY: number, height: number): Record<string, unknown> => ({
    Transform: xf(0, localY), // instantiate 统一偏移到槽位投影坐标
    Shape: { kind: 'box', width: BAR_W, height },
    Hierarchy: { ...sidecarLink, localY },
  });
  return {
    entities: {
      main: {
        Transform: xf(0, 0),
        Shape: { kind: 'box', width: 16, height: 16 }, // 供打击区 overlap 命中
        Tag: { flags: 0 }, // 占位 ← 槽位 overrides
        Resource: { id: 'hp', current: 1, min: 0, max: 1 }, // 占位 ← 槽位 overrides（星级数值）
        Perception: { targetTag: h.enemy, sightRadius: 0 }, // 无限视野 → aggro 锁最近敌写 Relation(target)
        HexPos: { q: 0, r: 0 }, // 占位 ← 槽位 overrides（grid-move 每拍据 HexPos 重投影）
        // 被冻定身（REQ-F-030）；glideSpeed=平滑滑行（REQ-F-034：HexPos 逻辑瞬步不变，Transform 恒速滑向格点）。
        // 取值按策划审查：相邻格 ~33px / period 48 ≈ 0.7 px/tick 为追上逻辑步的下限，0.8 留余量（瞬移=不设）。
        // 射程驻足（REQ-F-060，用户「远程兵别贴脸」）：近战贴脸 1 / 法师 3 / 弓手 4——站射程外输出。
        GridMover: { period: MOVE_PERIOD, elapsed: 0, haltStatusMask: FROZEN, glideSpeed: 0.8, range: h.atkType === 'melee' ? 1 : h.atkType === 'magic' ? 3 : 4 },
        Mortal: { resource: 'hp', atOrBelow: 0, dropTemplate: `death_${h.id}` }, // 死亡碎裂特效（用户打击感批：四分碎片飞散）
        // 普攻链（F-9 self 化，REQ-021 spawn + REQ-F-035 whenGlobal 阶段门 + REQ-F-036 二刷定序）：
        // 自身 loop Timer 到点 ∧ 全局 in_combat → SelfRule 在自身 Relation(target) 处展开打击区。
        // timer id 共享 'atk'（self 作用域读自身那份，同模板多实例不串台——唯一 id 脚手架已拆）；
        // 备战/结算不动手 = whenGlobal 门（策划第 9 轮裁定）；目标存在性兜底（胜方目标死光即停手）。
        Timer: { id: 'atk', elapsed: 0, duration: ATK_CD, loop: true },
        // 普攻按攻击类型分流（用户打击感批）：近战=瞬时打击区展开在目标（斩光+红闪）；远程/法术=追踪弹
        // 从自身射出（真弹道，命中才结算）。两路同受 whenGlobal in_combat 门。
        SelfRule: { when: { kind: 'timer', id: 'atk', cmp: 'gte', value: ATK_CD - 1 }, whenGlobal: { kind: 'flag', id: 'in_combat', equals: true }, do: [h.atkType === 'melee' ? { kind: 'spawn', template: `strike_${h.id}`, at: 'target' } : { kind: 'spawn', template: `proj_${h.id}`, at: 'self' }], once: false, armed: false },
        // 呼吸微动（用户「移动轻微抖动」的常驻近似）：scaleY 1↔1.05 往复，活物感；幅度小不碍判读。
        Tween: { target: 'Transform.scaleY', from: 1, to: 1.05, elapsed: 0, duration: 26, easing: 'easeInOut', done: false, loop: 'pingpong' },
        Sprite: sprite(h.key, 4),
      },
      // 头顶名牌：Text+队伍色（我方蜀=红 / 敌方魏=蓝——用户实测"三色势力分不清谁打谁"，名牌只读阵营；
      // 势力色仍在 ROSTER.tint，留羁绊期徽记/描边用）；Sprite 仅抬 zOrder（文本模式不绘）。-34 给两条让位。
      name: {
        Transform: xf(0, -34),
        Text: { content: h.name, fontSize: 9, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 },
        Color: { tint: h.team === TEAM_A ? SHU_RED : WEI_BLUE, alpha: 1 },
        Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 30 },
        Hierarchy: { ...sidecarLink, localY: -34 },
      },
      // 实时血条/蓝条（REQ-F-029 gauge）：暗轨道(先插=在下)+彩填充(后插=在上)，同 zOrder 按插入序叠放。
      // hp 读父（共享 id，fromParent）；mp 读全局唯一 mp_<id>。条无 Tag/Sensor/Hitbox：不参战不计 Zone 不被 wipe 直击（随级联走）。
      hpbg: { ...bar(HP_Y, 5), Color: { tint: trackColor, alpha: 0.85 } },
      hpbar: { ...bar(HP_Y, 5), Color: { tint: 0x54ad8e, alpha: 1 }, Gauge: { resourceId: 'hp', fromParent: true, width: BAR_W } },
      mpbg: { ...bar(MP_Y, 3), Color: { tint: trackColor, alpha: 0.85 } },
      mpbar: { ...bar(MP_Y, 3), Color: { tint: 0x8aa0e6, alpha: 1 }, Gauge: { resourceId: 'mp', fromParent: true, width: BAR_W }, Hierarchy: { ...sidecarLink, parentId: '@local:mana', localY: MP_Y } },
      // 大招接线（F-9 完结篇，REQ-F-039 回驳给的重组路线，全 per-instance 零唯一 id）：
      // · 回蓝 = over-time 永久 regen（duration<=0、amountPerTick 正、局部寻址自身 mp——现有能力字面覆盖，
      //   Lead 等价写法原样）；· 蓝满→放→清 = sidecar 仅有的一条 SelfRule（whenGlobal 阶段门同普攻纪律）；
      // · at:'target' 的目标 = sidecar 自带 Perception 由 aggro 锁敌（位置经 Hierarchy 随主，锁的即近敌）。
      // mp 为普通共享 id：无全局读者（蓝条 fromParent 读本 sidecar、清蓝施于自身）→ 重复棋子大招不串台。
      mana: {
        Transform: xf(0, 0),
        Resource: { id: 'mp', current: 0, min: 0, max: 100 },
        OverTime: { effects: [{ id: 'mp_regen', resource: 'mp', amountPerTick: MANA_REGEN.amount, period: MANA_REGEN.period, duration: 0, elapsed: 0 }] },
        Perception: { targetTag: h.enemy, sightRadius: 0 },
        SelfRule: { when: { kind: 'resource', id: 'mp', cmp: 'gte', value: 100 }, whenGlobal: { kind: 'flag', id: 'in_combat', equals: true }, do: [{ kind: 'spawn', template: `ult_${h.id}`, at: 'target' }, { kind: 'modify-resource', op: 'set', value: 0 }], once: false, armed: false },
        Hierarchy: { ...sidecarLink },
      },
      // 装备 atk sidecar（REQ-F-065 per-caster；仅我方）：独立 Timer+SelfRule 周期 spawn eq_strike（裸加伤区），
      // 源=本 sidecar → eq_strike 的 scaleByResource:'eq_atk' 先查本 sidecar 的 eq_atk(=Σ装备atk，deploy override 连续写，默认0)。
      // 独立 source 避开「同 do 双 spawn 同拍 id 撞车」(主普攻一份、装备加伤一份，各自 sidecar)；off-phase 平砍加伤可接受。
      ...(h.team === TEAM_A ? { eqcaster: { Transform: xf(0, 0), Resource: { id: 'eq_atk', current: 0, min: 0, max: 9999 }, Perception: { targetTag: h.enemy, sightRadius: 0 }, Timer: { id: 'atk', elapsed: 0, duration: ATK_CD, loop: true }, SelfRule: { when: { kind: 'timer', id: 'atk', cmp: 'gte', value: ATK_CD - 1 }, whenGlobal: { kind: 'flag', id: 'in_combat', equals: true }, do: [{ kind: 'spawn', template: `eq_strike_${h.id}`, at: 'target' }], once: false, armed: false }, Hierarchy: { ...sidecarLink } } } : {}),
    },
  };
}

// ── 棋子 overrides 包（统一管道）：星级数值（血 ×1.8^(星-1)、strike/ult_s<星> 换弹=伤 ×1.5^(星-1)，
// SelfRule.do 字段级补丁保 when/whenGlobal）+ 阵营 Tag + HexPos——静态 {q,r}（敌槽烘死）或
// '@origin-hex' 哨兵（席位 marker 跟手，REQ-F-049：prefab 以持位者当拍格代入）。hpMul=§4.5 敌阵强度口径。
function heroOverrides(h: HeroSpec, star: number, hexPos: Record<string, unknown> | string, hpMul = 1): Record<string, unknown> {
  const hp = Math.round(finalHp(h) * hpMul * STAR_HP_MUL[star]);
  return {
    main: {
      HexPos: hexPos,
      Tag: { flags: h.team | h.cls | h.faction },
      Resource: { current: hp, max: hp },
      ...(star >= 2 ? { SelfRule: { do: [h.atkType === 'melee' ? { kind: 'spawn', template: `strike_${h.id}_s${star}`, at: 'target' } : { kind: 'spawn', template: `proj_${h.id}_s${star}`, at: 'self' }] } } : {}),
    },
    ...(star >= 2 ? { mana: { SelfRule: { do: [{ kind: 'spawn', template: `ult_${h.id}_s${star}`, at: 'target' }, { kind: 'modify-resource', op: 'set', value: 0 }] } } } : {}),
  };
}

// ── 敌方阵容槽位（持久数据，REQ-F-032）：无 TEAM 位 → wipe 清场不波及；跨回合常驻。──
// 收到展开信号 → 在自身 Transform（= project(q,r) 投影坐标，消除展开后一帧跳变）处展开自己的棋子，
// overrides 写真值（站位/阵营/数值）。我方不再用固定槽——席位 marker 即部署源（REQ-F-049 统一），见模板。
export function slotEntity(h: HeroSpec, onSignal: string, col: number, row: number, hpMul = 1): EntityBlueprint {
  const a = offsetToAxial(col, row); // 摆子数据=视觉 (col,row)，sim 真相=axial（REQ-F-037 odd-r 迁移）
  const p = project(a.q, a.r);
  return {
    Transform: xf(p.x, p.y),
    Caster: { onSignal, template: `hero_${h.id}`, at: 'self', overrides: heroOverrides(h, 1, { q: a.q, r: a.r }, hpMul) },
  };
}

// ── 太阁守军模板（T1）：简化棋子（无大招/蓝条；带血条+名牌；死亡掉法球）。Tag/血量由槽位 overrides 写。──
// 按单位兵种分流：近战(枪/忍)=贴脸 strike_mob；远程(弓/铁炮)=射程外 proj_mob 追踪弹（GridMover.range=4）。
function mobTemplate(unit: TaikouUnit): PrefabTemplate {
  const ranged = unit.atkType !== 'melee'; // 远程/法术=追踪弹 + 射程驻足；近战=贴脸
  return {
    entities: {
      main: {
        Transform: xf(0, 0),
        Shape: { kind: 'box', width: 16, height: 16 },
        Tag: { flags: 0 },
        Resource: { id: 'hp', current: 1, min: 0, max: 1 },
        Perception: { targetTag: TEAM_A, sightRadius: 0 },
        HexPos: { q: 0, r: 0 },
        GridMover: { period: MOVE_PERIOD, elapsed: 0, haltStatusMask: FROZEN, glideSpeed: 0.8, ...(unit.range > 1 ? { range: unit.range } : {}) }, // master 射程
        Mortal: { resource: 'hp', atOrBelow: 0, dropTemplate: unit.seg === 'beachhead' ? 'mob_death_bare' : 'mob_death' }, // 死亡=掉法球+碎裂；装备 orb 仅名将/Boss(非杂兵)掉（P1 概率掉落，确定性按 seg）
        // 忍耐（家康招牌）：over-time 持续自回复 hp（钳在 max；招牌=厚血+回血肉盾）。
        ...(unit.selfHeal ? { OverTime: { effects: [{ id: 'heal', resource: 'hp', amountPerTick: Math.round(unit.selfHeal / 2), period: 30, duration: 0, elapsed: 0 }] } } : {}),
        Timer: { id: 'atk', elapsed: 0, duration: ATK_CD, loop: true },
        SelfRule: { when: { kind: 'timer', id: 'atk', cmp: 'gte', value: ATK_CD - 1 }, whenGlobal: { kind: 'flag', id: 'in_combat', equals: true }, do: [ranged ? { kind: 'spawn', template: `proj_mob_${unit.code}`, at: 'self' } : { kind: 'spawn', template: `strike_mob_${unit.code}`, at: 'target' }], once: false, armed: false },
        Tween: { target: 'Transform.scaleY', from: 1, to: 1.05, elapsed: 0, duration: 26, easing: 'easeInOut', done: false, loop: 'pingpong' },
        Sprite: sprite(unit.sprite, 4),
      },
      name: {
        Transform: xf(0, -34),
        Text: { content: unit.name, fontSize: 9, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 },
        Color: { tint: 0xa98b8f, alpha: 1 },
        Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 30 },
        Hierarchy: { ...sidecarLink, localY: -34 },
      },
      hpbg: { Transform: xf(0, HP_Y), Shape: { kind: 'box', width: BAR_W, height: 5 }, Hierarchy: { ...sidecarLink, localY: HP_Y }, Color: { tint: trackColor, alpha: 0.85 } },
      hpbar: { Transform: xf(0, HP_Y), Shape: { kind: 'box', width: BAR_W, height: 5 }, Hierarchy: { ...sidecarLink, localY: HP_Y }, Color: { tint: 0x54ad8e, alpha: 1 }, Gauge: { resourceId: 'hp', fromParent: true, width: BAR_W } },
      // 召援 sidecar（T-F2 秀吉一夜城 / T-F3 本愿寺一揆，REQ-021 spawn 重组）：自带 Timer + SelfRule，战斗期到点
      // spawn reinf_<code>（baked TEAM_B+hp+登陆格 → 与部署兵同款战斗单位）。挂 Hierarchy 随 Boss 生死级联。
      ...(unit.summon
        ? { summon: {
            Transform: xf(0, 0),
            Hierarchy: { ...sidecarLink },
            Timer: { id: 'summon', elapsed: 0, duration: unit.summon.period, loop: !unit.summon.once },
            SelfRule: {
              when: { kind: 'timer', id: 'summon', cmp: 'gte', value: unit.summon.period - 1 },
              whenGlobal: { kind: 'flag', id: 'in_combat', equals: true },
              do: Array.from({ length: unit.summon.count ?? 1 }, () => ({ kind: 'spawn', template: `reinf_${unit.summon!.code}`, at: 'self' })),
              once: unit.summon.once ?? false, armed: false,
            },
          } }
        : {}),
      // 辅助回复 sidecar（石田·三献茶）：周期 spawn 治疗区回血太阁方。挂 Hierarchy 随死亡级联。
      ...(unit.healAura
        ? { healer: {
            Transform: xf(0, 0),
            Hierarchy: { ...sidecarLink },
            Timer: { id: 'heal', elapsed: 0, duration: unit.healAura.period, loop: true },
            SelfRule: {
              when: { kind: 'timer', id: 'heal', cmp: 'gte', value: unit.healAura.period - 1 },
              whenGlobal: { kind: 'flag', id: 'in_combat', equals: true },
              do: [{ kind: 'spawn', template: `heal_pulse_${unit.code}`, at: 'self' }],
              once: false, armed: false,
            },
          } }
        : {}),
    },
  };
}

// 召援登陆单位（T-F2/T-F3）：= mob 模板，但把 TEAM_B / hp / 登陆格**烘进模板自身**（spawn 不走部署 overrides）。
// 登陆格固定在敌前排 staging（grid-move 接管寻路）；与部署兵同组件 → 同样索敌/走位/攻击/被斩杀。
function reinfTemplate(unit: TaikouUnit): PrefabTemplate {
  const t = mobTemplate(unit);
  const main = t.entities.main as Record<string, unknown>;
  main.Tag = { flags: TEAM_B };
  main.Resource = { id: 'hp', current: unit.hp, min: 0, max: unit.hp };
  main.HexPos = { q: 2, r: 2 }; // 援军登陆点（敌前排；超员靠 grid-move 占格分散）
  return t;
}

// 疑兵增援（designer #34/#35 收口）：友军杂兵 = TEAM_A 战斗单位，镜像 mob/reinf 但阵营翻面——
// Perception 锁 TEAM_B、自带打 TEAM_B 的 strike（用我方 dmg_scale_a 乘区）、HexPos 烘玩家半场。占位美术(赵云图)。
const YIBING_HP = 60, YIBING_ATK = 18;
function yibingUnit(hex: { q: number; r: number }): EntityBlueprint {
  return {
    Transform: xf(0, 0),
    Shape: { kind: 'box', width: 16, height: 16 },
    Tag: { flags: TEAM_A },
    Resource: { id: 'hp', current: YIBING_HP, min: 0, max: YIBING_HP },
    Perception: { targetTag: TEAM_B, sightRadius: 0 },
    HexPos: hex,
    GridMover: { period: MOVE_PERIOD, elapsed: 0, haltStatusMask: FROZEN, glideSpeed: 0.8 },
    Mortal: { resource: 'hp', atOrBelow: 0 },
    Timer: { id: 'atk', elapsed: 0, duration: ATK_CD, loop: true },
    SelfRule: { when: { kind: 'timer', id: 'atk', cmp: 'gte', value: ATK_CD - 1 }, whenGlobal: { kind: 'flag', id: 'in_combat', equals: true }, do: [{ kind: 'spawn', template: 'jinnang_yibing_strike', at: 'target' }], once: false, armed: false },
    Tween: { target: 'Transform.scaleY', from: 1, to: 1.05, elapsed: 0, duration: 26, easing: 'easeInOut', done: false, loop: 'pingpong' },
    Sprite: sprite(F_HERO.zhao_yun, 4),
    Color: { tint: SHU_RED, alpha: 1 },
  } as unknown as EntityBlueprint;
}

// 每英雄三张模板：普攻打击区 + 大招打击区 + 棋子复合体（REQ-F-032 回合重展开用）。targetMask=敌队。
// 模板库按当前 ROSTER（已按阵营分配 a_/b_）生成；参数名取 ROSTER 以使 150 行体零改动绑定到入参。
export function templatesFor(ROSTER: HeroSpec[]): Record<string, PrefabTemplate> {
  return Object.fromEntries(
  ROSTER.flatMap((h): [string, PrefabTemplate][] => [
    // 近战=瞬时打击区；远程/法术=追踪弹道（用户打击感批）。两类只发各自用到的武器模板。
    // 刺客职业 trait（F-061 斩杀）：ASSASSIN 普攻对残血(<15%)目标处决——黄忠/吕蒙等抢人头流派的引擎支撑。
    h.atkType === 'melee'
      ? [`strike_${h.id}`, strike(h.enemy, finalAtk(h), FX_BY_TYPE[h.atkType], h.team === TEAM_A ? 'dmg_scale_a' : 'dmg_scale_b', h.cls === ASSASSIN ? 0.15 : undefined)] as [string, PrefabTemplate]
      : [`proj_${h.id}`, projectile(h.enemy, finalAtk(h), FX_BY_TYPE[h.atkType], h.team === TEAM_A ? 'dmg_scale_a' : 'dmg_scale_b', h.cls === ASSASSIN ? 0.15 : undefined)] as [string, PrefabTemplate],
    [`ult_${h.id}`, ultTemplate(h.enemy, h.ultDmg, h.ultSize, h.ultFx, h.ultDot, h.ultFreeze, h.team === TEAM_A ? 'dmg_scale_a' : 'dmg_scale_b')],
    [`hero_${h.id}`, heroTemplate(h)],
    // 装备 atk 打击区（仅我方；eq_strike_<id> 由普攻同拍 spawn，按本单位 eq_atk 缩放=异质装备加伤，REQ-F-065）。
    ...(h.team === TEAM_A ? [[`eq_strike_${h.id}`, eqStrike(h.enemy)] as [string, PrefabTemplate]] : []),
    // 死亡碎裂（用户打击感批「被杀死时切成四半」）：4 个 0.55 倍迷你分身向四角飞散+渐隐（Velocity 四向
    // + alpha Tween + lifetime 自清；表现实体无 Tag 不参战不计存活）。
    [`death_${h.id}`, {
      entities: Object.assign(
        Object.fromEntries([[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy], i) => [`q${i}`, {
          Transform: { x: dx * 5, y: dy * 5, rotation: 0, scaleX: 0.55, scaleY: 0.55 },
          Velocity: { vx: dx * 2.0, vy: dy * 1.6 - 0.6, angular: 0 },
          Color: { tint: 0xffffff, alpha: 0.95 },
          Tween: { target: 'Color.alpha', from: 0.95, to: 0, elapsed: 0, duration: 26, easing: 'easeOut', done: false },
          Timer: { id: 'life', elapsed: 0, duration: 30, loop: false },
          Sprite: sprite(h.key, 6),
        }])),
        // 敌将（魏）死亡掉装备 orb（主公拾取入装备栏）；我方死亡不掉（防自farm）。
        h.team === TEAM_B ? { eorb: { Transform: xf(0, 0), Shape: { kind: 'box', width: 13, height: 13 }, Sensor: {}, Text: { content: '📦', fontSize: 15, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 }, Sprite: sprite(F_FX_STRIKE, 6), Color: { tint: 0xcf9a3f, alpha: 1 }, Tag: { flags: EQUIP | ZONE_FLAG }, Hitbox: { resource: 'items', amount: -1, targetMask: BAG, consumeOnHit: true } } } : {},
      ),
    }],
  ]).concat(
    // 备战席位模板（v2 §4.6 + F-17 升星家族 + F-18/REQ-F-049 统一架构）：**席位 marker 即上场槽**。
    // 每将三档星级模板（bench/bench2/bench3）= merge-rule「同模板才互相计数」家族（策划 F-17 原批注语义），
    // 星级数值烘在各档模板的 Caster.overrides 里——无星级资源/计数带，模板家族本身就是星级。
    // · 部署源：Caster{onSignal:'deploy', requireHexPos}——拖上板（有 HexPos）= 入战拍在自己格出兵
    //   （main.HexPos='@origin-hex' 哨兵跟手）；在席/拖回（无 HexPos）= 静默。
    // · 可拖（F-18/REQ-F-045 全量）：snap 六角格 + in_prep 相位门 + 上板限额（Tag&BENCH_OCC∧HexPos ≤ level）。
    // · 可点卖出（F-12/F-17）：sell[星]_<将> 信号 '@signal-source' 点谁卖谁（板上/席上均可卖）。
    // · 不参战：无 TEAM 位（zone/aggro/hitbox/wipe 全不沾）；REQ-F-051 后在板也不挡棋子寻路。
    ROSTER.filter((x) => x.team === TEAM_A).flatMap((h): [string, PrefabTemplate][] =>
      [1, 2, 3].map((s): [string, PrefabTemplate] => [
        s === 1 ? `bench_${h.id}` : `bench${s}_${h.id}`,
        {
          entities: {
            // 星级放大（用户报「升星看不出、像没发生」）：1/2/3 星 marker 按 1.0/1.18/1.38 缩放 → 一眼见大小差。
            seat: {
              Transform: { x: 0, y: 0, rotation: 0, scaleX: STAR_SCALE[s], scaleY: STAR_SCALE[s] },
              Sprite: sprite(h.key, 2),
              Shape: { kind: 'box', width: 30, height: 30 },
              // 卖出动作数据（REQ-F-058）：指针点击已停用（onlyFlag 指向恒假旗——用户实测「点谁谁消失」陷阱）；
              // 唯一卖出通路=拖进垃圾桶（DropZone 代点本 action，绕过指针门；任何相位可卖=操作表）。
              Clickable: { action: s === 1 ? `sell_${h.id}` : `sell${s}_${h.id}`, phase: 'up', onlyFlag: 'click_sell_off' },
              Tag: { flags: BENCH_OCC | MARKER_VIS | h.faction | h.cls }, // +势力/职业位：羁绊按「在板 marker」实时计数（无 TEAM 位仍不参战）
              Visibility: { visible: true, active: true }, // 备战可见；ph_combat→隐藏 / ph_prep→显
              Draggable: { snap: 'hex', onlyFlag: 'in_prep', capTagMask: BENCH_OCC, capResource: 'level' },
              // 落子弹跳（REQ-F-057）：压扁回弹 keep Tween——买入出生播一次，每次拖放落点由 drag-place 倒带重放。
              Tween: { target: 'Transform.scaleY', from: STAR_SCALE[s] * 1.35, to: STAR_SCALE[s], elapsed: 0, duration: 12, easing: 'easeOut', done: false, keep: true },
              Caster: { onSignal: 'deploy', template: `hero_${h.id}`, at: 'self', requireHexPos: true, overrides: heroOverrides(h, s, '@origin-hex') },
            },
            ...(s >= 2
              ? {
                  // 合成闪光（用户「合在一起要有效果、skill 一下」）：仅 2/3 星模板自带 → 恰在合成产物
                  // 出生瞬间金光炸开渐隐（买入的 1 星无此件）。无 Hierarchy 不级联，lifetime 自清。
                  flash: {
                    Transform: { x: 0, y: 0, rotation: 0, scaleX: 2.4, scaleY: 2.4 },
                    Color: { tint: 0xcf9a3f, alpha: 0.95 },
                    Tween: { target: 'Color.alpha', from: 0.95, to: 0, elapsed: 0, duration: 22, easing: 'easeOut', done: false },
                    Timer: { id: 'life', elapsed: 0, duration: 24, loop: false },
                    Sprite: sprite(F_FX_FLAME, 32),
                  },
                  // ★ 角标：2 星银 / 3 星金，字号加大，带描边底板 —— 升星辨识度（合成功能本身已验证正确，纯视觉强化）。
                  star: {
                    Transform: xf(0, -26),
                    Text: { content: STAR_GLYPH[s], fontSize: s === 3 ? 16 : 14, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 },
                    Color: { tint: s === 3 ? 0xcf9a3f : 0x8aa0e6, alpha: 1 }, // 3星金 / 2星银
                    Tag: { flags: MARKER_VIS }, // ★ 角标随 seat 一起隐显（不带 BENCH_OCC=不计席位占用）
                    Visibility: { visible: true, active: true },
                    Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 31 },
                    Hierarchy: { parentId: '@local:seat', localX: 0, localY: -26, localRotation: 0, localScaleX: 1, localScaleY: 1 },
                  },
                }
              : {}),
          },
        },
      ]),
    ),
    // 升星武器模板（F-17）：二/三星普攻（近战打击区/远程弹道按类型）与大招（×1.5/×2.25），槽位 overrides 换弹。
    ROSTER.filter((x) => x.team === TEAM_A).flatMap((h): [string, PrefabTemplate][] =>
      [2, 3].flatMap((s): [string, PrefabTemplate][] => [
        h.atkType === 'melee'
          ? [`strike_${h.id}_s${s}`, strike(h.enemy, Math.round(finalAtk(h) * STAR_DMG_MUL[s]), FX_BY_TYPE[h.atkType], 'dmg_scale_a', h.cls === ASSASSIN ? 0.15 : undefined)] as [string, PrefabTemplate]
          : [`proj_${h.id}_s${s}`, projectile(h.enemy, Math.round(finalAtk(h) * STAR_DMG_MUL[s]), FX_BY_TYPE[h.atkType], 'dmg_scale_a', h.cls === ASSASSIN ? 0.15 : undefined)] as [string, PrefabTemplate],
        [`ult_${h.id}_s${s}`, ultTemplate(h.enemy, Math.round(h.ultDmg * STAR_DMG_MUL[s]), h.ultSize, h.ultFx, h.ultDot, h.ultFreeze, 'dmg_scale_a')],
      ]),
    ),
    // 太阁守军（C）：每个出场太阁码 → mob_<code> 复合模板 + 对应武器（近战 strike / 远程·法术 proj）；master atk。
    // 国人众/Boss 据此可进战斗；hp 由部署槽 overrides 写（master unit.hp）。法球=死亡掉落（结算清场兜底）。
    PVE_CODES.map((code): [string, PrefabTemplate] => {
      const u = unitByCode(code)!;
      // 太阁 Boss 招牌：execBelow=斩杀线（F-061，谦信/立花/半藏）。普攻武器带处决。
      return u.atkType !== 'melee'
        ? [`proj_mob_${code}`, projectile(TEAM_A, u.atk, u.atkType === 'magic' ? F_FX_BOLT : F_FX_ARROW, 'dmg_scale_b', u.execBelow, u.atkFx?.dot, u.atkFx?.freeze)]
        : [`strike_mob_${code}`, strike(TEAM_A, u.atk, F_FX_BOLT, 'dmg_scale_b', u.execBelow, u.atkFx?.dot, u.atkFx?.freeze)];
    }),
    PVE_CODES.map((code): [string, PrefabTemplate] => [`mob_${code}`, mobTemplate(unitByCode(code)!)]),
    // 召援登陆模板（T-F2/T-F3）：出场太阁里所有 summon 目标码 → reinf_<code>（baked 战斗单位）。
    [...new Set(PVE_CODES.map((c) => unitByCode(c)).filter((u): u is TaikouUnit => !!u?.summon).map((u) => u.summon!.code))]
      .map((code): [string, PrefabTemplate] => [`reinf_${code}`, reinfTemplate(unitByCode(code)!)]),
    // 治疗区模板（石田·辅助）：出场太阁里带 healAura 的 → heal_pulse_<code>。
    PVE_CODES.map((c) => unitByCode(c)).filter((u): u is TaikouUnit => !!u?.healAura)
      .map((u): [string, PrefabTemplate] => [`heal_pulse_${u.code}`, healPulse(u.healAura!.amount, u.healAura!.size ?? 60)]),
    [[
      'loot_orb',
      { entities: { orb: { Transform: xf(0, 0), Shape: { kind: 'box', width: 10, height: 10 }, Sensor: {}, Sprite: sprite(F_FX_DRAIN, 5), Color: { tint: 0xd8607b, alpha: 1 }, Tag: { flags: LOOT | ZONE_FLAG }, Hitbox: { resource: 'loot', amount: -5, targetMask: PROTAG, consumeOnHit: true } } } }, // 044：真结算一次入账-5(负=给予)同拍自毁；主角零附件
    ]] as [string, PrefabTemplate][],
    // 主动锦囊 fx（P1.5 点地施放，caster at:'pointer' 在落点展开；范围 hitbox 对太阁 TEAM_B）。火烧=DoT，定身=FROZEN。
    [
      ['jinnang_huoshao', { entities: { area: { Transform: xf(0, 0), Shape: { kind: 'box', width: 70, height: 70 }, Sensor: {}, Tag: { flags: ZONE_FLAG }, Hitbox: { resource: 'hp', amount: 20, targetMask: TEAM_B, ...DOT }, Timer: { id: 'life', elapsed: 0, duration: 4, loop: false }, Sprite: sprite(F_FX_FLAME, 8), Color: { tint: 0xff7a3a, alpha: 0.9 }, Tween: { target: 'Color.alpha', from: 0.9, to: 0, elapsed: 0, duration: 18, easing: 'easeOut', done: false } } } }],
      ['jinnang_dingshen', { entities: { area: { Transform: xf(0, 0), Shape: { kind: 'box', width: 70, height: 70 }, Sensor: {}, Tag: { flags: ZONE_FLAG }, Hitbox: { resource: 'hp', amount: 5, targetMask: TEAM_B, setMask: FROZEN, statusDuration: 120 }, Timer: { id: 'life', elapsed: 0, duration: 4, loop: false }, Sprite: sprite(F_FX_FROST, 8), Color: { tint: 0x7ad0ff, alpha: 0.9 }, Tween: { target: 'Color.alpha', from: 0.9, to: 0, elapsed: 0, duration: 18, easing: 'easeOut', done: false } } } }],
      // 万箭齐发：落点范围一击真伤太阁（无 DOT、单拍结算；短寿自毁）。
      ['jinnang_wanjian', { entities: { area: { Transform: xf(0, 0), Shape: { kind: 'box', width: 80, height: 80 }, Sensor: {}, Tag: { flags: ZONE_FLAG }, Hitbox: { resource: 'hp', amount: 30, targetMask: TEAM_B }, Timer: { id: 'life', elapsed: 0, duration: 1, loop: false }, Sprite: sprite(F_FX_ARROW, 8), Color: { tint: 0xe8d49a, alpha: 0.95 }, Tween: { target: 'Color.alpha', from: 0.95, to: 0, elapsed: 0, duration: 14, easing: 'easeOut', done: false } } } }],
      // 妙手回春：落点范围给我方回血（负伤=回血、targetMask 我方 TEAM_A；与野怪 heal_pulse 同款负伤算子）。
      ['jinnang_huichun', { entities: { area: { Transform: xf(0, 0), Shape: { kind: 'box', width: 80, height: 80 }, Sensor: {}, Tag: { flags: ZONE_FLAG }, Hitbox: { resource: 'hp', amount: -20, targetMask: TEAM_A }, Timer: { id: 'life', elapsed: 0, duration: 1, loop: false }, Sprite: sprite(F_FX_DRAIN, 8), Color: { tint: 0x7ce8a0, alpha: 0.9 }, Tween: { target: 'Color.alpha', from: 0.9, to: 0, elapsed: 0, duration: 16, easing: 'easeOut', done: false } } } }],
      // 疑兵增援（自施）：召 2 名友军杂兵(TEAM_A)落玩家半场参战；其 strike 打 TEAM_B 用我方乘区。
      ['jinnang_yibing_strike', strike(TEAM_B, YIBING_ATK, F_FX_STRIKE, 'dmg_scale_a')],
      ['jinnang_yibing', { entities: { u1: yibingUnit({ q: 1, r: 5 }), u2: yibingUnit({ q: 5, r: 5 }) } }],
    ] as [string, PrefabTemplate][],
    // 野怪死亡复合（掉法球 + 四分碎裂）。**提交版 P1 概率掉落**：装备 orb 仅名将/Boss(seg≠beachhead) 掉，
    // 杂兵(足轻/beachhead)只掉金法球不掉装备 → mob_death(含 eorb) / mob_death_bare(无 eorb) 两版，mobTemplate 按 seg 选。
    (() => {
      const shatter = Object.fromEntries([[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy], i) => [`q${i}`, {
        Transform: { x: dx * 5, y: dy * 5, rotation: 0, scaleX: 0.5, scaleY: 0.5 },
        Velocity: { vx: dx * 2.0, vy: dy * 1.6 - 0.6, angular: 0 },
        Color: { tint: 0xffffff, alpha: 0.9 },
        Tween: { target: 'Color.alpha', from: 0.9, to: 0, elapsed: 0, duration: 24, easing: 'easeOut', done: false },
        Timer: { id: 'life', elapsed: 0, duration: 28, loop: false },
        Sprite: sprite(F_HERO.gan_ning, 6),
      }]));
      const orb = { orb: { Transform: xf(0, 0), Shape: { kind: 'box', width: 10, height: 10 }, Sensor: {}, Sprite: sprite(F_FX_DRAIN, 5), Color: { tint: 0xd8607b, alpha: 1 }, Tag: { flags: LOOT | ZONE_FLAG }, Hitbox: { resource: 'loot', amount: -5, targetMask: PROTAG, consumeOnHit: true } } };
      const eorb = { eorb: { Transform: xf(14, 0), Shape: { kind: 'box', width: 13, height: 13 }, Sensor: {}, Text: { content: '📦', fontSize: 15, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 }, Sprite: sprite(F_FX_STRIKE, 6), Color: { tint: 0xcf9a3f, alpha: 1 }, Tag: { flags: EQUIP | ZONE_FLAG }, Hitbox: { resource: 'items', amount: -1, targetMask: BAG, consumeOnHit: true } } };
      return [
        ['mob_death', { entities: Object.assign({}, orb, eorb, shatter) }],      // 名将/Boss：金法球 + 装备 orb + 碎裂
        ['mob_death_bare', { entities: Object.assign({}, orb, shatter) }],         // 杂兵：仅金法球 + 碎裂（不掉装备）
      ] as [string, PrefabTemplate][];
    })(),
    // 胜利彩点（庆祝相位喷洒）：金色圆点四散上抛+渐隐（Velocity+Tween+lifetime；zlift 抬层画 Shape）。
    [[
      'win_burst',
      { entities: Object.fromEntries([[-1.8, -1.2], [-0.6, -2.0], [0.6, -2.0], [1.8, -1.2]].map(([vx, vy], i) => [`c${i}`, {
        Transform: { x: (i - 1.5) * 8, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'circle', radius: 4 },
        Velocity: { vx, vy, angular: 0 },
        Color: { tint: i % 2 === 0 ? 0xcf9a3f : 0xe887a0, alpha: 0.95 },
        Tween: { target: 'Color.alpha', from: 0.95, to: 0, elapsed: 0, duration: 38, easing: 'easeOut', done: false },
        Timer: { id: 'life', elapsed: 0, duration: 42, loop: false },
        Sprite: zlift(33),
      }])) },
    ]] as [string, PrefabTemplate][],
    // 战果面板（动态结算过程）：逐行错速淡入（duration 阶梯=stagger 近似），数字 TextBinding 实时跳
    [[
      'result_win',
      { entities: {
        head: { Transform: xf(0, 0), Text: { content: '— 战 果 —', fontSize: 14, fontFamily: FONT_DISPLAY, anchor: 'center', lineSpacing: 0 }, Color: { tint: 0xcf9a3f, alpha: 0 }, Tween: { target: 'Color.alpha', from: 0, to: 1, elapsed: 0, duration: 8, easing: 'easeOut', done: false }, Tag: { flags: RESULT }, Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 34 } },
        verdict: { Transform: xf(0, 20), Text: { content: '🏆 本回合胜利', fontSize: 15, fontFamily: FONT_DISPLAY, anchor: 'center', lineSpacing: 0 }, Color: { tint: 0xcf9a3f, alpha: 0 }, Tween: { target: 'Color.alpha', from: 0, to: 1, elapsed: 0, duration: 16, easing: 'easeOut', done: false }, Tag: { flags: RESULT }, Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 34 } },
        gline: { Transform: xf(0, 40), Text: { content: '金币 0', fontSize: 12, fontFamily: FONT_NUM, anchor: 'center', lineSpacing: 0 }, TextBinding: { resourceId: 'gold', prefix: '金币 ' }, Color: { tint: 0xcf9a3f, alpha: 0 }, Tween: { target: 'Color.alpha', from: 0, to: 1, elapsed: 0, duration: 26, easing: 'easeOut', done: false }, Tag: { flags: RESULT }, Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 34 } },
        sline: { Transform: xf(0, 58), Text: { content: '', fontSize: 12, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 }, TextBinding: { resourceId: 'win_streak', prefix: '连胜 ' }, Color: { tint: 0x8aa0e6, alpha: 0 }, Tween: { target: 'Color.alpha', from: 0, to: 1, elapsed: 0, duration: 36, easing: 'easeOut', done: false }, Tag: { flags: RESULT }, Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 34 } },
        hline: { Transform: xf(0, 76), Text: { content: '血量 100', fontSize: 12, fontFamily: FONT_NUM, anchor: 'center', lineSpacing: 0 }, TextBinding: { resourceId: 'player_hp', prefix: '血量 ' }, Color: { tint: 0xd65668, alpha: 0 }, Tween: { target: 'Color.alpha', from: 0, to: 1, elapsed: 0, duration: 46, easing: 'easeOut', done: false }, Tag: { flags: RESULT }, Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 34 } },
      } },
    ]] as [string, PrefabTemplate][],
    [[
      'result_lose',
      { entities: {
        head: { Transform: xf(0, 0), Text: { content: '— 战 果 —', fontSize: 14, fontFamily: FONT_DISPLAY, anchor: 'center', lineSpacing: 0 }, Color: { tint: 0xcf9a3f, alpha: 0 }, Tween: { target: 'Color.alpha', from: 0, to: 1, elapsed: 0, duration: 8, easing: 'easeOut', done: false }, Tag: { flags: RESULT }, Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 34 } },
        verdict: { Transform: xf(0, 20), Text: { content: '💔 本回合战败', fontSize: 15, fontFamily: FONT_DISPLAY, anchor: 'center', lineSpacing: 0 }, Color: { tint: 0xd65668, alpha: 0 }, Tween: { target: 'Color.alpha', from: 0, to: 1, elapsed: 0, duration: 16, easing: 'easeOut', done: false }, Tag: { flags: RESULT }, Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 34 } },
        gline: { Transform: xf(0, 40), Text: { content: '金币 0', fontSize: 12, fontFamily: FONT_NUM, anchor: 'center', lineSpacing: 0 }, TextBinding: { resourceId: 'gold', prefix: '金币 ' }, Color: { tint: 0xcf9a3f, alpha: 0 }, Tween: { target: 'Color.alpha', from: 0, to: 1, elapsed: 0, duration: 26, easing: 'easeOut', done: false }, Tag: { flags: RESULT }, Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 34 } },
        sline: { Transform: xf(0, 58), Text: { content: '', fontSize: 12, fontFamily: FONT_BODY, anchor: 'center', lineSpacing: 0 }, TextBinding: { resourceId: 'lose_streak', prefix: '连败 ' }, Color: { tint: 0x8aa0e6, alpha: 0 }, Tween: { target: 'Color.alpha', from: 0, to: 1, elapsed: 0, duration: 36, easing: 'easeOut', done: false }, Tag: { flags: RESULT }, Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 34 } },
        hline: { Transform: xf(0, 76), Text: { content: '血量 100', fontSize: 12, fontFamily: FONT_NUM, anchor: 'center', lineSpacing: 0 }, TextBinding: { resourceId: 'player_hp', prefix: '血量 ' }, Color: { tint: 0xd65668, alpha: 0 }, Tween: { target: 'Color.alpha', from: 0, to: 1, elapsed: 0, duration: 46, easing: 'easeOut', done: false }, Tag: { flags: RESULT }, Sprite: { textureKey: F_FX_STRIKE, anchorX: 0.5, anchorY: 0.5, zOrder: 34 } },
      } },
    ]] as [string, PrefabTemplate][],
    // 商店大卡（旧 canvas 选卡页）已退役：在售脸图改由 GameShell 商店面板 image 直读 shop_face StringVar，
    // 买入走 DOM 点将台 → CardPile.play（位置无关），不再需要持位 Caster 展开的可点大卡模板。
  ),
  );
}
// 模块级默认（玩家=蜀），供 index.ts 导出/外部消费；build 内按所选阵营重新生成并 shadow。
export const GAME_F_TEMPLATES = templatesFor(rosterFor('shu'));
