// 异步资产就绪版本号（修脏帧跳渲吞掉迟到资产帧·REQ-3D-资产就绪自动重渲）：纯逻辑单测。
import { describe, it, expect } from 'vitest';
import { AssetReadyTracker } from './asset-ready.js';

describe('AssetReadyTracker（迟到资产就绪 → gen++ 迫使重绘）', () => {
  it('待办→就绪：迟到贴图就绪那帧 gen++（其余帧不变）', () => {
    const t = new AssetReadyTracker();
    expect(t.gen).toBe(0);
    t.mark('tex', false); // 首次请求未就绪 → 入待办
    expect(t.gen).toBe(0); expect(t.pendingCount).toBe(1);
    t.mark('tex', false); // 仍加载中（多帧）→ gen 不动（静态场景跳渲·正确）
    expect(t.gen).toBe(0);
    t.mark('tex', true);  // 就绪那帧 → gen++（renderSig 变·迫使重绘上屏）
    expect(t.gen).toBe(1); expect(t.pendingCount).toBe(0);
  });

  it('就绪后再 mark（已出待办）不再 bump——收敛不反复重渲', () => {
    const t = new AssetReadyTracker();
    t.mark('tex', false);
    t.mark('tex', true);
    expect(t.gen).toBe(1);
    t.mark('tex', true); // 后续帧仍就绪·已不在待办 → 不 bump
    t.mark('tex', true);
    expect(t.gen).toBe(1);
  });

  it('首帧即就绪（从未进待办）不 bump——非「迟到」·正常渲染已覆盖', () => {
    const t = new AssetReadyTracker();
    t.mark('tex', true);
    expect(t.gen).toBe(0); expect(t.pendingCount).toBe(0);
  });

  it('多资产各自计一枚：两张迟到贴图分别就绪 → gen 累加到 2', () => {
    const t = new AssetReadyTracker();
    t.mark('a', false); t.mark('b', false);
    expect(t.gen).toBe(0); expect(t.pendingCount).toBe(2);
    t.mark('a', true); t.mark('b', false); // a 就绪·b 仍等
    expect(t.gen).toBe(1); expect(t.pendingCount).toBe(1);
    t.mark('b', true);
    expect(t.gen).toBe(2); expect(t.pendingCount).toBe(0);
  });
});
