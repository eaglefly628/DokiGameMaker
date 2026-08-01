import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { orderFulfillCapability } from './order-fulfill.js';
import type { Order, DeliverDrop, PrefabOrigin, Resource, RandomSeed } from '@engine/protocol/components.js';

// headless：装能力 + 造订单/成品/资源，注 DeliverDrop 跑一拍看裁决。
function mkWorld(): World {
  const w = new World();
  for (const sys of orderFulfillCapability.systems) w.addSystem(sys);
  return w;
}
function mkItem(w: World, id: string, templateId: string): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'PrefabOrigin', templateId, seq: 0, localId: 'body' } as PrefabOrigin);
}
function mkOrder(w: World, id: string, o: Partial<Order> & { needItems: string[]; reward: Order['reward'] }): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Order', orderId: id, filled: o.needItems.map(() => false), resetOnComplete: false, ...o } as Order);
}
function mkRes(w: World, id: string, current = 0, max = 999999): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Resource', id, current, min: 0, max } as Resource);
}
function deliver(w: World, item: string, order: string): void {
  const cid = `dd:${item}:${order}`;
  w.createEntity(cid);
  w.addComponent(cid, { type: 'DeliverDrop', item, order } as DeliverDrop);
  w.tick();
}
const res = (w: World, id: string): number => w.getComponent<Resource>(id, 'Resource')?.current ?? 0;
const filled = (w: World, id: string): boolean[] => w.getComponent<Order>(id, 'Order')!.filled;
const alive = (w: World, id: string): boolean => w.hasComponent(id, 'PrefabOrigin') && !w.hasComponent(id, 'DestroyRequest');
const needItemsOf = (w: World, id: string): string[] => w.getComponent<Order>(id, 'Order')!.needItems;
const rewardOf = (w: World, id: string): Order['reward'] => w.getComponent<Order>(id, 'Order')!.reward;
const cursorOf = (w: World, id: string): number | undefined => w.getComponent<Order>(id, 'Order')!.cursor;
function mkSeed(w: World, id: string, seed: number): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'RandomSeed', seed, sequence: 0 } as RandomSeed);
}

