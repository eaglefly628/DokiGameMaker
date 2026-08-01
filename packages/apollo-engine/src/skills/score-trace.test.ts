import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Card, PlayedHand, PokerHand, PerCardScore, Resource, Flag, Signal, Effect, ScoreTrace } from '@engine/protocol/components.js';
import { hashSnapshot } from '../net/determinism.js';
import { pokerHandCapability, cardScoringCapability } from './tier3/index.js';
import { effectApplyCapability, eventWhenCapability } from './tier2/index.js';

// REQ-019：计分链吐逐步 trace（base→percard→effect），UI 回放。本测验：顺序确定、末值==资源真值、opt-in、排除出 hash。
const c = (suit: number, rank: number): Card => ({ suit, rank });
const BASE_CHIPS: Record<string, number> = { '2': 2, '5': 5, '7': 7, '9': 9, '10': 10 };

function buildScoringWorld(withTrace: boolean): World {
  const w = new World();
  for (const cap of [pokerHandCapability, cardScoringCapability, eventWhenCapability, effectApplyCapability]) {
    for (const s of cap.systems) w.addSystem(s);
  }
  w.createEntity('table');
  w.addComponent('table', { type: 'PokerHand', rankingTable: { flush: { chips: 35, mult: 4 } }, chipsResource: 'chips', multResource: 'mult' } as PokerHand);
  w.addComponent('table', { type: 'PerCardScore', chipsResource: 'chips', baseChipsByRank: BASE_CHIPS } as PerCardScore);
  w.addComponent('table', { type: 'PlayedHand', cards: [c(1, 2), c(1, 5), c(1, 7), c(1, 9), c(1, 10)] } as PlayedHand); // ♥同花
  if (withTrace) w.addComponent('table', { type: 'ScoreTrace', events: [] } as ScoreTrace);
  for (const id of ['chips', 'mult', 'score']) {
    w.createEntity(`res_${id}`);
    w.addComponent(`res_${id}`, { type: 'Resource', id, current: 0, min: 0, max: 1_000_000 } as Resource);
  }
  w.createEntity('scoring');
  w.addComponent('scoring', { type: 'Flag', id: 'scoring', active: true } as Flag);
  w.createEntity('gate');
  w.addComponent('gate', { type: 'EventWhen', signal: 'score', when: { kind: 'flag', id: 'scoring' }, mode: 'level', armed: false } as unknown as Signal);
  w.createEntity('joker'); // +4 mult
  w.addComponent('joker', { type: 'Effect', onSignal: 'score', kind: 'modify-resource', targetId: 'mult', op: 'add', value: 4, order: 10 } as unknown as Effect);
  w.createEntity('combine'); // score = chips × mult
  w.addComponent('combine', { type: 'Effect', onSignal: 'score', kind: 'modify-resource', targetId: 'score', op: 'set', valueFrom: { resourceId: 'chips', timesResourceId: 'mult' }, order: 1000 } as unknown as Effect);
  return w;
}
const res = (w: World, id: string): number => w.getComponent<Resource>(`res_${id}`, 'Resource')!.current;
const trace = (w: World): ScoreTrace => w.getComponent<ScoreTrace>('table', 'ScoreTrace')!;

describe('REQ-019 · 逐步计分 trace', () => {
  it('记录 base→percard→effect 全步，seq 连续，末步 after == 资源真值', () => {
    const w = buildScoringWorld(true);
    w.tick();
    // 真值：chips 35+33=68，mult (4+4)=8，score 68×8=544。
    expect(res(w, 'chips')).toBe(68);
    expect(res(w, 'mult')).toBe(8);
    expect(res(w, 'score')).toBe(544);
    const ev = trace(w).events;
    // base(chips,mult) 2 + percard(同花5张) 5 + effect(joker mult + combine score) 2 = 9。
    expect(ev.length).toBe(9);
    ev.forEach((e, i) => expect(e.seq).toBe(i)); // seq 连续确定
    expect(ev.map((e) => e.phase)).toEqual(['base', 'base', 'percard', 'percard', 'percard', 'percard', 'percard', 'effect', 'effect']);
    // 各 target 的最后一步 after == 资源真值（trace 末值与引擎一致，验"唯一真相"）。
    const lastOf = (t: string) => [...ev].reverse().find((e) => e.target === t)!;
    expect(lastOf('chips').after).toBe(68);
    expect(lastOf('mult').after).toBe(8);
    expect(lastOf('score').after).toBe(544);
  });

  it('base 步带牌型名 source；percard 步带 card:<下标> source', () => {
    const w = buildScoringWorld(true);
    w.tick();
    const ev = trace(w).events;
    expect(ev[0]).toMatchObject({ phase: 'base', target: 'chips', op: 'set', source: 'flush' });
    expect(ev.find((e) => e.phase === 'percard')!.source).toMatch(/^card:\d+$/);
    expect(ev.find((e) => e.target === 'score')!.source).toBe('combine'); // combine Effect 实体 id
  });

  it('每拍重建：再 tick 一次 trace 不累积（poker-eval 清空重建）', () => {
    const w = buildScoringWorld(true);
    w.tick();
    const n1 = trace(w).events.length;
    w.tick();
    expect(trace(w).events.length).toBe(n1); // 清空重建，非翻倍
  });

  it('opt-in：无 ScoreTrace 计分照常、不报错', () => {
    const w = buildScoringWorld(false);
    expect(() => w.tick()).not.toThrow();
    expect(res(w, 'score')).toBe(544); // 结果一字不差
    expect(w.getComponent('table', 'ScoreTrace')).toBeUndefined();
  });

  it('排除出 hashSnapshot：trace 内容变化不影响世界 hash（纯表现，同 Camera）', () => {
    const w = buildScoringWorld(true);
    w.tick();
    const h1 = hashSnapshot(w.snapshot());
    // 手动篡改 trace（模拟表现层差异）→ hash 不变。
    trace(w).events = [{ seq: 99, phase: 'junk', target: 'x', op: 'add', value: 1, after: 1 }];
    const h2 = hashSnapshot(w.snapshot());
    expect(h2).toBe(h1);
  });
});
