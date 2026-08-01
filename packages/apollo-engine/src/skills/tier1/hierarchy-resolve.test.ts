import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { SystemPhase } from '@engine/core/types.js';
import type { Transform, Hierarchy } from '@engine/protocol/components.js';
import { hierarchyResolveCapability } from './hierarchy-resolve.js';

function mk(): World {
  const w = new World();
  for (const s of hierarchyResolveCapability.systems) w.addSystem(s);
  return w;
}
const T = (w: World, id: string): Transform => w.getComponent<Transform>(id, 'Transform')!;
function tf(w: World, id: string, x: number, y: number): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
}
function child(w: World, id: string, parent: string, lx: number, ly: number): void {
  w.addComponent(id, { type: 'Hierarchy', parentId: parent, localX: lx, localY: ly, localRotation: 0, localScaleX: 1, localScaleY: 1 } as Hierarchy);
}

describe('T1 hierarchy-resolve', () => {
  it('契约：PostResolve 阶段 / 读 Hierarchy+Transform / 写 Transform', () => {
    expect(hierarchyResolveCapability.systems[0].phase).toBe(SystemPhase.PostResolve);
    expect(hierarchyResolveCapability.components.writes).toEqual(['Transform']);
  });
  it('单层：子 = 父 + 本地偏移', () => {
    const w = mk();
    tf(w, 'p', 100, 50);
    tf(w, 'c', 0, 0);
    child(w, 'c', 'p', 10, -5);
    w.tick();
    expect(T(w, 'c').x).toBe(110);
    expect(T(w, 'c').y).toBe(45);
  });
  it('两级：先根后叶，一帧到位（倒序注册也对）', () => {
    const w = mk();
    tf(w, 'c', 0, 0);
    tf(w, 'b', 0, 0);
    tf(w, 'a', 100, 0); // 注册倒序
    child(w, 'c', 'b', 5, 0);
    child(w, 'b', 'a', 10, 0);
    w.tick();
    expect(T(w, 'b').x).toBe(110); // a(100)+10
    expect(T(w, 'c').x).toBe(115); // b(110)+5
  });
  it('父无 Transform → 跳过', () => {
    const w = mk();
    w.createEntity('p'); // 无 Transform
    tf(w, 'c', 7, 7);
    child(w, 'c', 'p', 1, 1);
    w.tick();
    expect(T(w, 'c').x).toBe(7); // 未变
  });
});
