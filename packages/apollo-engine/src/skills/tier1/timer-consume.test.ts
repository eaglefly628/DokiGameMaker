import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Timer, Frame, TimerDone, DestroyRequest } from '@engine/protocol/components.js';
import { timerCapability } from '../atoms/timer/index.js';
import { lifetimeCapability } from './lifetime.js';
import { animationCapability } from './animation.js';

// BUG-003 回归：TimerDone 曾被 lifetime + animation 双 consume（World 全局删除）→ 先跑的 lifetime 删光，
// animation 同拍饿死丢帧。修复：生产者 timer-advance 每拍自清 + 消费者改 reads → 多家共读不抢占。

function mk(): World {
  const w = new World();
  // 注册序：lifetime 在 animation 前（重现"先跑者删光"的旧条件）。
  for (const cap of [timerCapability, lifetimeCapability, animationCapability]) {
    for (const s of cap.systems) w.addSystem(s);
  }
  return w;
}

describe('BUG-003 回归：lifetime 与 animation 共读 TimerDone，不互相饿死', () => {
  it('同拍：life 计时器 + 动画帧计时器都到点 → DestroyRequest 与 帧推进 同时发生', () => {
    const w = mk();
    // 子弹：life 计时（duration 1 → 本 tick 到点）。
    w.createEntity('bullet');
    w.addComponent('bullet', { type: 'Timer', id: 'life', elapsed: 0, duration: 1, loop: false } as Timer);
    // 精灵：动画帧计时（duration 1 → 本 tick 到点）+ Frame。
    w.createEntity('sprite');
    w.addComponent('sprite', { type: 'Timer', id: 'anim', elapsed: 0, duration: 1, loop: true } as Timer);
    w.addComponent('sprite', { type: 'Frame', index: 0, total: 3 } as Frame);

    w.tick();

    // lifetime 收到 bullet 的 TimerDone(life) → DestroyRequest。
    expect(w.getComponent<DestroyRequest>('bullet', 'DestroyRequest')).toBeDefined();
    // ★ animation 没被饿死：sprite 帧推进 0→1（修复前因 lifetime 全局 consume 删光 TimerDone，这里会停在 0）。
    expect(w.getComponent<Frame>('sprite', 'Frame')!.index).toBe(1);
  });

  it('生产者自清：下一拍 timer-advance 清掉上拍 TimerDone（一拍生命周期，不重复推进）', () => {
    const w = mk();
    w.createEntity('sprite');
    w.addComponent('sprite', { type: 'Timer', id: 'anim', elapsed: 0, duration: 2, loop: false } as Timer);
    w.addComponent('sprite', { type: 'Frame', index: 0, total: 3 } as Frame);

    w.tick(); // elapsed 0→1，未到点，无 TimerDone
    expect(w.getComponent<Frame>('sprite', 'Frame')!.index).toBe(0);
    w.tick(); // elapsed 1→2 到点 → TimerDone → 帧 0→1
    expect(w.getComponent<Frame>('sprite', 'Frame')!.index).toBe(1);
    expect(w.hasComponent('sprite', 'TimerDone')).toBe(true); // 本拍产生，留存供消费
    w.tick(); // 非 loop 不再前进；timer-advance 清掉上拍 TimerDone → 帧不再推进
    expect(w.getComponent<Frame>('sprite', 'Frame')!.index).toBe(1);
    expect(w.hasComponent('sprite', 'TimerDone')).toBe(false); // 已被生产者自清
  });
});
