import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type {
  CardPile, PlayedHand, PokerHand, PerCardScore, Resource, Flag, State, StringVar, Effect, EventWhen, InputQueue, RawInputData,
} from '@engine/protocol/components.js';
import { resourceCapability, flagCapability, stringVariableCapability } from '@atom-skills/index.js';
import { eventWhenCapability, effectApplyCapability, cardPileCapability } from './index.js';
import { pokerHandCapability, cardScoringCapability } from '../tier3/index.js';

// ═══════════════════════════════════════════════════════════════
//  REQ-017 证明：回合流程 = sim 内**数据状态机**（State + condition + event-when + effect + card-pile），
//  零新「流程/FSM」能力、零游戏 system、不碰 game-e.tsx。证明：
//   ① card-pile 发牌 → 按下标出牌 → poker/card-scoring 计分（全在 sim）。
//   ② 回合**转移**纯重组：State{round} + condition(round_score≥盲注线) + event-when → effect set-state 'won'。
//   ③ 边沿 commit 累加 round_score / 递减 hands_left（同 game-e 回合循环）。
//  → 流程进 sim 后，「联机 = 加第二组 owner 牌桌 + 第二路命令」（已由 coop-cards.test 坐实）。
// ═══════════════════════════════════════════════════════════════

const BASE_CHIPS: Record<string, number> = { '2': 2, '5': 5, '7': 7, '9': 9, '11': 10 };
const code = (suit: number, rank: number) => suit * 100 + rank;
const BLIND = 200;

function buildRoundWorld(): World {
  const w = new World();
  for (const cap of [resourceCapability, flagCapability, stringVariableCapability, cardPileCapability, pokerHandCapability, cardScoringCapability, eventWhenCapability, effectApplyCapability]) {
    for (const s of cap.systems) w.addSystem(s);
  }
  // 牌桌：牌库(8 张:5♥同花+3 杂) + 出牌区 + 评估器 + 逐张。
  const deck = [code(1, 2), code(1, 5), code(1, 7), code(1, 9), code(1, 11), code(0, 3), code(0, 4), code(3, 6)];
  w.createEntity('table');
  w.addComponent('table', { type: 'CardPile', owner: 'p1', deck, hand: [], handSize: 8 } as CardPile);
  w.addComponent('table', { type: 'PlayedHand', owner: 'p1', cards: [] } as PlayedHand);
  w.addComponent('table', { type: 'PokerHand', rankingTable: { flush: { chips: 35, mult: 4 } }, chipsResource: 'chips', multResource: 'mult', handTypeVar: 'ht' } as PokerHand);
  w.addComponent('table', { type: 'PerCardScore', chipsResource: 'chips', baseChipsByRank: BASE_CHIPS } as PerCardScore);
  w.createEntity('ht'); w.addComponent('ht', { type: 'StringVar', id: 'ht', value: '' } as StringVar);
  w.createEntity('flag'); w.addComponent('flag', { type: 'Flag', id: 'p1', active: false } as Flag);
  for (const [id, cur] of [['chips', 0], ['mult', 0], ['hand_score', 0], ['round_score', 0], ['hands_left', 4], ['blind', BLIND]] as [string, number][]) {
    w.createEntity(`res_${id}`);
    w.addComponent(`res_${id}`, { type: 'Resource', id, current: cur, min: 0, max: 1_000_000 } as Resource);
  }
  // 回合状态机（数据）。
  w.createEntity('fsm'); w.addComponent('fsm', { type: 'State', fsmId: 'round', current: 'playing' } as State);
  // 计分链信号：出牌(flag p1) → score（level）。
  w.createEntity('gate_score');
  w.addComponent('gate_score', { type: 'EventWhen', signal: 'score', when: { kind: 'flag', id: 'p1' }, mode: 'level', armed: false } as unknown as EventWhen);
  w.createEntity('combine');
  w.addComponent('combine', { type: 'Effect', onSignal: 'score', kind: 'modify-resource', targetId: 'hand_score', op: 'set', valueFrom: { resourceId: 'chips', timesResourceId: 'mult' }, order: 1000 } as unknown as Effect);
  // 边沿 commit：出一手 → round_score += hand_score、hands_left -1（同 game-e 回合循环）。
  w.createEntity('gate_commit');
  w.addComponent('gate_commit', { type: 'EventWhen', signal: 'committed', when: { kind: 'flag', id: 'p1' }, mode: 'edge', armed: false } as unknown as EventWhen);
  w.createEntity('acc');
  w.addComponent('acc', { type: 'Effect', onSignal: 'committed', kind: 'modify-resource', targetId: 'round_score', op: 'add', valueFrom: { resourceId: 'hand_score' }, order: 2000 } as unknown as Effect);
  w.createEntity('dec');
  w.addComponent('dec', { type: 'Effect', onSignal: 'committed', kind: 'modify-resource', targetId: 'hands_left', op: 'add', value: -1, order: 2001 } as unknown as Effect);
  // ★ 回合转移（纯重组）：playing 且 round_score≥盲注线 → set-state 'won'。
  w.createEntity('gate_win');
  w.addComponent('gate_win', {
    type: 'EventWhen', signal: 'win',
    when: { kind: 'and', of: [{ kind: 'state', fsmId: 'round', equals: 'playing' }, { kind: 'resource', id: 'round_score', cmp: 'gte', value: BLIND, vsResource: 'blind' }] },
    mode: 'level', armed: false,
  } as unknown as EventWhen);
  w.createEntity('eff_win');
  w.addComponent('eff_win', { type: 'Effect', onSignal: 'win', kind: 'set-state', targetId: 'round', value: 'won' } as unknown as Effect);
  // 失败转移：playing 且 hands_left≤0 → 'lost'。
  w.createEntity('gate_lose');
  w.addComponent('gate_lose', {
    type: 'EventWhen', signal: 'lose',
    when: { kind: 'and', of: [{ kind: 'state', fsmId: 'round', equals: 'playing' }, { kind: 'resource', id: 'hands_left', cmp: 'lte', value: 0 }] },
    mode: 'level', armed: false,
  } as unknown as EventWhen);
  w.createEntity('eff_lose');
  w.addComponent('eff_lose', { type: 'Effect', onSignal: 'lose', kind: 'set-state', targetId: 'round', value: 'lost' } as unknown as Effect);
  w.createEntity('global-input'); w.addComponent('global-input', { type: 'InputQueue', actions: [] } as InputQueue);
  return w;
}
const res = (w: World, id: string) => w.getComponent<Resource>(`res_${id}`, 'Resource')!.current;
const state = (w: World) => w.getComponent<State>('fsm', 'State')!.current;
const hand = (w: World) => w.getComponent<CardPile>('table', 'CardPile')!.hand;
const setInput = (w: World, a: RawInputData[]) => { w.getComponent<InputQueue>('global-input', 'InputQueue')!.actions = a; };

