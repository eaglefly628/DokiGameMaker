// Post3D 暗角 + 命中闪白（超休闲缺口 E·render-only）：FlashDecay trauma 衰减 + postSig 覆盖新字段。
import { describe, it, expect } from 'vitest';
import { FlashDecay } from './post.js';
import { postSig } from './stats.js';
import type { Post3D } from '@engine/protocol/components.js';

describe('FlashDecay（命中闪白·trigger bump → 衰减到 0）', () => {
  it('首见基线：静态带 trigger 装载不白闪·bump 才闪', () => {
    const f = new FlashDecay();
    expect(f.update({ trigger: 0, decay: 2 }, 1000)).toBe(0); // 首见=基线·不闪
    expect(f.update({ trigger: 0, decay: 2 }, 1016)).toBe(0); // 同 trigger 仍不闪
    expect(f.update({ trigger: 1, decay: 2 }, 1032)).toBeCloseTo(1); // bump 才闪
  });
  it('无 flash → 0；bump 注入 1；按 decay 衰减；归零', () => {
    const f = new FlashDecay();
    expect(f.update(undefined, 0)).toBe(0);
    f.update({ trigger: 0, decay: 2 }, 900); // 先建立基线（首见）
    expect(f.update({ trigger: 1, decay: 2 }, 1000)).toBeCloseTo(1);   // bump → 1
    expect(f.update({ trigger: 1, decay: 2 }, 1250)).toBeCloseTo(0.5); // +0.25s·decay2
    expect(f.update({ trigger: 1, decay: 2 }, 1600)).toBe(0);          // +0.6s → 0
    expect(f.update({ trigger: 2, decay: 2 }, 1700)).toBeCloseTo(1);   // 再 bump → 重注入
  });
  it('decay 缺省 3', () => {
    const f = new FlashDecay();
    f.update({ trigger: 0 }, 0); // 基线
    f.update({ trigger: 1 }, 0); // bump → amt1·t0=0
    expect(f.update({ trigger: 1 }, 1000)).toBeLessThanOrEqual(0); // 1s·decay3 → 已归零
  });
});

describe('postSig 覆盖暗角 + 闪白触发（改即脏·渲染器重渲）', () => {
  const base: Post3D = { type: 'Post3D' };
  it('暗角强度变 → 签名变', () => {
    expect(postSig({ ...base, vignette: { intensity: 0.3 } })).not.toBe(postSig({ ...base, vignette: { intensity: 0.6 } }));
  });
  it('闪白 trigger bump → 签名变（捕获触发帧）', () => {
    expect(postSig({ ...base, flash: { trigger: 1 } })).not.toBe(postSig({ ...base, flash: { trigger: 2 } }));
  });
});
