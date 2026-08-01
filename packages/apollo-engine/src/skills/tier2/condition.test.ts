import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Resource, Flag, State, Timer, StringVar, ConditionExpr } from '@engine/protocol/components.js';
import { evaluateCondition } from './condition.js';

function res(w: World, id: string, current: number): void {
  const e = `res:${id}`;
  w.createEntity(e);
  w.addComponent(e, { type: 'Resource', id, current, min: -Infinity, max: Infinity } as Resource);
}
function flag(w: World, id: string, active: boolean): void {
  const e = `flag:${id}`;
  w.createEntity(e);
  w.addComponent(e, { type: 'Flag', id, active } as Flag);
}
function state(w: World, fsmId: string, current: string): void {
  const e = `state:${fsmId}`;
  w.createEntity(e);
  w.addComponent(e, { type: 'State', fsmId, current, previous: '' } as State);
}

describe('condition — 叶子', () => {
  it('resource 各比较算子', () => {
    const w = new World();
    res(w, 'affection_S', 60);
    expect(evaluateCondition(w, { kind: 'resource', id: 'affection_S', cmp: 'gte', value: 60 })).toBe(true);
    expect(evaluateCondition(w, { kind: 'resource', id: 'affection_S', cmp: 'gt', value: 60 })).toBe(false);
    expect(evaluateCondition(w, { kind: 'resource', id: 'affection_S', cmp: 'lt', value: 90 })).toBe(true);
    expect(evaluateCondition(w, { kind: 'resource', id: 'affection_S', cmp: 'eq', value: 60 })).toBe(true);
    expect(evaluateCondition(w, { kind: 'resource', id: 'affection_S', cmp: 'ne', value: 61 })).toBe(true);
  });

  it('flag：默认判 active=true；可显式判 false', () => {
    const w = new World();
    flag(w, 'met_T', true);
    flag(w, 'rejected', false);
    expect(evaluateCondition(w, { kind: 'flag', id: 'met_T' })).toBe(true);
    expect(evaluateCondition(w, { kind: 'flag', id: 'rejected' })).toBe(false);
    expect(evaluateCondition(w, { kind: 'flag', id: 'rejected', equals: false })).toBe(true);
  });

  it('state：当前状态相等判定', () => {
    const w = new World();
    state(w, 'story', 'confession');
    expect(evaluateCondition(w, { kind: 'state', fsmId: 'story', equals: 'confession' })).toBe(true);
    expect(evaluateCondition(w, { kind: 'state', fsmId: 'story', equals: 'daily' })).toBe(false);
  });

  it('timer：按 elapsed 比较（限时/冷却门控）', () => {
    const w = new World();
    w.createEntity('t');
    w.addComponent('t', { type: 'Timer', id: 'door', elapsed: 45, duration: 60, loop: false } as Timer);
    expect(evaluateCondition(w, { kind: 'timer', id: 'door', cmp: 'lt', value: 60 })).toBe(true);
    expect(evaluateCondition(w, { kind: 'timer', id: 'door', cmp: 'gte', value: 60 })).toBe(false);
  });

  it('string：字符串变量相等判定', () => {
    const w = new World();
    w.createEntity('s');
    w.addComponent('s', { type: 'StringVar', id: 'story-node', value: 'confession' } as StringVar);
    expect(evaluateCondition(w, { kind: 'string', id: 'story-node', equals: 'confession' })).toBe(true);
    expect(evaluateCondition(w, { kind: 'string', id: 'story-node', equals: 'daily' })).toBe(false);
  });

  it('缺失叶子 → 不成立', () => {
    const w = new World();
    expect(evaluateCondition(w, { kind: 'resource', id: 'nope', cmp: 'gte', value: 0 })).toBe(false);
    expect(evaluateCondition(w, { kind: 'flag', id: 'nope' })).toBe(false);
    expect(evaluateCondition(w, { kind: 'state', fsmId: 'nope', equals: 'x' })).toBe(false);
    expect(evaluateCondition(w, { kind: 'timer', id: 'nope', cmp: 'gte', value: 0 })).toBe(false);
    expect(evaluateCondition(w, { kind: 'string', id: 'nope', equals: 'x' })).toBe(false);
  });
});

describe('condition — 布尔树组合', () => {
  it('「好感≥30 且 见过T 且 非已拒绝」', () => {
    const w = new World();
    res(w, 'affection_S', 35);
    flag(w, 'met_T', true);
    flag(w, 'rejected', false);
    const expr: ConditionExpr = {
      kind: 'and',
      of: [
        { kind: 'resource', id: 'affection_S', cmp: 'gte', value: 30 },
        { kind: 'flag', id: 'met_T' },
        { kind: 'not', of: { kind: 'flag', id: 'rejected' } },
      ],
    };
    expect(evaluateCondition(w, expr)).toBe(true);
  });

  it('and 任一不成立 → false；or 任一成立 → true；嵌套 not', () => {
    const w = new World();
    res(w, 'hp', 10);
    expect(evaluateCondition(w, { kind: 'and', of: [
      { kind: 'resource', id: 'hp', cmp: 'gt', value: 0 },
      { kind: 'resource', id: 'hp', cmp: 'gt', value: 50 },
    ] })).toBe(false);
    expect(evaluateCondition(w, { kind: 'or', of: [
      { kind: 'resource', id: 'hp', cmp: 'gt', value: 50 },
      { kind: 'resource', id: 'hp', cmp: 'lt', value: 50 },
    ] })).toBe(true);
    expect(evaluateCondition(w, { kind: 'not', of: { kind: 'resource', id: 'hp', cmp: 'gt', value: 50 } })).toBe(true);
  });

  it('空 and = 真（vacuous），空 or = 假', () => {
    const w = new World();
    expect(evaluateCondition(w, { kind: 'and', of: [] })).toBe(true);
    expect(evaluateCondition(w, { kind: 'or', of: [] })).toBe(false);
  });

  it('REQ-017 vsResource：与另一资源比（动态阈值 round_score≥blind）', () => {
    const w = new World();
    res(w, 'round_score', 272);
    res(w, 'blind', 200);
    expect(evaluateCondition(w, { kind: 'resource', id: 'round_score', cmp: 'gte', value: 999, vsResource: 'blind' })).toBe(true); // 272≥200（忽略静态 999）
    res(w, 'blind2', 500);
    expect(evaluateCondition(w, { kind: 'resource', id: 'round_score', cmp: 'gte', value: 0, vsResource: 'blind2' })).toBe(false); // 272<500
    // vsResource 资源缺失 → 回退静态 value
    expect(evaluateCondition(w, { kind: 'resource', id: 'round_score', cmp: 'gte', value: 100, vsResource: 'nope' })).toBe(true); // 回退 100，272≥100
  });
});
