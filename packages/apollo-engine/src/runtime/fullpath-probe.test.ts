import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { Engine } from './engine.js';
import { scanNonFinite, fullPathProbe, crawlStates, type FireFn } from './fullpath-probe.js';
import type { Resource } from '@engine/protocol/components.js';

describe('fullpath-probe · scanNonFinite（非有限数不变量）', () => {
  it('干净世界 → []', () => {
    const w = new World();
    w.createEntity('a');
    w.addComponent('a', { type: 'Resource', id: 'hp', current: 100, min: 0, max: 100 } as Resource);
    expect(scanNonFinite(w)).toEqual([]);
  });

  it('NaN / Infinity → 抓到并报路径', () => {
    const w = new World();
    w.createEntity('a');
    w.addComponent('a', { type: 'Resource', id: 'hp', current: NaN, min: 0, max: Infinity } as Resource);
    const nf = scanNonFinite(w);
    expect(nf.length).toBeGreaterThanOrEqual(2); // current=NaN + max=Infinity
    expect(nf.join('|')).toContain('a.Resource');
  });
});

describe('fullpath-probe · fullPathProbe（错误捕获 + 确定性）', () => {
  const makeEngine = () => {
    const e = new Engine();
    e.load({ capabilities: [], entities: {} });
    return e;
  };

  it('fire 抛错 → 该信号 not-ok + 捕获 error；不污染其它信号', () => {
    const fire = (_e: Engine, signal: string) => {
      if (signal === 'boom') throw new Error('kaboom');
    };
    const report = fullPathProbe(makeEngine, fire, ['ok1', 'boom', 'ok2'], { ticksPerAction: 1 });
    const boom = report.perSignal.find((r) => r.signal === 'boom')!;
    expect(boom.ok).toBe(false);
    expect(boom.error).toContain('kaboom');
    expect(report.perSignal.find((r) => r.signal === 'ok1')!.ok).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('全部正常 → ok + deterministic + finalHash 稳定', () => {
    const report = fullPathProbe(makeEngine, () => {}, ['a', 'b'], { ticksPerAction: 1 });
    expect(report.ok).toBe(true);
    expect(report.deterministic).toBe(true);
    expect(typeof report.finalHash).toBe('string');
  });
});

describe('fullpath-probe · crawlStates（BFS 状态图）', () => {
  // 合成：一个计数器实体，inc 动作把 Resource.current +1 → 每次都是新状态（沿深度成链）。
  const makeEngine = () => {
    const e = new Engine();
    e.load({ capabilities: [], entities: {} });
    e.world.createEntity('c');
    e.world.addComponent('c', { type: 'Resource', id: 'n', current: 0, min: 0, max: 99 } as Resource);
    return e;
  };
  const inc: FireFn = (e) => {
    e.world.getComponent<Resource>('c', 'Resource')!.current += 1;
  };

  it('递增动作 → 沿深度发现 N 个状态、受 maxDepth 限、去重生效', () => {
    const report = crawlStates(makeEngine, inc, ['inc'], { maxDepth: 3, ticksPerAction: 0, maxStates: 100 });
    expect(report.ok).toBe(true);
    expect(report.states).toBe(4); // start(n=0) + n=1,2,3
    expect(report.maxDepthReached).toBe(3);
    expect(report.truncated).toBe(false);
  });

  it('maxStates 闸 → 截断', () => {
    const report = crawlStates(makeEngine, inc, ['inc'], { maxDepth: 50, ticksPerAction: 0, maxStates: 5 });
    expect(report.truncated).toBe(true);
    expect(report.states).toBe(5);
  });

  it('expand=false → 只剩起点（不展开）', () => {
    const report = crawlStates(makeEngine, inc, ['inc'], { expand: () => false });
    expect(report.states).toBe(1);
  });

  it('fire 抛错 → 记 error + 复现路径', () => {
    const boom: FireFn = (_e, s) => {
      if (s === 'x') throw new Error('boom');
    };
    const r = crawlStates(makeEngine, boom, ['x'], { maxDepth: 2, ticksPerAction: 0 });
    expect(r.ok).toBe(false);
    expect(r.errors[0].signal).toBe('x');
    expect(Array.isArray(r.errors[0].path)).toBe(true);
  });
});
