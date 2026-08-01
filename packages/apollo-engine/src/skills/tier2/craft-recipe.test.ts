import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Resource, Flag, State, Signal, CraftRecipe } from '@engine/protocol/components.js';
import { craftRecipeCapability } from './craft-recipe.js';

function worldWithCraft(): World {
  const w = new World();
  for (const s of craftRecipeCapability.systems) w.addSystem(s);
  return w;
}
function res(w: World, id: string, current: number, min = 0, max = Infinity): void {
  const e = `res:${id}`;
  if (!w.hasComponent(e, 'Resource')) w.createEntity(e);
  w.addComponent(e, { type: 'Resource', id, current, min, max } as Resource);
}
function flag(w: World, id: string, active: boolean): void {
  const e = `flag:${id}`;
  if (!w.hasComponent(e, 'Flag')) w.createEntity(e);
  w.addComponent(e, { type: 'Flag', id, active } as Flag);
}
function state(w: World, fsmId: string, current: string): void {
  const e = `state:${fsmId}`;
  if (!w.hasComponent(e, 'State')) w.createEntity(e);
  w.addComponent(e, { type: 'State', fsmId, current, previous: '' } as State);
}
function signal(w: World, name: string): void {
  const e = `sig:${name}`;
  if (!w.hasComponent(e, 'Signal')) w.createEntity(e);
  w.addComponent(e, { type: 'Signal', name, source: e } as Signal);
}
function recipe(w: World, eid: string, rc: Omit<CraftRecipe, 'type'>): void {
  if (!w.hasComponent(eid, 'CraftRecipe')) w.createEntity(eid);
  w.addComponent(eid, { type: 'CraftRecipe', ...rc } as CraftRecipe);
}
function val(w: World, id: string): number {
  return w.getComponent<Resource>(`res:${id}`, 'Resource')!.current;
}
function flagOn(w: World, id: string): boolean {
  return w.getComponent<Flag>(`flag:${id}`, 'Flag')!.active;
}

describe('T2 craft-recipe — metadata', () => {
  it('id / Commit 相位 / 读写契约', () => {
    expect(craftRecipeCapability.id).toBe('t2-craft-recipe');
    expect(craftRecipeCapability.systems[0].phase).toBe(20); // Commit
    expect(craftRecipeCapability.components.writes).toEqual(['Resource', 'Flag', 'State']);
  });
});

describe('T2 craft-recipe — 可负担才成交（REQ-C-003）', () => {
  it('够料 → 扣料 + 置 flag', () => {
    const w = worldWithCraft();
    res(w, 'iron', 10);
    flag(w, 'sword_unlocked', false);
    recipe(w, 'r1', { onSignal: 'craft_sword', costs: [{ id: 'iron', amount: 8 }], grantsFlag: 'sword_unlocked' });
    signal(w, 'craft_sword');
    w.tick();
    expect(val(w, 'iron')).toBe(2);
    expect(flagOn(w, 'sword_unlocked')).toBe(true);
  });

  it('不够料 → 整单不动（不扣、不置 flag）', () => {
    const w = worldWithCraft();
    res(w, 'iron', 5);
    flag(w, 'sword_unlocked', false);
    recipe(w, 'r1', { onSignal: 'craft_sword', costs: [{ id: 'iron', amount: 8 }], grantsFlag: 'sword_unlocked' });
    signal(w, 'craft_sword');
    w.tick();
    expect(val(w, 'iron')).toBe(5);
    expect(flagOn(w, 'sword_unlocked')).toBe(false);
  });

  it('多项成本原子性：一项不够 → 全部不扣', () => {
    const w = worldWithCraft();
    res(w, 'iron', 10);
    res(w, 'wood', 2);
    recipe(w, 'r1', { onSignal: 'craft', costs: [{ id: 'iron', amount: 5 }, { id: 'wood', amount: 5 }] });
    signal(w, 'craft');
    w.tick();
    expect(val(w, 'iron')).toBe(10); // 未扣（wood 不够 → 整单回滚）
    expect(val(w, 'wood')).toBe(2);
  });
});

describe('T2 craft-recipe — 批量改值（R14）', () => {
  it('costs 留空 + gains 多项 → 一个 tick 原子改多项', () => {
    const w = worldWithCraft();
    res(w, 'affection_S', 10);
    res(w, 'career', 0);
    recipe(w, 'opt', { onSignal: 'choose_kind', costs: [], gains: [{ id: 'affection_S', amount: 5 }, { id: 'career', amount: 2 }] });
    signal(w, 'choose_kind');
    w.tick();
    expect(val(w, 'affection_S')).toBe(15);
    expect(val(w, 'career')).toBe(2);
  });

  it('以物易物：扣 costs 同时加 gains', () => {
    const w = worldWithCraft();
    res(w, 'wood', 3);
    res(w, 'plank', 0);
    recipe(w, 'mill', { onSignal: 'trade', costs: [{ id: 'wood', amount: 3 }], gains: [{ id: 'plank', amount: 1 }] });
    signal(w, 'trade');
    w.tick();
    expect(val(w, 'wood')).toBe(0);
    expect(val(w, 'plank')).toBe(1);
  });
});

describe('T2 craft-recipe — grantsState / 无信号 / 钳制', () => {
  it('成交时设置 State', () => {
    const w = worldWithCraft();
    res(w, 'gem', 1);
    state(w, 'tier', 'bronze');
    recipe(w, 'up', { onSignal: 'upgrade', costs: [{ id: 'gem', amount: 1 }], grantsState: { fsmId: 'tier', value: 'silver' } });
    signal(w, 'upgrade');
    w.tick();
    expect(w.getComponent<State>('state:tier', 'State')!.current).toBe('silver');
  });

  it('无信号 → 什么都不做', () => {
    const w = worldWithCraft();
    res(w, 'iron', 10);
    recipe(w, 'r1', { onSignal: 'craft', costs: [{ id: 'iron', amount: 8 }] });
    w.tick(); // 无 signal
    expect(val(w, 'iron')).toBe(10);
  });

  it('扣到 min 边界仍可负担（current-amount===min）', () => {
    const w = worldWithCraft();
    res(w, 'gold', 3, 0);
    recipe(w, 'r1', { onSignal: 'buy', costs: [{ id: 'gold', amount: 3 }] });
    signal(w, 'buy');
    w.tick();
    expect(val(w, 'gold')).toBe(0);
  });
});
