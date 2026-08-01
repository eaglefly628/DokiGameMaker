import { describe, it, expect } from 'vitest';
import type { CapabilityDefinition } from '@engine/core/define-capability.js';
import type { SystemDeclaration } from '@engine/core/types.js';
import { topologicalSort } from '@engine/core/topological-sort.js';
import { ALL_CAPABILITIES } from './capability-registry.js';
import { analyzeSystemGraph, collectSystems, findDanglingEdges, findDuplicateSystemIds } from './system-graph.js';

// 合成系统/能力工厂（analyzer 只读 .id/.systems·其余字段占位）。
function sys(id: string, o: Partial<SystemDeclaration> = {}): SystemDeclaration {
  return { id, phase: 0, reads: [], writes: [], consumes: [], execute: () => {}, ...o } as SystemDeclaration;
}
function cap(id: string, systems: SystemDeclaration[]): CapabilityDefinition {
  return { id, systems } as unknown as CapabilityDefinition;
}

// ── 真数据硬不变量（门禁）─────────────────────────────────────────
describe('system-graph — 全局硬不变量', () => {
  const report = analyzeSystemGraph(ALL_CAPABILITIES);

  it('无悬空显式边（runsBefore/runsAfter 指向不存在系统=静默失效）', () => {
    expect(report.danglingEdges).toEqual([]);
  });

  it('无重复 system id（同 id 多能力=定序静默覆盖）', () => {
    expect(report.duplicateIds).toEqual([]);
  });

  it('每个能力**单独装**其自身系统可排（不内部成环）', () => {
    for (const c of ALL_CAPABILITIES) {
      expect(() => topologicalSort([...(c.systems ?? [])]), `${c.id} 自身系统内部成环`).not.toThrow();
    }
  });
});

// ── 与引擎 topological-sort 逐条对齐（fidelity·防两套模型漂移）─────────────
describe('system-graph — 与引擎 topo-sort fidelity', () => {
  it('RMW 伪环：analyzer 检出 SCC 且引擎真抛环', () => {
    // A、B 都读写同一组件 X → 互为前驱 → 环。
    const A = sys('A', { reads: ['X'], writes: ['X'] });
    const B = sys('B', { reads: ['X'], writes: ['X'] });
    const rep = analyzeSystemGraph([cap('c', [A, B])]);
    expect(rep.sccs.length).toBe(1);
    expect(rep.sccs[0].systems.map((s) => s.id).sort()).toEqual(['A', 'B']);
    expect(rep.sccs[0].viaComponents).toContain('X');
    expect(() => topologicalSort([A, B])).toThrow(/Circular/);
  });

  it('显式 runsBefore 破环：analyzer 无 SCC 且引擎不抛', () => {
    const A = sys('A', { reads: ['X'], writes: ['X'], runsBefore: ['B'] });
    const B = sys('B', { reads: ['X'], writes: ['X'] });
    const rep = analyzeSystemGraph([cap('c', [A, B])]);
    expect(rep.sccs).toEqual([]);
    expect(() => topologicalSort([A, B])).not.toThrow();
  });

  it('跨 phase 不成环（不同 phase 桶各自排）', () => {
    const A = sys('A', { phase: 0, reads: ['X'], writes: ['X'] });
    const B = sys('B', { phase: 10, reads: ['X'], writes: ['X'] });
    expect(analyzeSystemGraph([cap('c', [A, B])]).sccs).toEqual([]);
    expect(() => topologicalSort([A, B])).not.toThrow();
  });

  it('三元环（A→B→C→A 经组件）被切成一个 SCC', () => {
    // A 写 P·B 读 P 写 Q·C 读 Q 写 R·A 读 R → A→B→C→A
    const A = sys('A', { reads: ['R'], writes: ['P'] });
    const B = sys('B', { reads: ['P'], writes: ['Q'] });
    const C = sys('C', { reads: ['Q'], writes: ['R'] });
    const rep = analyzeSystemGraph([cap('c', [A, B, C])]);
    expect(rep.sccs.length).toBe(1);
    expect(rep.sccs[0].systems.map((s) => s.id).sort()).toEqual(['A', 'B', 'C']);
    expect(() => topologicalSort([A, B, C])).toThrow(/Circular/);
  });
});

// ── 悬空/重复 检出正确性 ──────────────────────────────────────────
describe('system-graph — 悬空/重复 检出', () => {
  it('悬空显式边点名', () => {
    const A = sys('A', { runsBefore: ['ghost'] });
    const d = findDanglingEdges(collectSystems([cap('c', [A])]));
    expect(d).toEqual([{ system: 'A', capId: 'c', kind: 'runsBefore', ref: 'ghost' }]);
  });
  it('跨能力真实存在的 runsBefore 不算悬空', () => {
    const A = sys('A', { runsBefore: ['B'] });
    const B = sys('B');
    expect(findDanglingEdges(collectSystems([cap('c1', [A]), cap('c2', [B])]))).toEqual([]);
  });
  it('重复 system id 点名', () => {
    const dups = findDuplicateSystemIds(collectSystems([cap('c1', [sys('dup')]), cap('c2', [sys('dup')])]));
    expect(dups).toEqual([{ id: 'dup', caps: ['c1', 'c2'] }]);
  });
});
