// three/num-guard —— 后处理数值兜底（健壮性铁律）。
// 渲染器**绝不**把 NaN/undefined/超界值喂进 shader uniform —— 上游（弱 LLM 数据 / UI 滑块抖动回调 undefined）
// 写脏值时，若直传会让 GTAO/分级 shader 算出 NaN → **整片黑屏**。这里统一在喂 GPU 前最后一道钳位兜底。
// 纯函数·无副作用·可单测（与 three 解耦·测试不必拉起 WebGL）。

// 钳到 [0,1]；非有限（NaN/Infinity/非数）→ 回退 fb。用于 AO 不透明度等 0..1 量。
export const clamp01 = (v: unknown, fb: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fb;

// 取正有限数；否则回退 fb。用于半径/缩放等必须 >0 的量（0/负/NaN 都无意义）。
export const posOr = (v: unknown, fb: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fb;

// 取有限数；否则回退 fb。用于曝光/对比/亮度等可正可负的量。
export const fin = (v: unknown, fb: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fb;