describe('order-fulfill · 拖成品交付订单（消耗棋盘实例·多槽·集齐发奖）', () => {
  it('元数据自描述齐全', () => {
    expect(orderFulfillCapability.id).toBe('t2-order-fulfill');
    expect(orderFulfillCapability.components.provides.Order).toBeTruthy();
    expect(orderFulfillCapability.components.provides.DeliverDrop).toBeTruthy();
    expect(orderFulfillCapability.components.consumes).toContain('DeliverDrop');
  });

  it('单槽命中：交付匹配成品 → 销毁该实例 + 该 slot 置满 + 集齐发奖', () => {
    const w = mkWorld();
    mkRes(w, 'coins'); mkRes(w, 'stars');
    mkOrder(w, 'ord', { needItems: ['dish_a'], reward: [{ resourceId: 'coins', amount: 44 }, { resourceId: 'stars', amount: 2 }] });
    mkItem(w, 'it', 'dish_a');
    deliver(w, 'it', 'ord');
    expect(filled(w, 'ord')).toEqual([true]);
    expect(w.hasComponent('it', 'DestroyRequest')).toBe(true); // 消耗该成品实例
    expect(res(w, 'coins')).toBe(44); // 集齐发奖
    expect(res(w, 'stars')).toBe(2);
  });

  it('不命中：模板不在需求 → 无改动（不销毁·不置满·不发奖）', () => {
    const w = mkWorld();
    mkRes(w, 'coins');
    mkOrder(w, 'ord', { needItems: ['dish_a'], reward: [{ resourceId: 'coins', amount: 44 }] });
    mkItem(w, 'it', 'dish_x'); // 异模板
    deliver(w, 'it', 'ord');
    expect(filled(w, 'ord')).toEqual([false]);
    expect(alive(w, 'it')).toBe(true);
    expect(res(w, 'coins')).toBe(0);
  });

  it('多槽：逐个交付·未集齐不发奖·最后一个集齐才发', () => {
    const w = mkWorld();
    mkRes(w, 'coins');
    mkOrder(w, 'ord', { needItems: ['dish_a', 'dish_b', 'dish_a'], reward: [{ resourceId: 'coins', amount: 100 }] });
    mkItem(w, 'i1', 'dish_a'); mkItem(w, 'i2', 'dish_a'); mkItem(w, 'i3', 'dish_b');
    deliver(w, 'i1', 'ord');
    expect(filled(w, 'ord')).toEqual([true, false, false]); // 落第一个 a slot
    expect(res(w, 'coins')).toBe(0); // 未集齐
    deliver(w, 'i3', 'ord');
    expect(filled(w, 'ord')).toEqual([true, true, false]); // dish_b 命中 slot1（唯一 b 需求）
    expect(res(w, 'coins')).toBe(0);
    deliver(w, 'i2', 'ord');
    expect(filled(w, 'ord').every((f) => f)).toBe(true);
    expect(res(w, 'coins')).toBe(100); // 集齐发奖
  });

  it('已满 slot 不重复占：同模板两次交付第二次落下一个同模板未满 slot', () => {
    const w = mkWorld();
    mkRes(w, 'coins');
    mkOrder(w, 'ord', { needItems: ['dish_a', 'dish_a'], reward: [{ resourceId: 'coins', amount: 10 }] });
    mkItem(w, 'i1', 'dish_a'); mkItem(w, 'i2', 'dish_a');
    deliver(w, 'i1', 'ord'); expect(filled(w, 'ord')).toEqual([true, false]);
    deliver(w, 'i2', 'ord'); expect(filled(w, 'ord')).toEqual([true, true]);
    expect(res(w, 'coins')).toBe(10);
  });

  it('resetOnComplete=true：集齐发奖后清空 filled 重新接单', () => {
    const w = mkWorld();
    mkRes(w, 'coins');
    mkOrder(w, 'ord', { needItems: ['dish_a'], reward: [{ resourceId: 'coins', amount: 5 }], resetOnComplete: true });
    mkItem(w, 'i1', 'dish_a');
    deliver(w, 'i1', 'ord');
    expect(res(w, 'coins')).toBe(5);
    expect(filled(w, 'ord')).toEqual([false]); // 重置接单
  });

  it('发奖钳进资源上限', () => {
    const w = mkWorld();
    mkRes(w, 'coins', 995, 1000);
    mkOrder(w, 'ord', { needItems: ['dish_a'], reward: [{ resourceId: 'coins', amount: 44 }] });
    mkItem(w, 'i1', 'dish_a');
    deliver(w, 'i1', 'ord');
    expect(res(w, 'coins')).toBe(1000); // 995+44=1039 钳到 1000
  });

  it('DeliverDrop 消费即清（一拍后载体不残留）', () => {
    const w = mkWorld();
    mkRes(w, 'coins');
    mkOrder(w, 'ord', { needItems: ['dish_a'], reward: [{ resourceId: 'coins', amount: 5 }] });
    mkItem(w, 'i1', 'dish_a');
    deliver(w, 'i1', 'ord');
    expect(w.query('DeliverDrop').length).toBe(0);
  });
});

