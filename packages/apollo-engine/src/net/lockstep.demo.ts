import type { World } from '@engine/core/world.js';
import type { Transform } from '@engine/protocol/components.js';
import type { Command } from './commands.js';
import { buildArena } from './arena.js';
import { LockstepSession } from './lockstep.js';
import { FixedStepClock } from './fixed-step.js';

// 无头跑多人地基演示：固定步长 + lockstep 双端 + 确定性守卫(desync 检测)。
// 运行：npm run net:demo

const moveA = (tick: number, dx: number, dy: number): Command => ({ playerId: 'A', tick, move: { dx, dy } });
const moveB = (tick: number, dx: number, dy: number): Command => ({ playerId: 'B', tick, move: { dx, dy } });
const pos = (w: World, id: string): string => {
  const t = w.getComponent<Transform>(id, 'Transform')!;
  return `(${t.x.toString().padStart(3)},${t.y.toString().padStart(3)})`;
};

// ─────────────────────────────────────────────────────────────
console.log('══ 固定步长：模拟与帧率解耦（同样总时长 → 同样步数）══');
const runClock = (label: string, frames: number[]): void => {
  const c = new FixedStepClock(60); // 60Hz，stepMs ≈ 16.67
  const steps = frames.reduce((s, f) => s + c.advance(f), 0);
  const total = frames.reduce((s, f) => s + f, 0);
  console.log(`  ${label.padEnd(18)} 共 ${Math.round(total)}ms / ${frames.length} 帧 → ${steps} 个模拟步`);
};
// 抖动帧：帧长各异但累计同样是 1 秒（且都在追赶上限内，不丢步）
const jitter: number[] = [];
{
  let remaining = 1000;
  const sizes = [25, 8, 33, 4, 70, 16, 50, 9, 40, 7, 60, 30];
  let i = 0;
  while (remaining > 0) {
    const f = Math.min(sizes[i++ % sizes.length], remaining);
    jitter.push(f);
    remaining -= f;
  }
}
runClock('平滑 60fps', Array(60).fill(1000 / 60));
runClock('卡顿 抖动帧', jitter);
console.log('  → 同样 1 秒，帧怎么切分都跑约 60 个模拟步：任何机器上"一个 tick"都是同一份模拟时间。\n');

// ─────────────────────────────────────────────────────────────
console.log('══ 场景1：双端 lockstep（同一组命令派发给两端）══');
console.log('  A 持续右移(speed 3)，B 持续下移(speed 2)。两端各跑各的，逐 tick 比对哈希：');
const w1a = buildArena();
const w1b = buildArena();
const s1 = new LockstepSession([
  { id: 'P1', world: w1a },
  { id: 'P2', world: w1b },
]);
for (let t = 1; t <= 5; t++) {
  const r = s1.advance([moveA(t, 1, 0), moveB(t, 0, 1)]);
  const [pa, pb] = r.peers;
  console.log(
    `  tick ${t}  P1 ${pa.hash}  P2 ${pb.hash}  ${r.inSync ? '✅ SYNC' : '❌ DESYNC'}` +
      `   alice@P1 ${pos(w1a, 'alice')}  alice@P2 ${pos(w1b, 'alice')}`,
  );
}
console.log('  → 确定性 + 相同输入 ⇒ 两端哈希逐 tick 完全一致。\n');

// ─────────────────────────────────────────────────────────────
console.log('══ 场景2：tick3 时 P2 "丢包"（漏收 A 的命令）→ 确定性守卫报警 ══');
const s2 = new LockstepSession([
  { id: 'P1', world: buildArena() },
  { id: 'P2', world: buildArena() },
]);
let firstDesync = 0;
for (let t = 1; t <= 5; t++) {
  const cmd = [moveA(t, 1, 0)]; // 只有 A 在动
  const r =
    t === 3
      ? s2.advanceDivergent((peerId) => (peerId === 'P2' ? [] : cmd)) // P2 这一 tick 没收到
      : s2.advance(cmd);
  const [pa, pb] = r.peers;
  if (!r.inSync && firstDesync === 0) firstDesync = t;
  console.log(
    `  tick ${t}  P1 ${pa.hash}  P2 ${pb.hash}  ${r.inSync ? '✅ SYNC' : '❌ DESYNC'}` +
      `${t === 3 ? '   ← P2 丢包' : ''}`,
  );
}
console.log(`  → 守卫在 tick ${firstDesync} 立刻发现两端状态分叉：联机里这就是"必须重连/纠正"的信号。`);
