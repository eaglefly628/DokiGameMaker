import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { mergeProximityClearCapability } from './merge-proximity-clear.js';
import type { Blocker, MergeEvent, MergeProximity, Transform, Resource, SpawnRequest } from '@engine/protocol/components.js';

const CELL = 96;
function mkWorld(radius = 1, dec = 1): World {
  const w = new World();
  for (const sys of mergeProximityClearCapability.systems) w.addSystem(sys);
  w.createEntity('mp');
  w.addComponent('mp', { type: 'MergeProximity', cellSize: CELL, radius, dec } as MergeProximity);
  return w;
}
// 格 (col,row) → 世界中心（与 game101 cellCenter 同构·此处独立算）。
function center(col: number, row: number): { x: number; y: number } { return { x: 48 + col * CELL + CELL / 2, y: 48 + row * CELL + CELL / 2 }; }
function mkBlocker(w: World, id: string, col: number, row: number, layers: number, reveal: Blocker['reveal']): void {
  const p = center(col, row);
  w.createEntity(id);
  w.addComponent(id, { type: 'Blocker', layers, reveal } as Blocker);
  w.addComponent(id, { type: 'Transform', x: p.x, y: p.y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
}
function mergeAt(w: World, col: number, row: number): void {
  const p = center(col, row);
  const id = `ev-${col}-${row}`;
  w.createEntity(id);
  w.addComponent(id, { type: 'MergeEvent', x: p.x, y: p.y } as MergeEvent);
  w.tick();
}
const layers = (w: World, id: string): number => w.getComponent<Blocker>(id, 'Blocker')?.layers ?? -999;
const alive = (w: World, id: string): boolean => w.hasComponent(id, 'Blocker') && !w.hasComponent(id, 'DestroyRequest');

describe('merge-proximity-clear · 二消清邻格阻碍（挖掘式解锁）', () => {
  it('元数据齐全', () => {
    expect(mergeProximityClearCapability.id).toBe('t2-merge-proximity-clear');
    expect(mergeProximityClearCapability.components.provides.Blocker).toBeTruthy();
    expect(mergeProximityClearCapability.components.consumes).toContain('MergeEvent');
  });

  it('3×3 邻格各 −dec：合并在 (2,2) → 8 邻格 + 中心减层·非邻格不动', () => {
    const w = mkWorld(1, 1);
    // 中心 (2,2) 周围 8 格各放 blocker + 一个远格 (5,5)
    const near = [[1,1],[2,1],[3,1],[1,2],[3,2],[1,3],[2,3],[3,3]];
    near.forEach(([c,r],i)=>mkBlocker(w, `n${i}`, c, r, 3, { kind:'spawn', templateId:'x' }));
    mkBlocker(w, 'far', 5, 5, 3, { kind:'spawn', templateId:'x' });
    mergeAt(w, 2, 2);
    near.forEach((_,i)=>expect(layers(w, `n${i}`)).toBe(2)); // 邻格 −1
    expect(layers(w, 'far')).toBe(3);                        // 远格不动
  });

  it('归零清层 + reveal spawn：layers 减到 0 → DestroyRequest + 该格 SpawnRequest 露出物', () => {
    const w = mkWorld(1, 1);
    mkBlocker(w, 'b', 2, 2, 1, { kind: 'spawn', templateId: 'coffee_1' });
    mergeAt(w, 2, 1); // (2,1) 邻近 (2,2)
    expect(w.hasComponent('b', 'DestroyRequest')).toBe(true); // 清层
    const reqs = w.query('SpawnRequest').map(([id]) => w.getComponent<SpawnRequest>(id, 'SpawnRequest')!);
    const rv = reqs.find((r) => r.templateId === 'coffee_1');
    expect(rv).toBeTruthy();
    const p = center(2, 2);
    expect(rv!.x).toBeCloseTo(p.x); expect(rv!.y).toBeCloseTo(p.y); // 在该格露出
  });

  it('归零 reveal resource：给资源 +amount（钳限）', () => {
    const w = mkWorld(1, 1);
    w.createEntity('energy'); w.addComponent('energy', { type: 'Resource', id: 'energy', current: 50, min: 0, max: 100 } as Resource);
    mkBlocker(w, 'b', 2, 2, 1, { kind: 'resource', resourceId: 'energy', amount: 20 });
    mergeAt(w, 2, 2);
    expect(w.getComponent<Resource>('energy', 'Resource')!.current).toBe(70);
  });

  it('多层：需多次邻近二消才归零', () => {
    const w = mkWorld(1, 1);
    mkBlocker(w, 'b', 2, 2, 3, { kind: 'spawn', templateId: 'x' });
    mergeAt(w, 2, 2); expect(layers(w, 'b')).toBe(2); expect(alive(w, 'b')).toBe(true);
    mergeAt(w, 2, 2); expect(layers(w, 'b')).toBe(1);
    mergeAt(w, 2, 2); expect(alive(w, 'b')).toBe(false); // 第三次归零清层
  });

  it('缺 MergeProximity 单例 → 不动（零回归）', () => {
    const w = new World();
    for (const sys of mergeProximityClearCapability.systems) w.addSystem(sys);
    mkBlocker(w, 'b', 2, 2, 2, { kind: 'spawn', templateId: 'x' });
    mergeAt(w, 2, 2);
    expect(layers(w, 'b')).toBe(2); // 没配置=不减
  });

  it('MergeEvent 消费即清（一拍后不残留）', () => {
    const w = mkWorld();
    mkBlocker(w, 'b', 2, 2, 5, { kind: 'spawn', templateId: 'x' });
    mergeAt(w, 2, 2);
    expect(w.query('MergeEvent').length).toBe(0);
  });
});
