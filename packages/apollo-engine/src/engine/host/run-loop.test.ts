// createRunLoop 契约测试（REQ-SHELL ①）：开/停/重开 · 差分重绘 · 局终冻结（幂等+延迟）· overlay 挂摘。
import { describe, it, expect } from 'vitest';
import { createRunLoop, type SimHandle } from './run-loop.js';

interface FakeState { hp: number; status: 'playing' | 'over'; note?: string }

/** 手动驱动的引擎替身（结构面 = SimHandle）：tick() 手动触发一次订阅回调。 */
function makeFakeSim() {
  const listeners = new Set<() => void>();
  const log: string[] = [];
  const sim: SimHandle = {
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); log.push('unsub'); }; },
    start() { log.push('start'); },
    stop() { log.push('stop'); },
  };
  return { sim, log, tick: () => { for (const fn of [...listeners]) fn(); }, listenerCount: () => listeners.size };
}

/** 一套完整的宿主接线（态放在闭包变量里·测试直接改它模拟世界推进）。 */
function harness(over = true) {
  let state: FakeState = { hp: 3, status: 'playing' };
  const created: Array<ReturnType<typeof makeFakeSim>> = [];
  const painted: FakeState[] = [];
  const events: string[] = [];
  const deferred: Array<() => void> = [];

  const loop = createRunLoop<FakeState, { fake: ReturnType<typeof makeFakeSim> }>({
    create() { const fake = makeFakeSim(); created.push(fake); events.push('create'); return { fake }; },
    engineOf: (s) => s.fake.sim,
    read: () => state,
    dispose: () => events.push('dispose'),
    reset: () => events.push('reset'),
    sig: (st) => `${st.hp}|${st.status}`,
    paint: (st) => { painted.push({ ...st }); },
    over: over ? (st) => st.status === 'over' : undefined,
    onOver: (st) => { events.push('onOver'); st.note = '结算'; }, // 就地补结算字段 → paint 应看得见
    overlay: {
      open: () => events.push('overlay:open'),
      update: () => events.push('overlay:update'),
      close: () => events.push('overlay:close'),
    },
    defer: (fn) => { deferred.push(fn); },
  });

  return {
    loop, created, painted, events, deferred,
    set: (patch: Partial<FakeState>) => { state = { ...state, ...patch }; },
    flush: () => { const q = deferred.splice(0); for (const fn of q) fn(); },
    last: () => created[created.length - 1],
  };
}

