import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { timelineCapability } from './timeline.js';
import type { Timeline, TimelinePlayback, Signal, Flag, Resource, SpawnRequest, TimelineCue } from '@engine/protocol/components.js';

// t3-timeline（REQ-CAP 下沉）：确定性 tick 调度器。对齐 skills 1:1 测试文化，无墙钟/无 Math.random。

function mkWorld(tl: Omit<Timeline, 'type'>, extra?: (w: World) => void): World {
  const w = new World();
  for (const s of timelineCapability.systems) w.addSystem(s);
  w.createEntity('tl');
  w.addComponent('tl', { type: 'Timeline', ...tl } as Timeline);
  extra?.(w);
  return w;
}
// 手动脉冲一个信号（一 tick 有效；下一 tick 前 clearPulse）。模拟 event-when/keybind 发的起播/快进信号。
function pulse(w: World, name: string): void {
  if (w.hasComponent('pulse', 'Signal')) w.removeComponent('pulse', 'Signal');
  if (!w.getAllEntities().includes('pulse')) w.createEntity('pulse');
  w.addComponent('pulse', { type: 'Signal', name, source: 'pulse' } as Signal);
}
function clearPulse(w: World): void {
  if (w.hasComponent('pulse', 'Signal')) w.removeComponent('pulse', 'Signal');
}
const pb = (w: World): TimelinePlayback => w.getComponent<TimelinePlayback>('tl', 'TimelinePlayback')!;
// 本 tick 在场、由 timeline 发出的信号名集合（cue signal + timeline:done）。
function emittedSignals(w: World): string[] {
  const out: string[] = [];
  for (const [id] of w.query('Signal')) {
    if (id.startsWith('tl:')) out.push(w.getComponent<Signal>(id, 'Signal')!.name);
  }
  return out.sort();
}

describe('timeline —— 基础播放（cue 按 at 逐 tick 发）', () => {
  it('playOnSignal 起播、at≤游标发 cue、写 Flag/Resource、播完发 timeline:done', () => {
    const cues: TimelineCue[] = [
      { at: 0, do: { kind: 'flag', flagId: 'ui_lock', value: true } },
      { at: 0, do: { kind: 'signal', signal: 'banner', arg: 'R3' } },
      { at: 2, do: { kind: 'resource', resourceId: 'phase', amount: 1, op: 'add' } },
      { at: 3, do: { kind: 'flag', flagId: 'ui_lock', value: false } },
    ];
    const w = mkWorld({ id: 'intro', playOnSignal: 'play', cues }, (w2) => {
      w2.createEntity('state');
      w2.addComponent('state', { type: 'Flag', id: 'ui_lock', active: false } as Flag);
      w2.addComponent('state', { type: 'Resource', id: 'phase', current: 0, min: 0, max: 9 } as Resource);
    });

    // tick0：起播 → t=0 发两条 at=0 cue（flag ui_lock=true + signal banner）。
    pulse(w, 'play');
    w.tick();
    clearPulse(w);
    expect(w.getComponent<Flag>('state', 'Flag')!.active).toBe(true);
    expect(emittedSignals(w)).toEqual(['banner']);
    // 带 arg 透传。
    const bannerId = w.query('Signal').find(([id]) => id.startsWith('tl:'))![0];
    expect(w.getComponent<Signal>(bannerId, 'Signal')!.arg).toBe('R3');
    expect(pb(w).playing).toBe(true);

    // tick1：t 推进到 1，无 cue。
    w.tick();
    expect(emittedSignals(w)).toEqual([]);
    // tick2：t=2 → 发 resource cue（phase 0→1）。
    w.tick();
    expect(w.getComponent<Resource>('state', 'Resource')!.current).toBe(1);
    // tick3：t=3 → 发 flag cue（ui_lock=false），全部发完 → 收尾发 timeline:done:intro，playing=false。
    w.tick();
    expect(w.getComponent<Flag>('state', 'Flag')!.active).toBe(false);
    expect(emittedSignals(w)).toEqual(['timeline:done:intro']);
    expect(pb(w).playing).toBe(false);
  });

  it('TimelinePlayback 由系统惰性建；瞬时发射实体下一 tick 回收（无泄漏）', () => {
    const w = mkWorld({ id: 'x', playOnSignal: 'play', cues: [{ at: 0, do: { kind: 'signal', signal: 's' } }] });
    expect(w.getComponent<TimelinePlayback>('tl', 'TimelinePlayback')).toBeUndefined();
    pulse(w, 'play');
    w.tick();
    clearPulse(w);
    expect(pb(w)).toBeDefined();
    // 单 cue：本 tick 既发 cue 信号 s、又因发完收尾发 timeline:done:x（两个瞬时实体）。
    expect(emittedSignals(w)).toEqual(['s', 'timeline:done:x']);
    w.tick();
    expect(w.query('Signal').filter(([id]) => id.startsWith('tl:'))).toHaveLength(0); // 下一 tick 回收
  });
});

