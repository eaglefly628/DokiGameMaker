import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Hierarchy, DestroyRequest } from '@engine/protocol/components.js';
import { hierarchyCascadeCapability } from './hierarchy-cascade.js';
import { destroyCapability } from '@atom-skills/destroy/index.js';

// cascade(写 DestroyRequest) + destroy-apply(消费 DestroyRequest) 同场：拓扑自动把 cascade 排前。
function mk(reverse = false): World {
  const w = new World();
  const caps = reverse ? [destroyCapability, hierarchyCascadeCapability] : [hierarchyCascadeCapability, destroyCapability];
  for (const cap of caps) for (const s of cap.systems) w.addSystem(s);
  return w;
}
function ent(w: World, id: string): void {
  w.createEntity(id);
}
function hchild(w: World, id: string, parent: string): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Hierarchy', parentId: parent, localX: 0, localY: 0, localRotation: 0, localScaleX: 1, localScaleY: 1 } as Hierarchy);
}
function kill(w: World, id: string): void {
  w.addComponent(id, { type: 'DestroyRequest', entityId: id } as DestroyRequest);
}
const alive = (w: World, id: string): boolean => w.getAllEntities().includes(id);

describe('T1 hierarchy-cascade（子随父死，REQ-026）', () => {
  it('契约：读 Hierarchy+DestroyRequest / 写 DestroyRequest / runsBefore destroy-apply', () => {
    expect(hierarchyCascadeCapability.components.reads).toEqual(['Hierarchy', 'DestroyRequest']);
    expect(hierarchyCascadeCapability.components.writes).toEqual(['DestroyRequest']);
    expect(hierarchyCascadeCapability.systems[0].runsBefore).toEqual(['destroy-apply']);
  });

  it('单层：父被销毁 → 子同帧随之消失', () => {
    const w = mk();
    ent(w, 'piece');
    hchild(w, 'name', 'piece'); // 名字挂件
    kill(w, 'piece');
    w.tick();
    expect(alive(w, 'piece')).toBe(false);
    expect(alive(w, 'name')).toBe(false); // 不再残留
  });

  it('多级：祖→父→子 传递闭包，一帧全清', () => {
    const w = mk();
    ent(w, 'gp');
    hchild(w, 'p', 'gp');
    hchild(w, 'c', 'p');
    hchild(w, 'gc', 'c'); // 四级
    kill(w, 'gp');
    w.tick();
    for (const id of ['gp', 'p', 'c', 'gc']) expect(alive(w, id)).toBe(false);
  });

  it('不误伤：只销毁目标子树，无关实体及其子存活', () => {
    const w = mk();
    ent(w, 'p1');
    hchild(w, 'c1', 'p1');
    ent(w, 'p2');
    hchild(w, 'c2', 'p2');
    kill(w, 'p1');
    w.tick();
    expect(alive(w, 'p1')).toBe(false);
    expect(alive(w, 'c1')).toBe(false);
    expect(alive(w, 'p2')).toBe(true); // 无关，存活
    expect(alive(w, 'c2')).toBe(true);
  });

  it('根/逃生门：parentId 为空的实体永不被波及（销毁前置空 = 父死子留）', () => {
    const w = mk();
    ent(w, 'p');
    hchild(w, 'attached', 'p');
    hchild(w, 'detached', ''); // 根实体（无父）
    kill(w, 'p');
    w.tick();
    expect(alive(w, 'p')).toBe(false);
    expect(alive(w, 'attached')).toBe(false);
    expect(alive(w, 'detached')).toBe(true); // 空 parentId → 不级联
  });

  it('环引用：互为父子也终止（无 DestroyRequest 时谁都不动）', () => {
    const w = mk();
    hchild(w, 'a', 'b');
    hchild(w, 'b', 'a'); // a↔b 成环
    w.tick(); // 不得死循环
    expect(alive(w, 'a')).toBe(true);
    expect(alive(w, 'b')).toBe(true);
  });

  it('环内被销毁：销毁环上一点 → 整环清空且终止', () => {
    const w = mk();
    hchild(w, 'a', 'b');
    hchild(w, 'b', 'a');
    kill(w, 'a');
    w.tick();
    expect(alive(w, 'a')).toBe(false);
    expect(alive(w, 'b')).toBe(false); // b.parent=a 被销毁 → b 随之死
  });

  it('定序无关：destroy-apply 先注册也对（拓扑修正）', () => {
    const w = mk(true);
    ent(w, 'p');
    hchild(w, 'c', 'p');
    kill(w, 'p');
    w.tick();
    expect(alive(w, 'p')).toBe(false);
    expect(alive(w, 'c')).toBe(false);
  });
});
