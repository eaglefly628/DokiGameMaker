import { Engine } from '../runtime/engine.js';
import { demoBlueprint } from './demo.assembly.js';
import { AsciiRenderer } from '@renderer/index.js';
import { Tracer, Recorder, replay, formatChange } from '../debug/index.js';
import type { Transform } from '@engine/protocol/components.js';

// 无头跑演示：可视化(AsciiRenderer) + skill 协作日志(Tracer) + record/replay 校验。
// 运行：npm run demo

const engine = new Engine();
engine.load(demoBlueprint);
const tracer = new Tracer(engine.world).attach();
const ascii = new AsciiRenderer({ width: 28, height: 5, worldWidth: 130, worldHeight: 200 });

console.log('系统拓扑顺序:', engine.world.getSortedSystems().map((s) => s.id).join(' → '));

console.log('\n══ 可视化 (AsciiRenderer · B=子弹  #=墙) ══');
for (let t = 1; t <= 13; t++) {
  engine.world.tick();
  if ([1, 5, 9, 11, 12].includes(t)) {
    const tr = engine.world.getComponent<Transform>('bullet', 'Transform');
    console.log(`\n[tick ${String(t).padStart(2)}]${tr ? ` bullet.x=${tr.x}` : ' bullet despawned'}`);
    console.log(ascii.render(engine.world));
  }
}

console.log('\n══ skill 协作 (tick 12 · Tracer 逐系统 diff) ══');
for (const tr of tracer.traces.filter((t) => t.tick === 12)) {
  const io = [
    tr.reads.length ? `reads[${tr.reads.join(',')}]` : '',
    tr.writes.length ? `writes[${tr.writes.join(',')}]` : '',
    tr.consumes.length ? `consumes[${tr.consumes.join(',')}]` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const delta = tr.changes.length ? tr.changes.map(formatChange).join(' ') : '(no change)';
  console.log(`  ${tr.systemId.padEnd(15)} ${io.padEnd(44)} ${delta}`);
}

console.log('\n══ record / replay ══');
const e2 = new Engine();
e2.load(demoBlueprint);
const recorder = new Recorder(e2.world);
recorder.run(13);
const result = replay(recorder.recording, demoBlueprint.capabilities);
console.log(
  `录制 ${result.ticks} ticks，回放确定性: ${
    result.deterministic ? '✅ 完全一致（无 bug）' : `❌ ${result.divergences.length} 处分歧`
  }`,
);
