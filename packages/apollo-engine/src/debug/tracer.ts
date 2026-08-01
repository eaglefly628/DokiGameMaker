import type { World } from '@engine/core/world.js';
import type { SystemDeclaration, TickObserver, WorldSnapshot } from '@engine/core/types.js';
import { diffSnapshots, formatChange, type ComponentChange } from './snapshot.js';

export interface SystemTrace {
  tick: number;
  systemId: string;
  reads: string[];
  writes: string[];
  consumes: string[];
  changes: ComponentChange[];
}

export interface TracerOptions {
  log?: boolean; // 输出人类可读的协作日志到 console
  sink?: (trace: SystemTrace) => void; // 自定义接收每条 trace
}

// Tracer：挂到 World 的观测钩子上，对每个系统执行前后做快照 diff，
// 得到"该系统(skill)这一 tick 实际改了什么"，即 skill 间协作的可视记录。
export class Tracer implements TickObserver {
  private before: WorldSnapshot = {};
  private currentTick = 0;
  readonly traces: SystemTrace[] = [];

  constructor(
    private readonly world: World,
    private readonly opts: TracerOptions = {},
  ) {}

  attach(): this {
    this.world.setObserver(this);
    return this;
  }

  detach(): void {
    this.world.setObserver(undefined);
  }

  onTickStart(tick: number): void {
    this.currentTick = tick;
    if (this.opts.log) console.log(`\n[tick ${tick}]`);
  }

  onSystemStart(): void {
    this.before = this.world.snapshot();
  }

  onSystemEnd(system: SystemDeclaration): void {
    const changes = diffSnapshots(this.before, this.world.snapshot());
    const trace: SystemTrace = {
      tick: this.currentTick,
      systemId: system.id,
      reads: [...system.reads],
      writes: [...system.writes],
      consumes: [...system.consumes],
      changes,
    };
    this.traces.push(trace);
    this.opts.sink?.(trace);

    if (this.opts.log) {
      const io = [
        system.reads.length ? `reads[${system.reads.join(',')}]` : '',
        system.writes.length ? `writes[${system.writes.join(',')}]` : '',
        system.consumes.length ? `consumes[${system.consumes.join(',')}]` : '',
      ]
        .filter(Boolean)
        .join(' ');
      const delta = changes.length ? changes.map(formatChange).join(' ') : '(no change)';
      console.log(`  ${system.id.padEnd(16)} ${io.padEnd(46)} ${delta}`);
    }
  }
}