describe('order-fulfill · 订单轮换（REQ-ORDERROT·集齐后从 pool 取下一单）', () => {
  it('空 pool（未设）：逐字节零回归——resetOnComplete 旧行为原样不动', () => {
    const w = mkWorld();
    mkRes(w, 'coins');
    mkOrder(w, 'ord', { needItems: ['dish_a'], reward: [{ resourceId: 'coins', amount: 5 }], resetOnComplete: true });
    mkItem(w, 'i1', 'dish_a');
    deliver(w, 'i1', 'ord');
    expect(needItemsOf(w, 'ord')).toEqual(['dish_a']); // 原样不动
    expect(rewardOf(w, 'ord')).toEqual([{ resourceId: 'coins', amount: 5 }]);
    expect(filled(w, 'ord')).toEqual([false]); // resetOnComplete=true 清空
    expect(res(w, 'coins')).toBe(5);
  });

  it('空 pool（显式 pool:[]）：与未设 pool 行为完全一致（resetOnComplete=false 时也不重置）', () => {
    const w = mkWorld();
    mkRes(w, 'coins');
    mkOrder(w, 'ord', { needItems: ['dish_a'], reward: [{ resourceId: 'coins', amount: 5 }], resetOnComplete: false, pool: [] });
    mkItem(w, 'i1', 'dish_a');
    deliver(w, 'i1', 'ord');
    expect(needItemsOf(w, 'ord')).toEqual(['dish_a']);
    expect(filled(w, 'ord')).toEqual([true]); // resetOnComplete=false → 不清空（同旧行为）
    expect(res(w, 'coins')).toBe(5);
  });

  it('sequence 环回：集齐后按 cursor 顺序取下一单·换 needItems/reward·走完环回起点（升级链 food_2→food_3→food_2）', () => {
    const w = mkWorld();
    mkRes(w, 'coins');
    mkOrder(w, 'ord', {
      needItems: ['food_2'],
      reward: [{ resourceId: 'coins', amount: 10 }],
      rotateMode: 'sequence',
      pool: [
        { needItems: ['food_3'], reward: [{ resourceId: 'coins', amount: 20 }] },
        { needItems: ['food_2'], reward: [{ resourceId: 'coins', amount: 10 }] },
      ],
    });
    mkItem(w, 'i1', 'food_2');
    deliver(w, 'i1', 'ord');
    expect(needItemsOf(w, 'ord')).toEqual(['food_3']); // 升级：pool[0]
    expect(rewardOf(w, 'ord')).toEqual([{ resourceId: 'coins', amount: 20 }]); // reward 同步换
    expect(filled(w, 'ord')).toEqual([false]);
    expect(cursorOf(w, 'ord')).toBe(1);
    expect(res(w, 'coins')).toBe(10);

    mkItem(w, 'i2', 'food_3');
    deliver(w, 'i2', 'ord');
    expect(needItemsOf(w, 'ord')).toEqual(['food_2']); // pool[1]
    expect(cursorOf(w, 'ord')).toBe(0); // 环回
    expect(res(w, 'coins')).toBe(30); // +20

    mkItem(w, 'i3', 'food_2');
    deliver(w, 'i3', 'ord');
    expect(needItemsOf(w, 'ord')).toEqual(['food_3']); // 环回到 pool[0]，证明真正循环
    expect(cursorOf(w, 'ord')).toBe(1);
    expect(res(w, 'coins')).toBe(40); // +10
  });

  it('sequence 缺省（未设 rotateMode）：同 sequence 行为（缺省即顺序环回）', () => {
    const w = mkWorld();
    mkRes(w, 'coins');
    mkOrder(w, 'ord', {
      needItems: ['a'],
      reward: [],
      pool: [{ needItems: ['b'], reward: [] }, { needItems: ['c'], reward: [] }],
    });
    mkItem(w, 'i1', 'a');
    deliver(w, 'i1', 'ord');
    expect(needItemsOf(w, 'ord')).toEqual(['b']);
  });

  it('weighted：同世界 RandomSeed 序列 → 同一抽序列（确定性，同 weighted-spawn 口径）', () => {
    const pickSequence = (): string[] => {
      const w = mkWorld();
      mkRes(w, 'coins');
      mkSeed(w, 'rng', 777);
      mkOrder(w, 'ord', {
        needItems: ['a'],
        reward: [],
        rotateMode: 'weighted',
        pool: [
          { needItems: ['x'], reward: [], weight: 1 },
          { needItems: ['y'], reward: [], weight: 1 },
          { needItems: ['z'], reward: [], weight: 1 },
        ],
      });
      const picks: string[] = [];
      for (let i = 0; i < 6; i++) {
        const need = needItemsOf(w, 'ord')[0];
        mkItem(w, `it${i}`, need);
        deliver(w, `it${i}`, 'ord');
        picks.push(needItemsOf(w, 'ord')[0]);
      }
      return picks;
    };
    const a = pickSequence();
    const b = pickSequence();
    expect(a).toEqual(b); // 同种子 → 同抽序列
    expect(new Set(a).size).toBeGreaterThan(1); // 抽出不止一种（非退化成永远同一项）
  });

  it('weighted 无世界 RandomSeed → fail-closed 不轮（不崩·订单停在已集齐态待下次有 RNG）', () => {
    const w = mkWorld();
    mkRes(w, 'coins');
    mkOrder(w, 'ord', {
      needItems: ['a'],
      reward: [{ resourceId: 'coins', amount: 1 }],
      rotateMode: 'weighted',
      pool: [{ needItems: ['x'], reward: [], weight: 1 }],
    });
    mkItem(w, 'i1', 'a');
    deliver(w, 'i1', 'ord');
    expect(res(w, 'coins')).toBe(1); // reward 已发（发奖与轮换是两回事）
    expect(needItemsOf(w, 'ord')).toEqual(['a']); // 未轮（无 RNG，fail-closed）
    expect(filled(w, 'ord')).toEqual([true]); // 停在已集齐态，不崩
  });

  it('确定性：同布局双跑 snapshot 相等（sequence + weighted 混装多单同拍）', () => {
    const run = (): string => {
      const w = mkWorld();
      mkRes(w, 'coins');
      mkSeed(w, 'rng', 42);
      mkOrder(w, 'seq', {
        needItems: ['s0'], reward: [{ resourceId: 'coins', amount: 1 }], rotateMode: 'sequence',
        pool: [{ needItems: ['s1'], reward: [{ resourceId: 'coins', amount: 2 }] }, { needItems: ['s2'], reward: [{ resourceId: 'coins', amount: 3 }] }],
      });
      mkOrder(w, 'wtd', {
        needItems: ['w0'], reward: [],
        rotateMode: 'weighted',
        pool: [{ needItems: ['w1'], reward: [], weight: 2 }, { needItems: ['w2'], reward: [], weight: 1 }],
      });
      for (let i = 0; i < 4; i++) {
        mkItem(w, `si${i}`, needItemsOf(w, 'seq')[0]);
        deliver(w, `si${i}`, 'seq');
        mkItem(w, `wi${i}`, needItemsOf(w, 'wtd')[0]);
        deliver(w, `wi${i}`, 'wtd');
      }
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });

  it('撞环回归：order-fulfill 与 merge-on-place/merge-proximity-clear 等 game101 代表性能力同装不成环·可 tick', async () => {
    const { mergeOnPlaceCapability } = await import('./merge-on-place.js');
    const { mergeProximityClearCapability } = await import('./merge-proximity-clear.js');
    const w = new World();
    for (const sys of orderFulfillCapability.systems) w.addSystem(sys);
    for (const sys of mergeOnPlaceCapability.systems) w.addSystem(sys);
    for (const sys of mergeProximityClearCapability.systems) w.addSystem(sys);
    expect(() => w.tick()).not.toThrow();
  });

  it('撞环回归：order-fulfill 新增读写世界 RandomSeed 后·与同样吃 RandomSeed 的 effect-apply/weighted-spawn 同装（game101 实际蓝图组合）仍不成环·可 tick', async () => {
    const { effectApplyCapability } = await import('./effect-apply.js');
    const { weightedSpawnCapability } = await import('./weighted-spawn.js');
    const w = new World();
    for (const sys of orderFulfillCapability.systems) w.addSystem(sys);
    for (const sys of effectApplyCapability.systems) w.addSystem(sys);
    for (const sys of weightedSpawnCapability.systems) w.addSystem(sys);
    mkSeed(w, 'rng', 1);
    mkRes(w, 'coins');
    mkOrder(w, 'ord', {
      needItems: ['a'], reward: [{ resourceId: 'coins', amount: 1 }], rotateMode: 'weighted',
      pool: [{ needItems: ['b'], reward: [], weight: 1 }],
    });
    mkItem(w, 'i1', 'a');
    deliver(w, 'i1', 'ord'); // 内部已 tick 一次（order-fulfill 消费 RandomSeed）
    expect(() => w.tick()).not.toThrow();
    expect(needItemsOf(w, 'ord')).toEqual(['b']); // 轮换仍照常生效（未被同装的 effect-apply/weighted-spawn 打断）
  });
});
