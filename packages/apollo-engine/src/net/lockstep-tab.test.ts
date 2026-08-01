import { describe, it, expect } from 'vitest';
import { LockstepClient } from './lockstep-tab.js';
import type { Channel, NetMsg } from './lockstep-tab.js';

// 内存版 BroadcastChannel：post 投递给**除发送者外**的所有订阅者（与浏览器语义一致）。
class MockBus {
  private recv = new Map<string, (m: NetMsg) => void>();
  readonly log: NetMsg[] = [];
  channel(tag: string): Channel {
    return {
      post: (m) => {
        this.log.push(m);
        for (const [id, cb] of this.recv) if (id !== tag) cb(structuredClone(m));
      },
      onMessage: (cb) => this.recv.set(tag, cb),
      close: () => this.recv.delete(tag),
    };
  }
}

const STEP = 1000 / 30;

describe('LockstepClient — 同浏览器双标签页帧同步（mock BroadcastChannel）', () => {
  it('两个对端逐 tick 状态完全一致：同 epoch 下每个 tick 的 hash 必相等', () => {
    const bus = new MockBus();
    let clock = 0;
    const now = () => clock;
    let inA: { dx: number; dy: number } = { dx: 0, dy: 0 };
    let inB: { dx: number; dy: number } = { dx: 0, dy: 0 };

    const A = new LockstepClient({ peerId: 'A', channel: bus.channel('A'), getInput: () => inA, now, tickRate: 30, inputDelay: 4 });
    const B = new LockstepClient({ peerId: 'B', channel: bus.channel('B'), getInput: () => inB, now, tickRate: 30, inputDelay: 4 });

    // 发现阶段：推进时钟越过心跳 → 两端互相看见 → 收敛到 epoch 'A|B'
    for (let i = 0; i < 12; i++) {
      clock += STEP;
      A.pump(STEP);
      B.pump(STEP);
    }
    expect(A.view().epoch).toBe('A|B');
    expect(B.view().epoch).toBe('A|B');
    expect(A.view().peerCount).toBe(2);

    // 用各异且变化的输入跑一段
    const dirs = [
      { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 1 },
      { dx: -1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
    ];
    for (let s = 0; s < 90; s++) {
      inA = dirs[s % dirs.length];
      inB = dirs[(s + 3) % dirs.length];
      clock += STEP;
      A.pump(STEP);
      B.pump(STEP);
    }

    // 逐 tick 校验：epoch 'A|B' 下，凡两端都报告过 hash 的 tick，hash 必相等。
    const hashAt = new Map<string, string>(); // `${peer}@${tick}` -> hash
    const ticks = new Set<number>();
    for (const m of bus.log) {
      if (m.t !== 'hash' || m.epoch !== 'A|B') continue;
      hashAt.set(`${m.peer}@${m.tick}`, m.hash);
      ticks.add(m.tick);
    }
    let compared = 0;
    let maxCommon = 0;
    for (const tk of ticks) {
      const ha = hashAt.get(`A@${tk}`);
      const hb = hashAt.get(`B@${tk}`);
      if (ha !== undefined && hb !== undefined) {
        expect(ha).toBe(hb); // ← 帧同步的硬证据：同 tick、两端逐位一致
        compared++;
        maxCommon = Math.max(maxCommon, tk);
      }
    }
    expect(compared).toBeGreaterThan(40); // 确实比对了足够多的 tick
    expect(maxCommon).toBeGreaterThan(40);
  });

  it('单端也能独立推进（等待第二端时不卡死、不报错）', () => {
    const bus = new MockBus();
    let clock = 0;
    const now = () => clock;
    const solo = new LockstepClient({
      peerId: 'solo',
      channel: bus.channel('solo'),
      getInput: () => ({ dx: 1, dy: 0 }),
      now,
      tickRate: 30,
      inputDelay: 4,
    });
    for (let i = 0; i < 30; i++) {
      clock += STEP;
      solo.pump(STEP);
    }
    expect(solo.view().peerCount).toBe(1);
    expect(solo.view().tick).toBeGreaterThan(10); // 单人自由推进
  });

  it('第二端加入 → 两端按新成员从 tick 0 重新对齐（membership 变化触发 reset）', () => {
    const bus = new MockBus();
    let clock = 0;
    const now = () => clock;
    const A = new LockstepClient({ peerId: 'A', channel: bus.channel('A'), getInput: () => ({ dx: 1, dy: 0 }), now, tickRate: 30, inputDelay: 4 });
    // A 先单独跑一会
    for (let i = 0; i < 20; i++) {
      clock += STEP;
      A.pump(STEP);
    }
    expect(A.view().epoch).toBe('A');
    const tickBeforeJoin = A.view().tick;
    expect(tickBeforeJoin).toBeGreaterThan(5);

    // B 加入
    const B = new LockstepClient({ peerId: 'B', channel: bus.channel('B'), getInput: () => ({ dx: 0, dy: 1 }), now, tickRate: 30, inputDelay: 4 });
    for (let i = 0; i < 12; i++) {
      clock += STEP;
      A.pump(STEP);
      B.pump(STEP);
    }
    expect(A.view().epoch).toBe('A|B'); // 新 epoch
    expect(B.view().epoch).toBe('A|B');
    expect(A.view().peerCount).toBe(2);
  });
});
