import type { World } from '@engine/core/world.js';
import type { Component, EntityId, WorldSnapshot } from '@engine/core/types.js';
import { Tracer, type SystemTrace, type TracerOptions } from './tracer.js';

export interface InputEvent {
  entityId: EntityId;
  component: Component;
}

export interface Frame {
  tick: number;
  inputs: InputEvent[];
  systemTraces: SystemTrace[];
  snapshot: WorldSnapshot;
}

export interface Recording {
  initialSnapshot: WorldSnapshot;
  systemOrder: string[];
  frames: Frame[];
}

// Recorder：包住 World，录下每 tick 的外部输入、系统 trace 与状态快照。
// 外部输入必须经 inject() 才能在回放时重现（保证确定性）。
export class Recorder {
  private readonly tracer: Tracer;
  private pendingInputs: InputEvent[] = [];
  readonly recording: Recording;

  constructor(
    private readonly world: World,
    opts: TracerOptions = {},
  ) {
    this.tracer = new Tracer(world, opts).attach();
    this.recording = {
      initialSnapshot: world.snapshot(),
      systemOrder: world.getSortedSystems().map((s) => s.id),
      frames: [],
    };
  }

  inject(entityId: EntityId, component: Component): void {
    if (!this.world.getAllEntities().includes(entityId)) {
      this.world.createEntity(entityId);
    }
    this.world.addComponent(entityId, component);
    this.pendingInputs.push({ entityId, component: structuredClone(component) });
  }

  tick(): void {
    const from = this.tracer.traces.length;
    this.world.tick();
    this.recording.frames.push({
      tick: this.recording.frames.length + 1,
      inputs: this.pendingInputs,
      systemTraces: this.tracer.traces.slice(from),
      snapshot: this.world.snapshot(),
    });
    this.pendingInputs = [];
  }

  run(ticks: number): Recording {
    for (let i = 0; i < ticks; i++) this.tick();
    return this.recording;
  }

  detach(): void {
    this.tracer.detach();
  }
}
