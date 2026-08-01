import { describe, it, expect, afterEach, vi } from 'vitest';
import { Engine } from './engine.js';

// REQ-LOOPSTOP 回归：循环内「重挂下一帧」必须排在 notifyListeners() 之前。
// 旧序（先通知、后重挂）下，监听者在回调里同步调 engine.stop() 只取消得掉旧 rafId，
// 紧接着那行重挂又把 loop 挂回去 —— 局终冻结形同虚设，sim 停不下来。
// 本文件钉死「回调里同步 stop → 无后续帧」+「stop 后 start 能重启」两条语义。

// 手驱 RAF 替身（node 测试环境无 requestAnimationFrame）：pump() 手动推一帧；
// pending = 当前"已挂上的下一帧"数量 —— 停机是否真生效就看它。
function fakeRaf(): { readonly pending: number; pump(): void } {
  let nextId = 1;
  let clock = 0;
  const queued = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    const id = nextId++;
    queued.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number): void => { queued.delete(id); });
  return {
    get pending(): number { return queued.size; },
    pump(): void {
      // 时间只增且至少跨一个 step（既晚于 start() 取的 performance.now()，又不吃真实抖动）。
      clock = Math.max(clock, performance.now()) + 16.7;
      const due = [...queued.values()];
      queued.clear();
      for (const cb of due) cb(clock);
    },
  };
}

describe('Engine · 循环停机（监听者回调里同步 stop 必须停得下来）', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('监听者回调里同步 stop() → 不再有后续帧（旧序下刚挂的帧会残留 → 该测必红）', () => {
    const raf = fakeRaf();
    const eng = new Engine();
    let notified = 0;
    eng.subscribe(() => { notified++; eng.stop(); });

    eng.start();
    expect(raf.pending).toBe(1); // 起跑帧已挂

    raf.pump(); // 第 1 帧：跑 sim → 通知 → 监听者同步 stop()
    expect(notified).toBe(1);
    expect(raf.pending).toBe(0); // stop() 取消的正是本帧刚挂上的下一帧

    const version = eng.world.getVersion();
    raf.pump(); // 再推：已无挂起帧 → loop 不该再跑
    expect(notified).toBe(1);
    expect(eng.world.getVersion()).toBe(version); // sim 真冻住了
  });

  it('stop() 后 start() 可重启：帧重新挂上、通知与 tick 继续', () => {
    const raf = fakeRaf();
    const eng = new Engine();
    let notified = 0;
    eng.subscribe(() => { notified++; });

    eng.start();
    raf.pump();
    expect(notified).toBe(1);
    expect(raf.pending).toBe(1); // 未停机 → 下一帧照常挂着

    eng.stop();
    expect(raf.pending).toBe(0);
    raf.pump();
    expect(notified).toBe(1); // 停机后不再有帧

    eng.start(); // 重启
    expect(raf.pending).toBe(1);
    const version = eng.world.getVersion();
    raf.pump();
    raf.pump();
    expect(notified).toBe(3);
    expect(eng.world.getVersion()).toBeGreaterThan(version); // sim 又在推进
    expect(raf.pending).toBe(1);

    eng.stop();
    expect(raf.pending).toBe(0);
  });
});
