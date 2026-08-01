import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { groupCountCapability } from './group-count.js';
import { eventWhenCapability } from './event-when.js';
import { effectApplyCapability } from './effect-apply.js';
import type { Resource, Tag, GroupCount, EventWhen, Effect, Flag } from '@engine/protocol/components.js';

// group-count（REQ-022）：按 Tag 掩码数全场实体 → 写数值 Resource。
// 自走棋羁绊/波次清场/人口的「集合计数」端；阈值信号 = event-when(edge) 重组（本文件含重组证明）。

const WARRIOR = 1 << 0;
const MAGE = 1 << 1;
const P1 = 1 << 4;

function addSystems(w: World, ...caps: Array<typeof groupCountCapability>): void {
  for (const cap of caps) for (const s of cap.systems) w.addSystem(s);
}

function unit(w: World, id: string, flags: number): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Tag', flags } as Tag);
}

function counter(w: World, id: string, countResource: string, requiredTag?: number, max = 99): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'GroupCount', countResource, requiredTag } as GroupCount);
  w.addComponent(id, { type: 'Resource', id: countResource, current: 0, min: 0, max } as Resource);
}

const res = (w: World, eid: string): number => w.getComponent<Resource>(eid, 'Resource')!.current;

describe('group-count —— 集合计数→数值资源（REQ-022）', () => {
  it('按单 bit 计数，set 语义（多 tick 不累加）', () => {
    const w = new World();
    addSystems(w, groupCountCapability);
    counter(w, 'gc', 'warrior_count', WARRIOR);
    unit(w, 'u1', WARRIOR);
    unit(w, 'u2', WARRIOR | P1);
    unit(w, 'u3', MAGE);
    w.tick();
    expect(res(w, 'gc')).toBe(2);
    w.tick(); // set 而非 add：再跑一拍仍是 2
    expect(res(w, 'gc')).toBe(2);
  });

  it('多 bit「含齐」交集语义：P1 的战士（owner=再加一个 bit，无需 owner 字段）', () => {
    const w = new World();
    addSystems(w, groupCountCapability);
    counter(w, 'gc', 'p1_warriors', P1 | WARRIOR);
    unit(w, 'u1', WARRIOR); // 无主战士 → 不算
    unit(w, 'u2', P1 | WARRIOR); // 算
    unit(w, 'u3', P1 | MAGE); // P1 法师 → 不算
    w.tick();
    expect(res(w, 'gc')).toBe(1);
  });

  it('REQ-F-052 onBoard 上板过滤：true=只数带 HexPos 者、false=只数不带者、缺省=不过滤（席/板分账）', () => {
    const w = new World();
    addSystems(w, groupCountCapability);
    counter(w, 'gc_board', 'on_board', WARRIOR);
    w.getComponent<GroupCount>('gc_board', 'GroupCount')!.onBoard = true;
    counter(w, 'gc_bench', 'on_bench', WARRIOR);
    w.getComponent<GroupCount>('gc_bench', 'GroupCount')!.onBoard = false;
    counter(w, 'gc_all', 'all_w', WARRIOR);
    unit(w, 'u1', WARRIOR); // 在席（无 HexPos）
    unit(w, 'u2', WARRIOR); // 在板
    w.addComponent('u2', { type: 'HexPos', q: 3, r: 2 } as unknown as Tag);
    unit(w, 'u3', WARRIOR); // 在板
    w.addComponent('u3', { type: 'HexPos', q: 4, r: 2 } as unknown as Tag);
    unit(w, 'u4', MAGE); // 在板但非战士 → 谁都不算
    w.addComponent('u4', { type: 'HexPos', q: 5, r: 2 } as unknown as Tag);
    w.tick();
    expect(res(w, 'gc_board')).toBe(2);
    expect(res(w, 'gc_bench')).toBe(1);
    expect(res(w, 'gc_all')).toBe(3);
  });

  it('缺省掩码（不填）= 数所有带 Tag 实体；钳进 Resource.max', () => {
    const w = new World();
    addSystems(w, groupCountCapability);
    counter(w, 'gc', 'population', undefined, 3); // max=3
    for (let i = 0; i < 5; i++) unit(w, `u${i}`, i % 2 ? WARRIOR : MAGE);
    w.tick();
    expect(res(w, 'gc')).toBe(3); // 真值 5，被钳到 max=3
  });

  it('动态跟踪：实体销毁/新增后计数随之更新（波次清场）', () => {
    const w = new World();
    addSystems(w, groupCountCapability);
    counter(w, 'gc', 'enemies_alive', MAGE);
    unit(w, 'e1', MAGE);
    unit(w, 'e2', MAGE);
    w.tick();
    expect(res(w, 'gc')).toBe(2);
    w.destroyEntity('e1');
    w.tick();
    expect(res(w, 'gc')).toBe(1);
    w.destroyEntity('e2');
    w.tick();
    expect(res(w, 'gc')).toBe(0); // → event-when(lte 0) 即 wave_clear
    unit(w, 'e3', MAGE);
    w.tick();
    expect(res(w, 'gc')).toBe(1);
  });

  it('目标 Resource 不存在 → 不抛、不动（容错与 effect-apply 一致）', () => {
    const w = new World();
    addSystems(w, groupCountCapability);
    w.createEntity('gc');
    w.addComponent('gc', { type: 'GroupCount', countResource: 'nope', requiredTag: WARRIOR } as GroupCount);
    unit(w, 'u1', WARRIOR);
    expect(() => w.tick()).not.toThrow();
  });

  it('多 counter 共享一次遍历，各算各的', () => {
    const w = new World();
    addSystems(w, groupCountCapability);
    counter(w, 'gcW', 'warriors', WARRIOR);
    counter(w, 'gcM', 'mages', MAGE);
    unit(w, 'u1', WARRIOR);
    unit(w, 'u2', WARRIOR);
    unit(w, 'u3', MAGE);
    w.tick();
    expect(res(w, 'gcW')).toBe(2);
    expect(res(w, 'gcM')).toBe(1);
  });

  // ── 重组证明（REQ-022 裁剪依据）：原案 thresholds:[{at,signal}] 的「越阈值锁存发信号」
  // = group-count(数值) + event-when{resource gte, mode:'edge'}(迟滞) + effect-apply，纯数据装配，零新代码。──
  it('羁绊阈值信号 = event-when(edge) 重组：跨 3 触发一次，跌破复位后可再触发', () => {
    const w = new World();
    addSystems(w, groupCountCapability, eventWhenCapability, effectApplyCapability);
    counter(w, 'gc', 'warrior_count', WARRIOR);

    // 信号→记一笔（procs 资源数触发次数）；同 tick：count → event-when → effect-apply(Commit)。
    w.createEntity('synergy');
    w.addComponent('synergy', {
      type: 'EventWhen',
      signal: 'synergy_warrior',
      when: { kind: 'resource', id: 'warrior_count', cmp: 'gte', value: 3 },
      mode: 'edge',
      armed: false,
    } as EventWhen);
    w.addComponent('synergy', { type: 'Effect', onSignal: 'synergy_warrior', kind: 'modify-resource', targetId: 'procs', value: 1 } as Effect);
    w.createEntity('stats');
    w.addComponent('stats', { type: 'Resource', id: 'procs', current: 0, min: 0, max: 99 } as Resource);

    unit(w, 'u1', WARRIOR);
    unit(w, 'u2', WARRIOR);
    w.tick();
    expect(res(w, 'stats')).toBe(0); // 2 < 3：未触发

    unit(w, 'u3', WARRIOR);
    w.tick();
    expect(res(w, 'stats')).toBe(1); // 跨线：edge 触发一次
    w.tick();
    w.tick();
    expect(res(w, 'stats')).toBe(1); // 仍 ≥3：迟滞不重复触发（armed）

    w.destroyEntity('u3');
    w.tick();
    expect(res(w, 'stats')).toBe(1); // 跌破：复位不触发

    unit(w, 'u4', WARRIOR);
    w.tick();
    expect(res(w, 'stats')).toBe(2); // 再跨线：再触发一次
  });

  it('确定性：实体创建序相反，计数结果一致', () => {
    const build = (reverse: boolean): number => {
      const w = new World();
      addSystems(w, groupCountCapability);
      counter(w, 'gc', 'c', WARRIOR);
      const ids = ['a', 'b', 'c', 'd'];
      for (const id of reverse ? [...ids].reverse() : ids) unit(w, id, WARRIOR);
      w.tick();
      return res(w, 'gc');
    };
    expect(build(false)).toBe(build(true));
  });

  it('能力元数据：provides 与 id 符合注册约定', () => {
    expect(groupCountCapability.id).toBe('t2-group-count');
    expect(Object.keys(groupCountCapability.components.provides)).toContain('GroupCount');
  });
});
