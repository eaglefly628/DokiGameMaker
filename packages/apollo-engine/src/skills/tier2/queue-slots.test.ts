import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { tweenCapability, motionApplyCapability } from '@skills/tier1/index.js';
import type { QueueSlots, QueueMember, Tag, Transform, Clickable } from '@engine/protocol/components.js';
import { queueSlotsCapability } from './queue-slots.js';
import { clickableCapability } from './clickable.js';

// queue-slots（REQ-POOL-ADVANCE 缺口）：压实队列——消费队首/中间任一成员，存活成员整体前移补成
// 连续 0..N-1（与 tray 的占坑制、不前移互补）。
const TICKET = 1 << 6;

function mk(overrides: Partial<QueueSlots> = {}): World {
  const w = new World();
  for (const s of queueSlotsCapability.systems) w.addSystem(s);
  w.createEntity('q');
  w.addComponent('q', {
    type: 'QueueSlots',
    memberTag: TICKET,
    capacity: 9,
    headCount: 2,
    originX: 0,
    originY: 200,
    gap: 40,
    action: 'serve',
    ...overrides,
  } as QueueSlots);
  return w;
}

function unit(w: World, id: string, x = 999, y = 999): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Tag', flags: TICKET } as Tag);
  w.addComponent(id, { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
}

const idx = (w: World, id: string): number | undefined => w.getComponent<QueueMember>(id, 'QueueMember')?.index;
const at = (w: World, id: string): [number, number] => {
  const t = w.getComponent<Transform>(id, 'Transform')!;
  return [t.x, t.y];
};
const clickable = (w: World, id: string): boolean => w.hasComponent(id, 'Clickable');

describe('T2 queue-slots（压实队列，REQ-POOL-ADVANCE 缺口）', () => {
  it('初始占位：新成员按 id 升序压实成 0..N-1，Transform 钉到槽位', () => {
    const w = mk();
    unit(w, 'a'); unit(w, 'b'); unit(w, 'c');
    w.tick();
    expect(idx(w, 'a')).toBe(0);
    expect(idx(w, 'b')).toBe(1);
    expect(idx(w, 'c')).toBe(2);
    expect(at(w, 'a')).toEqual([0, 200]);
    expect(at(w, 'b')).toEqual([40, 200]);
    expect(at(w, 'c')).toEqual([80, 200]);
  });

  it('压实核心：消费队首（销毁成员）后，后排全体前移到 0..N-1（不留空洞）', () => {
    const w = mk();
    unit(w, 'a'); unit(w, 'b'); unit(w, 'c'); unit(w, 'd');
    w.tick();
    expect([idx(w, 'a'), idx(w, 'b'), idx(w, 'c'), idx(w, 'd')]).toEqual([0, 1, 2, 3]);

    w.destroyEntity('a'); // 消费队首
    w.tick();
    expect(idx(w, 'b')).toBe(0);
    expect(idx(w, 'c')).toBe(1);
    expect(idx(w, 'd')).toBe(2);
    expect(at(w, 'b')).toEqual([0, 200]);
    expect(at(w, 'c')).toEqual([40, 200]);
    expect(at(w, 'd')).toEqual([80, 200]);
  });

  it('压实核心：消费队中成员（非队首）后，其后成员同样前移补位', () => {
    const w = mk();
    unit(w, 'a'); unit(w, 'b'); unit(w, 'c'); unit(w, 'd');
    w.tick();
    w.destroyEntity('b'); // 消费队中
    w.tick();
    expect(idx(w, 'a')).toBe(0);
    expect(idx(w, 'c')).toBe(1); // 原 2 号前移到 1
    expect(idx(w, 'd')).toBe(2); // 原 3 号前移到 2
  });

  it('头部可点：index < headCount 挂 Clickable，其余不挂；消费队首后新头获得 Clickable', () => {
    const w = mk({ headCount: 2 });
    unit(w, 'a'); unit(w, 'b'); unit(w, 'c');
    w.tick();
    expect(clickable(w, 'a')).toBe(true);
    expect(clickable(w, 'b')).toBe(true);
    expect(clickable(w, 'c')).toBe(false);
    expect(w.getComponent<Clickable>('a', 'Clickable')?.action).toBe('serve');

    w.destroyEntity('a');
    w.tick();
    expect(clickable(w, 'b')).toBe(true); // 原队首，仍在头部
    expect(clickable(w, 'c')).toBe(true); // 前移进头部 → 新获得 Clickable
  });

  it('稳定序确定性：两个独立 world 跑同样操作序列，产出的 index/位置逐位一致', () => {
    const run = (): Array<[string, number | undefined, [number, number]]> => {
      const w = mk();
      unit(w, 'z'); unit(w, 'a'); unit(w, 'm');
      w.tick();
      w.destroyEntity('a');
      unit(w, 'n');
      w.tick();
      return ['z', 'm', 'n'].map((id) => [id, idx(w, id), at(w, id)]);
    };
    expect(run()).toEqual(run());
  });

  it('确定性：同拍多个新成员按 id 升序分配（不依赖创建顺序）', () => {
    const w = mk();
    unit(w, 'z'); unit(w, 'a'); unit(w, 'm');
    w.tick();
    expect(idx(w, 'a')).toBe(0);
    expect(idx(w, 'm')).toBe(1);
    expect(idx(w, 'z')).toBe(2);
  });

  it('空边界：无成员时系统不抛错、不产生任何写入', () => {
    const w = mk();
    expect(() => w.tick()).not.toThrow();
  });

  it('满边界：成员数等于 capacity 仍正常压实，逐位钉位', () => {
    const w = mk({ capacity: 3, headCount: 1 });
    unit(w, 'a'); unit(w, 'b'); unit(w, 'c');
    w.tick();
    expect([idx(w, 'a'), idx(w, 'b'), idx(w, 'c')]).toEqual([0, 1, 2]);
    expect(clickable(w, 'a')).toBe(true);
    expect(clickable(w, 'b')).toBe(false);
    expect(clickable(w, 'c')).toBe(false);
  });

  it('轴向 axis="y"：沿 y 展开而非默认 x', () => {
    const w = mk({ axis: 'y', originX: 50, originY: 0, gap: 30 });
    unit(w, 'a'); unit(w, 'b');
    w.tick();
    expect(at(w, 'a')).toEqual([50, 0]);
    expect(at(w, 'b')).toEqual([50, 30]);
  });

  it('撞环回归：与 clickable / tween / motion-apply 同装一个 World，tick 不抛环错误', () => {
    const w = new World();
    for (const s of queueSlotsCapability.systems) w.addSystem(s);
    for (const s of clickableCapability.systems) w.addSystem(s);
    for (const s of tweenCapability.systems) w.addSystem(s);
    for (const s of motionApplyCapability.systems) w.addSystem(s);
    w.createEntity('q');
    w.addComponent('q', {
      type: 'QueueSlots', memberTag: TICKET, capacity: 9, headCount: 1,
      originX: 0, originY: 0, gap: 40, action: 'serve',
    } as QueueSlots);
    unit(w, 'a'); unit(w, 'b');
    expect(() => w.tick()).not.toThrow();
    expect(() => w.tick()).not.toThrow();
  });
});
