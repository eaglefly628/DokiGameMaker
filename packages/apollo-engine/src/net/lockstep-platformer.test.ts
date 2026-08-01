import { describe, it, expect } from 'vitest';
import { LockstepClient } from './lockstep-tab.js';
import type { Channel, NetMsg, Dir } from './lockstep-tab.js';
import { buildPlatformerLockstepWorld } from '../assembly/platformer-lockstep.js';

// 内存版 BroadcastChannel（与 lockstep-tab.test 同构）。log 记录所有报文用于事后逐 tick 比对。
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

describe('lockstep 平台世界 — 双标签页帧同步（重力+碰撞+斜坡+跳跃）', () => {
  it('两个对端跑同一平台世界、各异输入（含跳跃）→ 同 tick 两端逐位同哈希', () => {
    const bus = new MockBus();
    let clock = 0;
    const now = (): number => clock;
    let inA: Dir = { dx: 0, dy: 0, jump: 0 };
    let inB: Dir = { dx: 0, dy: 0, jump: 0 };
    const mk = (peer: string, get: () => Dir): LockstepClient =>
      new LockstepClient({ peerId: peer, channel: bus.channel(peer), getInput: get, now, tickRate: 30, inputDelay: 4, buildWorld: buildPlatformerLockstepWorld });

    const A = mk('A', () => inA);
    const B = mk('B', () => inB);

    // 发现阶段 → 收敛到 epoch 'A|B'
    for (let i = 0; i < 12; i++) {
      clock += STEP;
      A.pump(STEP);
      B.pump(STEP);
    }
    expect(A.view().epoch).toBe('A|B');
    expect(A.view().peerCount).toBe(2);

    // 各异且变化的输入：A 右移并间歇跳，B 左移并间歇跳
    const seqA: Dir[] = [
      { dx: 1, dy: 0, jump: 1 }, { dx: 1, dy: 0, jump: 0 }, { dx: 0, dy: 0, jump: 1 }, { dx: -1, dy: 0, jump: 0 },
    ];
    const seqB: Dir[] = [
      { dx: -1, dy: 0, jump: 0 }, { dx: 0, dy: 0, jump: 1 }, { dx: 1, dy: 0, jump: 0 }, { dx: 0, dy: 0, jump: 0 },
    ];
    for (let s = 0; s < 150; s++) {
      inA = seqA[s % seqA.length];
      inB = seqB[s % seqB.length];
      clock += STEP;
      A.pump(STEP);
      B.pump(STEP);
    }

    // 帧同步硬证据：epoch 'A|B' 下，凡两端都报告过 hash 的 tick，逐位相等。
    const hashAt = new Map<string, string>();
    const ticks = new Set<number>();
    for (const m of bus.log) {
      if (m.t !== 'hash' || m.epoch !== 'A|B') continue;
      hashAt.set(`${m.peer}@${m.tick}`, m.hash);
      ticks.add(m.tick);
    }
    let compared = 0;
    for (const tk of ticks) {
      const ha = hashAt.get(`A@${tk}`);
      const hb = hashAt.get(`B@${tk}`);
      if (ha !== undefined && hb !== undefined) {
        expect(ha).toBe(hb); // 同 tick、两端逐位一致 → 重力/碰撞/斜坡/跳跃全确定
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(40); // 比对了足够多 tick
  });
});
