import type { IWorld } from '@engine/core/types.js';
import type { ScoreTrace } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  score-trace 工具（REQ-019）—— 计分链逐步 trace 的共享 append 接缝。
//  poker-eval / card-score-pass / effect-apply 都用它：**opt-in**——只有世界存在 ScoreTrace 单例时才记录，
//  否则全是 no-op（非卡牌/分步结算玩法零开销、零污染）。trace 排除出 hashSnapshot（纯表现，见 determinism.ts）。
//  通用：任何「分步结算要演出」的玩法（遗物结算 / 伤害分解）都能挂个 ScoreTrace 复用这条 trace。
// ═══════════════════════════════════════════════════════════════

/** 取世界里的 ScoreTrace 单例（无则 undefined → 调用方据此跳过记录）。 */
export function findScoreTrace(world: IWorld): ScoreTrace | undefined {
  for (const [eid] of world.query('ScoreTrace')) {
    const t = world.getComponent<ScoreTrace>(eid, 'ScoreTrace');
    if (t) return t;
  }
  return undefined;
}

/** 计分开始清空 events（单一清空点：计分链首系统 poker-eval 调，避免多处各清竞态）。 */
export function clearScoreTrace(world: IWorld): ScoreTrace | undefined {
  const t = findScoreTrace(world);
  if (t) t.events = [];
  return t;
}

/** append 一步（seq 自动 = 当前长度）。trace 为 undefined（未开启）时 no-op。 */
export function appendScoreEvent(
  trace: ScoreTrace | undefined,
  phase: string, target: string, op: 'set' | 'add' | 'mul', value: number, after: number, source?: string,
): void {
  if (!trace) return;
  trace.events.push({ seq: trace.events.length, phase, target, op, value, after, source });
}
