import { World } from '@engine/core/world.js';
import type { CapabilityDefinition } from '@engine/core/define-capability.js';
import { diffSnapshots, type ComponentChange } from './snapshot.js';
import type { Recording } from './recorder.js';

export interface Divergence {
  tick: number;
  changes: ComponentChange[]; // 录制(expected) → 回放(actual) 的差异
}

export interface ReplayResult {
  deterministic: boolean;
  ticks: number;
  divergences: Divergence[];
}

// 回放：用相同 systems 从初始快照重跑，逐 tick 把回放结果与录制快照对比。
// 任何差异 = 非确定性（潜在 bug，或未经 inject 捕获的外部输入）。
export function replay(recording: Recording, capabilities: CapabilityDefinition[]): ReplayResult {
  const world = new World();
  for (const cap of capabilities) {
    for (const system of cap.systems) world.addSystem(system);
  }
  world.restore(recording.initialSnapshot);

  const divergences: Divergence[] = [];
  for (const frame of recording.frames) {
    for (const input of frame.inputs) {
      if (!world.getAllEntities().includes(input.entityId)) {
        world.createEntity(input.entityId);
      }
      world.addComponent(input.entityId, input.component);
    }
    world.tick();
    const changes = diffSnapshots(frame.snapshot, world.snapshot());
    if (changes.length > 0) divergences.push({ tick: frame.tick, changes });
  }

  return {
    deterministic: divergences.length === 0,
    ticks: recording.frames.length,
    divergences,
  };
}