describe('timeline —— speed / loop', () => {
  it('speed>1：一 tick 跨多个 cue', () => {
    const w = mkWorld({
      id: 'fast', playOnSignal: 'play', speed: 3,
      cues: [{ at: 0, do: { kind: 'signal', signal: 'a' } }, { at: 2, do: { kind: 'signal', signal: 'b' } }, { at: 3, do: { kind: 'signal', signal: 'c' } }],
    });
    // tick0：t=0 发 at≤0（a），推进 t=3。tick1：t=3 发 at≤3（b、c），发完收尾。
    pulse(w, 'play'); w.tick(); clearPulse(w);
    expect(emittedSignals(w)).toEqual(['a']);
    w.tick();
    expect(emittedSignals(w)).toEqual(['b', 'c', 'timeline:done:fast']);
  });

  it('loop：播完回 t=0 重播', () => {
    const w = mkWorld({ id: 'lp', playOnSignal: 'play', loop: true, cues: [{ at: 0, do: { kind: 'resource', resourceId: 'n', amount: 1, op: 'add' } }] }, (w2) => {
      w2.createEntity('st'); w2.addComponent('st', { type: 'Resource', id: 'n', current: 0, min: 0, max: 99 } as Resource);
    });
    pulse(w, 'play'); w.tick(); clearPulse(w); // t=0 发 → n=1，发完 loop 回 t=0/cursor=0
    expect(w.getComponent<Resource>('st', 'Resource')!.current).toBe(1);
    expect(pb(w).playing).toBe(true); // loop 不停
    w.tick(); // 重发 at=0 → n=2
    expect(w.getComponent<Resource>('st', 'Resource')!.current).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════════════
//  skipOnSignal 终态一致性（钉死·回放安全）：快进「一 tick 内补发全部剩余 cue」必须与逐 tick 播放
//  产生**完全相同的世界终态**（持久 Flag/Resource）。用直写 cue（flag/resource）→ 终态全在持久组件、可比。
// ════════════════════════════════════════════════════════════════════
describe('timeline —— skipOnSignal 终态与逐 tick 播放完全一致', () => {
  const cues: TimelineCue[] = [
    { at: 0, do: { kind: 'resource', resourceId: 'r', amount: 5, op: 'set' } },
    { at: 3, do: { kind: 'resource', resourceId: 'r', amount: 2, op: 'add' } }, // r=7
    { at: 5, do: { kind: 'flag', flagId: 'f', value: true } },
    { at: 8, do: { kind: 'resource', resourceId: 'r', amount: 10, op: 'set' } }, // r=10
    { at: 8, do: { kind: 'flag', flagId: 'g', value: true } },
  ];
  // 两个 Flag（f、g）分实体挂，便于逐一读取终态。
  const seed = (w: World): void => {
    w.createEntity('st');
    w.addComponent('st', { type: 'Resource', id: 'r', current: 0, min: 0, max: 99 } as Resource);
    w.addComponent('st', { type: 'Flag', id: 'f', active: false } as Flag);
    w.createEntity('stg');
    w.addComponent('stg', { type: 'Flag', id: 'g', active: false } as Flag);
  };
  const readTerminal = (w: World): { r: number; f: boolean; g: boolean } => ({
    r: w.getComponent<Resource>('st', 'Resource')!.current,
    f: w.getComponent<Flag>('st', 'Flag')!.active,
    g: w.getComponent<Flag>('stg', 'Flag')!.active,
  });

  it('逐 tick 播到底 vs 快进 → 终态完全一致', () => {
    // A：逐 tick 播到底。
    const A = mkWorld({ id: 'seq', playOnSignal: 'play', cues }, seed);
    pulse(A, 'play'); A.tick(); clearPulse(A);
    for (let i = 0; i < 12; i++) A.tick(); // 播到底
    expect(pb(A).playing).toBe(false); // 已停
    const termA = readTerminal(A);

    // B：起播后立刻快进。
    const B = mkWorld({ id: 'seq', playOnSignal: 'play', skipOnSignal: 'skip', cues }, seed);
    pulse(B, 'play'); B.tick(); clearPulse(B); // 起播 + t=0 的 cue 已发
    pulse(B, 'skip'); B.tick(); clearPulse(B); // 一 tick 补发全部剩余
    expect(pb(B).playing).toBe(false);
    const termB = readTerminal(B);

    // 终态完全一致（r=10、f=true、g=true）。
    expect(termB).toEqual(termA);
    expect(termA).toEqual({ r: 10, f: true, g: true });
  });

  it('第一 tick 即快进（同拍起播+快进，尚未逐拍推进）→ 终态仍相同', () => {
    const B = mkWorld({ id: 'seq', playOnSignal: 'play', skipOnSignal: 'skip', cues }, seed);
    // 同 tick 起播 + 快进：play 先设 playing/t=0/cursor=0，skip 立即补发全部剩余。
    pulse(B, 'play');
    B.createEntity('pulse2');
    B.addComponent('pulse2', { type: 'Signal', name: 'skip', source: 'pulse2' } as Signal);
    B.tick();
    expect(readTerminal(B)).toEqual({ r: 10, f: true, g: true });
  });
});

describe('timeline —— spawn cue 发 SpawnRequest（供 prefab 展开）', () => {
  it('spawn cue → 新建 SpawnRequest 实体', () => {
    const w = mkWorld({ id: 'sp', playOnSignal: 'play', cues: [{ at: 0, do: { kind: 'spawn', templateId: 'boom', x: 3, y: 4 } }] });
    pulse(w, 'play'); w.tick(); clearPulse(w);
    const reqs = w.query('SpawnRequest');
    expect(reqs).toHaveLength(1);
    const req = w.getComponent<SpawnRequest>(reqs[0][0], 'SpawnRequest')!;
    expect({ t: req.templateId, x: req.x, y: req.y }).toEqual({ t: 'boom', x: 3, y: 4 });
  });
});
