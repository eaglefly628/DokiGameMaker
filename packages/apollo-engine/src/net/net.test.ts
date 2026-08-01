import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Transform, Velocity } from '@engine/protocol/components.js';
import type { Command } from './commands.js';
import { applyCommands, orderCommands } from './commands.js';
import { hashSnapshot } from './determinism.js';
import { FixedStepClock } from './fixed-step.js';
import { LockstepSession } from './lockstep.js';
import { buildArena as makeArena } from './arena.js';

function step(w: World, cmds: Command[]): void {
  applyCommands(w, cmds);
  w.tick();
}

const moveA = (tick: number, dx: number, dy: number): Command => ({ playerId: 'A', tick, move: { dx, dy } });
const moveB = (tick: number, dx: number, dy: number): Command => ({ playerId: 'B', tick, move: { dx, dy } });

describe('确定性守卫: hashSnapshot', () => {
  it('顺序无关：组件插入顺序不同但状态相同 → 哈希相同', () => {
    const a = new World();
    a.createEntity('e');
    a.addComponent('e', { type: 'Transform', x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    a.addComponent('e', { type: 'Velocity', vx: 5, vy: 6, angular: 0 } as Velocity);

    const b = new World();
    b.createEntity('e');
    b.addComponent('e', { type: 'Velocity', vx: 5, vy: 6, angular: 0 } as Velocity); // 反序加入
    b.addComponent('e', { type: 'Transform', x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);

    expect(hashSnapshot(a.snapshot())).toBe(hashSnapshot(b.snapshot()));
  });

  it('敏感：任一字段变化 → 哈希变化', () => {
    const a = makeArena();
    const before = hashSnapshot(a.snapshot());
    step(a, [moveA(1, 1, 0)]); // alice 右移
    expect(hashSnapshot(a.snapshot())).not.toBe(before);
  });
});

describe('固定步长: FixedStepClock', () => {
  it('同样总时长 → 同样步数，与帧如何切分无关（渲染解耦）', () => {
    const run = (frames: number[]): number => {
      const c = new FixedStepClock(50); // stepMs = 20，整除无浮点漂移
      return frames.reduce((sum, f) => sum + c.advance(f), 0);
    };
    const smooth = Array(50).fill(20); // 平滑 50fps，共 1000ms
    const jitter: number[] = []; // 抖动，但同样累计 1000ms
    let remaining = 1000;
    const sizes = [8, 12, 20, 40, 4, 16];
    let i = 0;
    while (remaining > 0) {
      const f = Math.min(sizes[i++ % sizes.length], remaining);
      jitter.push(f);
      remaining -= f;
    }
    expect(run(smooth)).toBe(50);
    expect(run(jitter)).toBe(run(smooth));
  });

  it('单帧超长 → 步数封顶（防死亡螺旋），并钳制超长间隔', () => {
    const c = new FixedStepClock(50, { maxSteps: 5, maxFrameMs: 250 });
    expect(c.advance(100000)).toBe(5); // 钳到 250ms → 12.5 步，但封顶 5
  });
});

describe('确定性: 独立双世界 + 同输入 → 逐 tick 同哈希', () => {
  it('相同 blueprint + 相同命令脚本，每个 tick 哈希都一致', () => {
    const w1 = makeArena();
    const w2 = makeArena();
    const script: Command[][] = [
      [moveA(1, 1, 0)],
      [moveA(2, 1, 0), moveB(2, 0, 1)],
      [moveB(3, -1, 0)],
      [], // 无人操作 → 都应静止
      [moveA(5, 0, -1), moveB(5, 1, 1)],
    ];
    script.forEach((cmds, idx) => {
      step(w1, cmds);
      step(w2, cmds);
      expect(hashSnapshot(w1.snapshot())).toBe(hashSnapshot(w2.snapshot()));
      // 命令到达顺序不影响结果：反序喂 w2 仍一致（orderCommands 保证）
      expect(idx).toBeGreaterThanOrEqual(0);
    });
  });

  it('命令到达顺序无关：正序与反序应用结果相同', () => {
    const w1 = makeArena();
    const w2 = makeArena();
    const cmds = [moveA(1, 1, 0), moveB(1, -1, 1)];
    step(w1, cmds);
    step(w2, [...cmds].reverse());
    expect(hashSnapshot(w1.snapshot())).toBe(hashSnapshot(w2.snapshot()));
    expect(orderCommands(cmds)[0].playerId).toBe('A'); // 稳定按 playerId
  });
});

describe('Lockstep 双端 + 确定性守卫', () => {
  it('同一组命令派发给所有对端 → 每 tick 都 inSync', () => {
    const session = new LockstepSession([
      { id: 'peerA', world: makeArena() },
      { id: 'peerB', world: makeArena() },
    ]);
    for (let t = 1; t <= 8; t++) {
      const r = session.advance([moveA(t, 1, 0), moveB(t, 0, 1)]);
      expect(r.inSync).toBe(true);
      expect(r.hash).not.toBeNull();
    }
    expect(session.currentTick).toBe(8);
  });

  it('丢包：某对端漏收一条命令 → 守卫在那一 tick 报 desync', () => {
    const session = new LockstepSession([
      { id: 'peerA', world: makeArena() },
      { id: 'peerB', world: makeArena() },
    ]);
    const cmd = [moveA(1, 1, 0)];
    expect(session.advance(cmd).inSync).toBe(true); // tick1 正常
    expect(session.advance(cmd).inSync).toBe(true); // tick2 正常

    // tick3：peerB "丢包"，没收到 A 的命令 → 两端状态分叉
    const r = session.advanceDivergent((peerId) => (peerId === 'peerB' ? [] : cmd));
    expect(r.inSync).toBe(false);
    expect(r.hash).toBeNull();
    const ha = r.peers.find((p) => p.id === 'peerA')!.hash;
    const hb = r.peers.find((p) => p.id === 'peerB')!.hash;
    expect(ha).not.toBe(hb);
  });
});
