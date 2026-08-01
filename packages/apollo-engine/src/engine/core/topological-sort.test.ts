import { describe, it, expect } from 'vitest';
import { topologicalSort } from './topological-sort.js';
import { SystemPhase } from './types.js';
import type { SystemDeclaration } from './types.js';

const noop = (): void => {};
function sys(id: string, reads: string[], writes: string[], phase?: number): SystemDeclaration {
  return { id, reads, writes, consumes: [], phase, execute: noop };
}
function order(systems: SystemDeclaration[]): string[] {
  return topologicalSort(systems).map((s) => s.id);
}

describe('topologicalSort — 组件依赖定序（缺省阶段，行为不变）', () => {
  it('writer 排在 reader 之前（输入乱序也对）', () => {
    const order = topologicalSort([sys('consumer', ['X'], []), sys('producer', [], ['X'])]).map((s) => s.id);
    expect(order).toEqual(['producer', 'consumer']);
  });

  it('同阶段两个系统都读写同一组件 → 判成环', () => {
    expect(() => topologicalSort([sys('a', ['X'], ['X']), sys('b', ['X'], ['X'])])).toThrow(/Circular/);
  });
});

describe('topologicalSort — phase 阶段', () => {
  it('跨阶段按阶段号定序，绕过纯组件拓扑会判成环的"读后改"管线', () => {
    // detect 读 Transform、resolve 写 Transform：同阶段会成环。
    // 把 resolve 排到更后阶段 → 不成环，且排在 detect 之后。
    const detect = sys('detect', ['Transform'], ['Overlap']); // Update
    const resolve = sys('resolve', ['Overlap'], ['Transform'], SystemPhase.Resolve);
    expect(topologicalSort([resolve, detect]).map((s) => s.id)).toEqual(['detect', 'resolve']);
  });

  it('同样的两系统不分阶段 → 确实会成环（证明阶段是解法）', () => {
    const detect = sys('detect', ['Transform'], ['Overlap']);
    const resolve = sys('resolve', ['Overlap'], ['Transform']); // 同 Update 阶段
    expect(() => topologicalSort([resolve, detect])).toThrow(/Circular/);
  });

  it('阶段内仍按组件拓扑排序', () => {
    const accel = sys('accel', ['Velocity'], ['Velocity']);
    const motion = sys('motion', ['Velocity'], ['Transform']);
    const order = topologicalSort([motion, accel]).map((s) => s.id);
    expect(order.indexOf('accel')).toBeLessThan(order.indexOf('motion'));
  });

  it('阶段内成环仍抛错（phase 不掩盖真正的环）', () => {
    const a = sys('a', ['X'], ['Y'], SystemPhase.Resolve);
    const b = sys('b', ['Y'], ['X'], SystemPhase.Resolve);
    expect(() => topologicalSort([a, b])).toThrow(/Circular/);
  });
});

describe('topologicalSort — 显式定序 runsAfter/runsBefore（R10）', () => {
  it('runsAfter 强制顺序（无组件依赖也能定序）', () => {
    const a = { id: 'a', reads: [], writes: [], consumes: [], execute: noop };
    const b = { id: 'b', reads: [], writes: [], consumes: [], runsAfter: ['a'], execute: noop };
    expect(order([b, a])).toEqual(['a', 'b']);
  });

  it('runsBefore 强制顺序', () => {
    const a = { id: 'a', reads: [], writes: [], consumes: [], runsBefore: ['b'], execute: noop };
    const b = { id: 'b', reads: [], writes: [], consumes: [], execute: noop };
    expect(order([b, a])).toEqual(['a', 'b']);
  });

  it('两系统都 RMW 同组件：声明 runsBefore 即打破伪环并定序', () => {
    // dialogue-runner 与 state-sync 都读改写 State：组件图互为前驱 → 本会成环。
    const runner = { id: 'dialogue-runner', reads: ['State'], writes: ['State'], consumes: [], runsBefore: ['state-sync'], execute: noop };
    const sync = { id: 'state-sync', reads: ['State'], writes: ['State'], consumes: [], execute: noop };
    expect(order([sync, runner])).toEqual(['dialogue-runner', 'state-sync']);
  });

  it('用 runsAfter 表达同一意图，结果一致', () => {
    const runner = { id: 'dialogue-runner', reads: ['State'], writes: ['State'], consumes: [], execute: noop };
    const sync = { id: 'state-sync', reads: ['State'], writes: ['State'], consumes: [], runsAfter: ['dialogue-runner'], execute: noop };
    expect(order([sync, runner])).toEqual(['dialogue-runner', 'state-sync']);
  });

  it('显式边互相矛盾仍判成环（不掩盖真冲突）', () => {
    const a = { id: 'a', reads: [], writes: [], consumes: [], runsBefore: ['b'], execute: noop };
    const b = { id: 'b', reads: [], writes: [], consumes: [], runsBefore: ['a'], execute: noop };
    expect(() => topologicalSort([a, b])).toThrow(/Circular/);
  });

  it('引用不在本 phase 的 id 被忽略（跨 phase 由 phase 号定序）', () => {
    const a = sys('a', [], [], SystemPhase.Update);
    const b = { id: 'b', reads: [], writes: [], consumes: [], phase: SystemPhase.Resolve, runsAfter: ['a'], execute: noop };
    // a 在 Update、b 在 Resolve → 仍是 a 在前；runsAfter 跨 phase 引用不报错。
    expect(order([b, a])).toEqual(['a', 'b']);
  });
});
