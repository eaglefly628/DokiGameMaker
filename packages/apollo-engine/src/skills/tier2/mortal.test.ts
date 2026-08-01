import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Mortal, Resource, ResourceModify, Transform, PrefabLibrary, PrefabTemplate } from '@engine/protocol/components.js';
import { mortalCapability } from './mortal.js';
import { resourceCapability } from '@atom-skills/index.js';
import { destroyCapability } from '@skills/atoms/destroy/index.js';
import { prefabCapability } from '@skills/tier3/index.js';

const alive = (w: World, e: string): boolean => w.getAllEntities().includes(e);

// resource-apply(扣血) → mortal(判死发 DestroyRequest) → destroy-apply(移除)，整链。
function world(): World {
  const w = new World();
  for (const s of resourceCapability.systems) w.addSystem(s);
  for (const s of mortalCapability.systems) w.addSystem(s);
  for (const s of destroyCapability.systems) w.addSystem(s);
  return w;
}
function mob(w: World, id: string, hp: number): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Resource', id: 'hp', current: hp, min: 0, max: 100 } as Resource);
  w.addComponent(id, { type: 'Mortal', resource: 'hp', atOrBelow: 0 } as Mortal);
}

describe('mortal — 元数据 / 定序', () => {
  it('id 正确 + runsAfter resource-apply（看到本帧扣血后的血量）', () => {
    expect(mortalCapability.id).toBe('t2-mortal');
    expect(mortalCapability.systems[0].runsAfter).toContain('resource-apply');
  });
});

describe('mortal — 逐实体死亡', () => {
  it('hp 被打到 0 → 同帧销毁自己', () => {
    const w = world();
    mob(w, 'm1', 5);
    // 局部致命伤：扣 5 → resource-apply 归 0 → mortal 判死 → destroy-apply 移除。
    w.addComponent('m1', { type: 'ResourceModify', resourceId: 'hp', amount: -5, scope: 'local' } as ResourceModify);
    w.tick();
    expect(alive(w, 'm1')).toBe(false);
  });

  it('未致命 → 不死', () => {
    const w = world();
    mob(w, 'm1', 50);
    w.addComponent('m1', { type: 'ResourceModify', resourceId: 'hp', amount: -10, scope: 'local' } as ResourceModify);
    w.tick();
    expect(alive(w, 'm1')).toBe(true);
    expect(w.getComponent<Resource>('m1', 'Resource')!.current).toBe(40);
  });

  it('逐实体：只死血空的那个，其余照活（N 怪各自死亡）', () => {
    const w = world();
    mob(w, 'm1', 3);
    mob(w, 'm2', 80);
    mob(w, 'm3', 1);
    w.addComponent('m1', { type: 'ResourceModify', resourceId: 'hp', amount: -3, scope: 'local' } as ResourceModify);
    w.addComponent('m3', { type: 'ResourceModify', resourceId: 'hp', amount: -1, scope: 'local' } as ResourceModify);
    w.tick();
    expect(alive(w, 'm1')).toBe(false);
    expect(alive(w, 'm2')).toBe(true);
    expect(alive(w, 'm3')).toBe(false);
  });
});

describe('mortal — 死亡掉落（dropTemplate → prefab 展开）', () => {
  it('怪死时在原地掉落 loot（经 prefab 展开），怪本体销毁', () => {
    const w = new World();
    for (const s of resourceCapability.systems) w.addSystem(s);
    for (const s of mortalCapability.systems) w.addSystem(s);
    for (const s of prefabCapability.systems) w.addSystem(s);
    for (const s of destroyCapability.systems) w.addSystem(s);

    const loot: PrefabTemplate = { entities: { item: { Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } } } };
    w.createEntity('library');
    w.addComponent('library', { type: 'PrefabLibrary', templates: { loot }, seq: 0 } as PrefabLibrary);

    w.createEntity('m1');
    w.addComponent('m1', { type: 'Transform', x: 33, y: 44, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('m1', { type: 'Resource', id: 'hp', current: 2, min: 0, max: 100 } as Resource);
    w.addComponent('m1', { type: 'Mortal', resource: 'hp', atOrBelow: 0, dropTemplate: 'loot' } as Mortal);
    w.addComponent('m1', { type: 'ResourceModify', resourceId: 'hp', amount: -2, scope: 'local' } as ResourceModify);

    w.tick();
    expect(alive(w, 'm1')).toBe(false); // 怪本体销毁
    // loot 在原地展开（Transform 偏移到 33,44）。
    expect(w.getComponent<Transform>('loot#0:item', 'Transform')).toMatchObject({ x: 33, y: 44 });
  });
});