describe('REQ-017 · 回合流程数据状态机（card-pile + State + condition + effect，零新能力）', () => {
  it('发牌→下标出牌(同花)→计分→round_score 累加→State 转 won（全数据装配）', () => {
    const w = buildRoundWorld();
    w.tick(); // ① 发牌：hand=8 张
    expect(hand(w).length).toBe(8);
    expect(state(w)).toBe('playing');

    setInput(w, [{ source: 'p1', key: 'play', values: [0, 1, 2, 3, 4] }]); // ② 出 5♥ 同花
    w.tick();
    setInput(w, []);
    expect(get(w, 'ht')).toBe('flush');
    expect(res(w, 'hand_score')).toBe(272); // (35+逐张33)×4
    expect(res(w, 'round_score')).toBe(272); // 边沿累加
    expect(res(w, 'hands_left')).toBe(3); // 边沿递减

    w.tick(); // ③ 转移一拍反馈：playing ∧ round_score(272)≥200 → won
    expect(state(w)).toBe('won');
  });

  it('hands 耗尽未过线 → State 转 lost（纯条件转移）', () => {
    const w = buildRoundWorld();
    // 把盲注线抬到打不过 + hands_left 设 1，出一手后 hands→0、未达线。
    w.getComponent<Resource>('res_blind', 'Resource')!.current = 1_000_000;
    w.getComponent<Resource>('res_hands_left', 'Resource')!.current = 1;
    w.tick();
    setInput(w, [{ source: 'p1', key: 'play', values: [0, 1, 2, 3, 4] }]);
    w.tick();
    setInput(w, []);
    expect(res(w, 'hands_left')).toBe(0);
    w.tick(); // 转移：playing ∧ hands_left≤0 → lost
    expect(state(w)).toBe('lost');
  });
});

function get(w: World, svId: string): string {
  for (const [eid] of w.query('StringVar')) {
    const v = w.getComponent<StringVar>(eid, 'StringVar');
    if (v && v.id === svId) return v.value;
  }
  return '';
}
