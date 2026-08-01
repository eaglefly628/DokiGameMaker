// ════════════════════════════════════════════════════════════════════════
//  Game E · Boss 盲注诅咒（纯数据：每个 Boss 一条可被回合脚本执行的限制）
//  这是「数据」侧：Boss → 诅咒效果是查表；执行（改手数/弃牌/盲注线/出牌约束）由
//  线性回合脚本（session / game-e.tsx）读这张表施加，不在引擎写 boss system。
//  ★ 收录范围：只收「回合脚本可确定性执行」的诅咒（改资源/手牌数/出牌约束）。
//    需要改计分算法的诅咒（按花色 debuff 某些牌不计分）需引擎逐牌钩子，暂不收录。
//  数值源：Balatro Wiki · Blinds（Boss 效果意译）。
// ════════════════════════════════════════════════════════════════════════

export type BossEffectKind =
  | 'target_x2' // 高墙：盲注线在 Boss×2 基础上再 ×2
  | 'fewer_hands' // 针：本回合只有 1 次出牌
  | 'no_discards' // 水：本回合 0 次弃牌
  | 'small_hand' // 镣铐：手牌减 1（发 7 张）
  | 'must_five' // 灵媒：每手必须出满 5 张
  | 'hook_discard' // 钩子：每次出牌后随机弃 2 张手牌
  | 'no_repeat' // 眼：本回合每种牌型只能打一次
  | 'one_hand_type' // 嘴：本回合只能打第一手打出的那种牌型
  | 'halve_base' // 燧石：所有牌型基础分（筹码+倍率）减半
  | 'pay_per_play'; // 牙：每次出牌，按出牌张数扣 $

export interface BossBlind {
  readonly id: string;
  readonly name: string; // 中文名
  readonly icon: string;
  readonly desc: string; // 诅咒描述（展示用）
  readonly effect: BossEffectKind;
}

/** 可被脚本执行的 Boss 诅咒集（确定性查表）。 */
export const BOSS_BLINDS: readonly BossBlind[] = [
  { id: 'the_wall', name: '高墙', icon: '🧱', desc: '盲注线翻倍', effect: 'target_x2' },
  { id: 'the_needle', name: '尖针', icon: '🪡', desc: '只能出牌 1 次', effect: 'fewer_hands' },
  { id: 'the_water', name: '深水', icon: '💧', desc: '禁止弃牌', effect: 'no_discards' },
  { id: 'the_manacle', name: '镣铐', icon: '⛓️', desc: '手牌减 1（发 7 张）', effect: 'small_hand' },
  { id: 'the_psychic', name: '灵媒', icon: '🔮', desc: '每手必须出满 5 张', effect: 'must_five' },
  { id: 'the_hook', name: '铁钩', icon: '🪝', desc: '每次出牌后随机弃 2 张', effect: 'hook_discard' },
  { id: 'the_eye', name: '巨眼', icon: '👁️', desc: '每种牌型只能打一次', effect: 'no_repeat' },
  // 追加（索引 ≥7，不动前 7 个 ante 的对应关系）：
  { id: 'the_mouth', name: '大嘴', icon: '👄', desc: '本回合只能打一种牌型', effect: 'one_hand_type' },
  { id: 'the_flint', name: '燧石', icon: '🔥', desc: '牌型基础分减半', effect: 'halve_base' },
  { id: 'the_tooth', name: '尖牙', icon: '🦷', desc: '每次出牌按张数扣 $1', effect: 'pay_per_play' },
];

/** 某 ante 的 Boss（确定性轮转：随 ante 推进循环取下一个）。 */
export function bossForAnte(ante: number): BossBlind {
  const i = ((Math.max(1, Math.floor(ante)) - 1) % BOSS_BLINDS.length + BOSS_BLINDS.length) % BOSS_BLINDS.length;
  return BOSS_BLINDS[i];
}
