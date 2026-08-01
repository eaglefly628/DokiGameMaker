// 后处理数值兜底（健壮性·防黑屏回归）：NaN/undefined/超界 → 安全回退，**绝不**把脏值喂进 shader。
// 回归来源：game-z 调试面板 AO 强度滑块偶发回调 undefined → Number()=NaN → blendIntensity=NaN → 全黑。
import { describe, it, expect } from 'vitest';
import { clamp01, posOr, fin } from './num-guard.js';

describe('num-guard：后处理数值兜底', () => {
  it('clamp01：钳 [0,1]·非有限回退', () => {
    expect(clamp01(0.85, 1)).toBe(0.85);
    expect(clamp01(2, 1)).toBe(1); // 超界 → 钳（AO intensity>1 会让遮蔽处变负→黑）
    expect(clamp01(-3, 1)).toBe(0);
    expect(clamp01(NaN, 1)).toBe(1); // ★ 核心：NaN → 回退（否则黑屏）
    expect(clamp01(undefined, 1)).toBe(1); // 滑块抖动传 undefined
    expect(clamp01(Infinity, 1)).toBe(1);
    expect(clamp01('0.5', 1)).toBe(1); // 非数字串 → 回退
  });

  it('posOr：取正有限·否则回退', () => {
    expect(posOr(5, 4)).toBe(5);
    expect(posOr(0, 4)).toBe(4); // 0 无意义（半径/缩放）
    expect(posOr(-2, 4)).toBe(4);
    expect(posOr(NaN, 4)).toBe(4);
    expect(posOr(undefined, 4)).toBe(4);
  });

  it('fin：取有限（可正可负）·否则回退', () => {
    expect(fin(1.08, 1)).toBe(1.08);
    expect(fin(-0.5, 0)).toBe(-0.5); // 亮度可负
    expect(fin(NaN, 1)).toBe(1);
    expect(fin(undefined, 1)).toBe(1);
    expect(fin(Infinity, 0)).toBe(0);
  });
});
