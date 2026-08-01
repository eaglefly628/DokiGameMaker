// Game F · 太阁守军 Roster（T1/C，game-f-taikou-roster.md §六 master 表）—— 纯数据。
// 守岛方=太阁立志传战国群雄的 PvE 阵容库。每个守军=一组组件（名/皮/兵种/数值），映射现成战斗能力。
// 滩头杂兵 = v1 已成局；国人众部将 + 天守 Boss = master 数据落地（招牌机制/多波关卡表的接线见后续片）。
import { F_TAIKOU } from './assets.js';

// 段位（关卡爬坡）+ 职业（roster §五；ARC=弓手，引擎无独立 Tag 位，记录用）。
export type TaikouSeg = 'beachhead' | 'kokujin' | 'tenshu';
export type TaikouCls = 'WAR' | 'ARC' | 'ASN' | 'TAC';

export interface TaikouUnit {
  code: string;
  name: string;
  sprite: string;
  atkType: 'melee' | 'ranged' | 'magic'; // 近战贴脸 / 远程追踪弹 / 法术弹（决定武器模板 + GridMover.range）
  hp: number; // master Resource(hp)（首版待平衡，对齐金铲铲 1 星量级）
  atk: number; // master 普攻 hitbox.amount
  range: number; // master GridMover.range（hex）
  cls: TaikouCls;
  seg: TaikouSeg;
  signature?: string; // 招牌大招语义（机制接线见后续片；🔴 者依赖 F-061/062）
  execBelow?: number; // 斩杀线（F-061）：普攻对 hp 比例 < 此值的目标处决（谦信/立花/半藏）
  selfHeal?: number; // 忍耐（家康）：over-time 每秒自回复 hp（招牌：厚血+持续回复）
  // 召援（T-F2 秀吉·一夜城周期召兵 / T-F3 本愿寺·一向一揆开场人海）：mob summon sidecar(Timer+SelfRule spawn reinf_<code>)。
  summon?: { code: string; period: number; count?: number; once?: boolean };
  // 普攻附带控/毒（斋藤·毒沼 DoT / 明智·群冻 FROZEN）：hitbox 现成 DOT/setMask 词汇，零引擎。
  atkFx?: { dot?: boolean; freeze?: number };
  // 辅助·友军回复（石田三成·三献茶）：周期 spawn 治疗区（hitbox 负 amount=回血，targetMask 太阁方），零引擎。
  healAura?: { amount: number; period: number; size?: number };
}

// ── 滩头杂兵（roster §一 / §六；v1 成局）──
export const TAIKOU_BEACHHEAD: Record<string, TaikouUnit> = {
  yari: { code: 'ash_yari', name: '枪足轻', sprite: F_TAIKOU.yari, atkType: 'melee', hp: 450, atk: 45, range: 1, cls: 'WAR', seg: 'beachhead' },
  yumi: { code: 'ash_yumi', name: '弓足轻', sprite: F_TAIKOU.yumi, atkType: 'ranged', hp: 350, atk: 40, range: 4, cls: 'ARC', seg: 'beachhead' },
  teppo: { code: 'ash_teppo', name: '铁炮足轻', sprite: F_TAIKOU.teppo, atkType: 'ranged', hp: 380, atk: 95, range: 4, cls: 'ARC', seg: 'beachhead' },
  kunoichi: { code: 'kunoichi', name: '杂兵忍', sprite: F_TAIKOU.kunoichi, atkType: 'melee', hp: 400, atk: 55, range: 1, cls: 'ASN', seg: 'beachhead' },
};

// ── 国人众部将（roster §二 / §六；一招机制，全 ✅复用）──
export const TAIKOU_KOKUJIN: Record<string, TaikouUnit> = {
  saito: { code: 'saito', name: '斋藤道三·蝮', sprite: F_TAIKOU.saito, atkType: 'magic', hp: 600, atk: 50, range: 2, cls: 'TAC', seg: 'kokujin', signature: '毒沼:AoE DoT', atkFx: { dot: true } }, // 蝮毒：普攻附 DoT
  mori: { code: 'mori', name: '毛利元就·三矢', sprite: F_TAIKOU.mori, atkType: 'melee', hp: 650, atk: 55, range: 1, cls: 'WAR', seg: 'kokujin', signature: '三矢:部将≥3 全局 atk buff' },
  hojo: { code: 'hojo', name: '北条氏康·小田原', sprite: F_TAIKOU.hojo, atkType: 'melee', hp: 1100, atk: 40, range: 1, cls: 'WAR', seg: 'kokujin', signature: '龟缩:守军全局减伤' },
  imagawa: { code: 'imagawa', name: '今川义元·弓取', sprite: F_TAIKOU.imagawa, atkType: 'ranged', hp: 600, atk: 55, range: 4, cls: 'ARC', seg: 'kokujin', signature: '弓阵:全弓 buff' },
  akechi: { code: 'akechi', name: '明智光秀·谋叛', sprite: F_TAIKOU.akechi, atkType: 'magic', hp: 600, atk: 50, range: 3, cls: 'TAC', seg: 'kokujin', signature: '群冻:AoE FROZEN', atkFx: { freeze: 90 } }, // 群冻：普攻附 1.5s FROZEN
  ishida: { code: 'ishida', name: '石田三成·三献茶', sprite: F_TAIKOU.ishida, atkType: 'magic', hp: 550, atk: 40, range: 3, cls: 'TAC', seg: 'kokujin', signature: '辅助:友军回复', healAura: { amount: 35, period: 90, size: 64 } }, // 三献茶：每 1.5s 范围回血太阁方
};

