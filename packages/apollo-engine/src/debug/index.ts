// ═══════════════════════════════════════════════════════════════
//  Debug 体系 —— 协作可视日志 + record/replay 确定性校验
// ═══════════════════════════════════════════════════════════════
export { diffSnapshots, formatChange } from './snapshot.js';
export type { ComponentChange } from './snapshot.js';
export { Tracer } from './tracer.js';
export type { SystemTrace, TracerOptions } from './tracer.js';
export { Recorder } from './recorder.js';
export type { Recording, Frame, InputEvent } from './recorder.js';
export { replay } from './replayer.js';
export type { ReplayResult, Divergence } from './replayer.js';