describe('createRunLoop（引擎公用宿主运行环·REQ-SHELL ①）', () => {
  it('start：建局 → 订阅 → 起跑 → 首帧立刻投影（不等第一次 tick）', () => {
    const h = harness();
    h.loop.start();
    expect(h.events).toEqual(['create']);
    expect(h.last().log).toEqual(['start']);
    expect(h.last().listenerCount()).toBe(1);
    expect(h.painted).toEqual([{ hp: 3, status: 'playing' }]); // 首帧已画
    expect(h.loop.session).not.toBeNull();
  });

  it('start 幂等：已在跑再调不建第二局', () => {
    const h = harness();
    h.loop.start();
    h.loop.start();
    expect(h.created.length).toBe(1);
  });

  it('差分重绘：签名不变的 tick 不重绘·变了才重绘', () => {
    const h = harness();
    h.loop.start();
    h.last().tick();
    h.last().tick();
    expect(h.painted.length).toBe(1); // 仍只有首帧那次
    h.set({ hp: 2 });
    h.last().tick();
    expect(h.painted.length).toBe(2);
    expect(h.painted[1].hp).toBe(2);
  });

  it('invalidate：作废签名 → 下一帧必重绘（同态也画·切主题/静音后强制刷）', () => {
    const h = harness();
    h.loop.start();
    h.last().tick();
    expect(h.painted.length).toBe(1);
    h.loop.invalidate();
    h.loop.refresh();
    expect(h.painted.length).toBe(2);
  });

  it('局终：onOver 只跑一次（幂等）+ 挂浮层 + 冻结经 defer（不同步 stop·BUG-04）', () => {
    const h = harness();
    h.loop.start();
    h.set({ status: 'over' });
    h.last().tick();
    expect(h.events).toEqual(['create', 'onOver', 'overlay:open']);
    expect(h.last().log).toEqual(['start']); // 冻结还没执行——只入了 defer 队列
    expect(h.deferred.length).toBe(1);
    h.flush();
    expect(h.last().log).toEqual(['start', 'stop']); // 冻结真落地
    // 再来几帧：onOver 不再触发、浮层改走 update
    h.loop.refresh();
    h.loop.refresh();
    expect(h.events.filter((e) => e === 'onOver').length).toBe(1);
    expect(h.events.filter((e) => e === 'overlay:update').length).toBe(2);
  });

  it('局终首帧强制重绘，且 onOver 就地补的字段被 paint 看见（名次/星级不在 sig 里也不丢）', () => {
    const h = harness();
    h.loop.start();
    h.set({ status: 'over' });
    h.last().tick();
    expect(h.painted[h.painted.length - 1]).toEqual({ hp: 3, status: 'over', note: '结算' });
  });

  it('回到局内（续关/复活）：摘浮层 + 局终门重新武装（onOver 可再触发）', () => {
    const h = harness();
    h.loop.start();
    h.set({ status: 'over' });
    h.last().tick();
    h.set({ status: 'playing' });
    h.loop.refresh();
    expect(h.events).toContain('overlay:close');
    h.set({ status: 'over' });
    h.loop.refresh();
    expect(h.events.filter((e) => e === 'onOver').length).toBe(2);
  });

  it('freezeOnOver:false → 局终不停机（宿主自己管冻结）', () => {
    const fake = makeFakeSim();
    const deferred: Array<() => void> = [];
    const loop = createRunLoop<FakeState, SimHandle>({
      create: () => fake.sim,
      engineOf: (s) => s,
      read: () => ({ hp: 1, status: 'over' }),
      sig: (st) => st.status,
      paint: () => {},
      over: () => true,
      freezeOnOver: false,
      defer: (fn) => { deferred.push(fn); },
    });
    loop.start();
    expect(deferred.length).toBe(0);
    expect(fake.log).toEqual(['start']);
  });

  it('stop：退订 + 停机 + dispose + 摘浮层；停后 refresh/tick 都不再投影', () => {
    const h = harness();
    h.loop.start();
    h.set({ status: 'over' });
    h.last().tick();
    const before = h.painted.length;
    h.loop.stop();
    expect(h.last().log).toEqual(['start', 'unsub', 'stop']);
    expect(h.events).toContain('dispose');
    expect(h.events).toContain('overlay:close');
    expect(h.loop.session).toBeNull();
    h.loop.refresh();
    expect(h.painted.length).toBe(before); // 停后不投影
  });

  it('restart：reset → 释放旧局 → 建新局；旧局 defer 的冻结不会误停新局', () => {
    const h = harness();
    h.loop.start();
    h.set({ status: 'over' });
    h.last().tick();           // 局终 → 冻结入队（尚未执行）
    h.set({ status: 'playing' });
    h.loop.restart();
    expect(h.created.length).toBe(2);
    expect(h.events.filter((e) => e === 'reset').length).toBe(1);
    expect(h.events.filter((e) => e === 'dispose').length).toBe(1);
    h.flush();                 // 旧局那条冻结现在才跑
    expect(h.created[1].log).toEqual(['start']); // 新局没被旧冻结停掉
    expect(h.created[0].log).toEqual(['start', 'unsub', 'stop']);
  });

  it('无 over 回调（常驻 HUD 的游戏）：永不冻结、永不挂浮层', () => {
    const h = harness(false);
    h.loop.start();
    h.set({ status: 'over' });
    h.last().tick();
    expect(h.events).toEqual(['create']);
    expect(h.deferred.length).toBe(0);
  });
});