// ── 天守 Boss（roster §三 / §六；每局轮换。✅ 类 v1 可成局；🔴 类招牌依赖 F-061 斩杀 / F-062 索敌策略）──
export const TAIKOU_BOSS: Record<string, TaikouUnit> = {
  nobunaga: { code: 'nobunaga', name: '织田信长·天下布武', sprite: F_TAIKOU.nobunaga, atkType: 'melee', hp: 1400, atk: 70, range: 1, cls: 'WAR', seg: 'tenshu', signature: '天下布武:全军 atk buff 阶段递增' },
  hideyoshi: { code: 'hideyoshi', name: '丰臣秀吉·一夜城', sprite: F_TAIKOU.hideyoshi, atkType: 'melee', hp: 1200, atk: 55, range: 2, cls: 'WAR', seg: 'tenshu', signature: '一夜城:周期 spawn 援军', summon: { code: 'ash_yari', period: 180, count: 1 } }, // T-F2：每 3s 召 1 足轻
  ieyasu: { code: 'ieyasu', name: '德川家康·忍耐', sprite: F_TAIKOU.ieyasu, atkType: 'melee', hp: 2000, atk: 60, range: 1, cls: 'WAR', seg: 'tenshu', signature: '忍耐:自回复(over-time)+反击(🟡缓)', selfHeal: 40 },
  honganji: { code: 'honganji', name: '本愿寺显如·一向一揆', sprite: F_TAIKOU.honganji, atkType: 'magic', hp: 1300, atk: 45, range: 2, cls: 'TAC', seg: 'tenshu', signature: '一揆:人海 spawn', summon: { code: 'ash_yari', period: 30, count: 3, once: true } }, // T-F3：开场 0.5s 放 3 人海一揆
  shingen: { code: 'shingen', name: '武田信玄·风林火山', sprite: F_TAIKOU.shingen, atkType: 'melee', hp: 1500, atk: 65, range: 1, cls: 'WAR', seg: 'tenshu', signature: '风林火山:阶段切换+骑冲（🟡部分 per-unit）' },
  kenshin: { code: 'kenshin', name: '上杉谦信·军神', sprite: F_TAIKOU.kenshin, atkType: 'melee', hp: 1400, atk: 90, range: 1, cls: 'ASN', seg: 'tenshu', signature: '无双斩:斩杀残血（F-061）', execBelow: 0.3 },
  yukimura: { code: 'yukimura', name: '真田幸村·六文钱', sprite: F_TAIKOU.yukimura, atkType: 'melee', hp: 1300, atk: 75, range: 1, cls: 'WAR', seg: 'tenshu', signature: '决死:自身残血加伤（🔴 F-061 valueFrom）' },
  masamune: { code: 'masamune', name: '伊达政宗·独眼龙', sprite: F_TAIKOU.masamune, atkType: 'ranged', hp: 1200, atk: 70, range: 4, cls: 'ARC', seg: 'tenshu', signature: '狙击:锁最高威胁（🔴 F-062）' },
  shimazu: { code: 'shimazu', name: '岛津义弘·钓野伏', sprite: F_TAIKOU.shimazu, atkType: 'ranged', hp: 1300, atk: 70, range: 2, cls: 'ASN', seg: 'tenshu', signature: '钓野伏:伏兵 spawn+绕后（🔴 F-062）' },
  tachibana: { code: 'tachibana', name: '立花宗茂·雷切', sprite: F_TAIKOU.tachibana, atkType: 'melee', hp: 1250, atk: 80, range: 1, cls: 'WAR', seg: 'tenshu', signature: '雷切:斩杀(F-061)+暴击(🟡缓)', execBelow: 0.25 },
  hattori: { code: 'hattori', name: '服部半藏·忍', sprite: F_TAIKOU.hattori, atkType: 'melee', hp: 1100, atk: 75, range: 1, cls: 'ASN', seg: 'tenshu', signature: '斩杀(F-061)+潜行(🟡待核)', execBelow: 0.3 },
};

// 全谱（**按 unit.code 索引**，非对象属性名——滩头属性名是 yari 但 code 是 ash_yari）。供关卡表/降将/wave 查表。
export const TAIKOU_ROSTER: Record<string, TaikouUnit> = Object.fromEntries(
  [...Object.values(TAIKOU_BEACHHEAD), ...Object.values(TAIKOU_KOKUJIN), ...Object.values(TAIKOU_BOSS)].map((u) => [u.code, u]),
);
export const unitByCode = (code: string): TaikouUnit | undefined => TAIKOU_ROSTER[code];

// ── 滩头关卡映射（v1 W1–W2 成局；index = stage-1）。W3–W6 多波编成见后续片（master §七）。──
export const STAGE_UNIT: TaikouUnit[] = [
  TAIKOU_BEACHHEAD.yari,
  TAIKOU_BEACHHEAD.yumi,
  TAIKOU_BEACHHEAD.teppo,
  TAIKOU_BEACHHEAD.kunoichi,
  TAIKOU_BEACHHEAD.yari,
];
export const unitForStage = (stage: number): TaikouUnit => STAGE_UNIT[stage - 1] ?? TAIKOU_BEACHHEAD.yari;
