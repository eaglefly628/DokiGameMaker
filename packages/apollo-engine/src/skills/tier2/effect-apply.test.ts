import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Effect, Signal, Flag, Resource, State, EventWhen, Sensor, Visibility, DestroyRequest, Tag, RandomSeed } from '@engine/protocol/components.js';
import { effectApplyCapability } from './effect-apply.js';
import { eventWhenCapability } from './event-when.js';

function worldWithEffect(): World {
  const w = new World();
  for (const s of effectApplyCapability.systems) w.addSystem(s);
  return w;
}
function signal(w: World, name: string): void {
  const e = `sig:${name}`;
  w.createEntity(e);
  w.addComponent(e, { type: 'Signal', name, source: 'test' } as Signal);
}
function effect(w: World, eid: string, ef: Omit<Effect, 'type'>): void {
  w.createEntity(eid);
  w.addComponent(eid, { type: 'Effect', ...ef } as Effect);
}

describe('T2 effect-apply — metadata', () => {
  it('id / 读 Effect+Signal / 写 Flag+Resource+State', () => {
    expect(effectApplyCapability.id).toBe('t2-effect-apply');
    expect(effectApplyCapability.components.reads).toEqual(['Effect', 'Signal', 'Timer', 'Tag', 'PrefabOrigin', 'RandomSeed']); // Tag：F-032 清场寻址；PrefabOrigin：F-048① keepResource；RandomSeed：E-023② 概率门
    expect(effectApplyCapability.components.writes).toEqual(['Flag', 'Resource', 'State', 'Sensor', 'Visibility', 'DestroyRequest', 'Timer', 'RandomSeed']);
  });
});

describe('T2 effect-apply — 三种效果（信号在场才施加，按 id 全局定位）', () => {
  it('set-flag：把目标 Flag.active 设为布尔值', () => {
    const w = worldWithEffect();
    w.createEntity('gs');
    w.addComponent('gs', { type: 'Flag', id: 'confess', active: false } as Flag);
    effect(w, 'ef', { onSignal: 'love60', kind: 'set-flag', targetId: 'confess', value: true });
    signal(w, 'love60');
    w.tick();
    expect(w.getComponent<Flag>('gs', 'Flag')!.active).toBe(true);
  });

  it('modify-resource：按 id 全局加值并钳上下限', () => {
    const w = worldWithEffect();
    w.createEntity('gs');
    w.addComponent('gs', { type: 'Resource', id: 'hp', current: 5, min: 0, max: 100 } as Resource);
    effect(w, 'ef', { onSignal: 'trap', kind: 'modify-resource', targetId: 'hp', value: -10 });
    signal(w, 'trap');
    w.tick();
    expect(w.getComponent<Resource>('gs', 'Resource')!.current).toBe(0); // 5-10 钳到 min
  });

  it('set-state：设目标状态机 current', () => {
    const w = worldWithEffect();
    w.createEntity('gs');
    w.addComponent('gs', { type: 'State', fsmId: 'story', current: 'daily', previous: '' } as State);
    effect(w, 'ef', { onSignal: 'both_switches', kind: 'set-state', targetId: 'story', value: 'door_open' });
    signal(w, 'both_switches');
    w.tick();
    expect(w.getComponent<State>('gs', 'State')!.current).toBe('door_open');
  });

  it('set-flag 值为字符串 "false" → 关掉(防 Boolean("false")===true 陷阱, Reviewer Bug1)', () => {
    const w = worldWithEffect();
    w.createEntity('gs');
    w.addComponent('gs', { type: 'Flag', id: 'door', active: true } as Flag);
    effect(w, 'ef', { onSignal: 'close', kind: 'set-flag', targetId: 'door', value: 'false' });
    signal(w, 'close');
    w.tick();
    expect(w.getComponent<Flag>('gs', 'Flag')!.active).toBe(false);
  });

  it('信号不在场 → 不施加', () => {
    const w = worldWithEffect();
    w.createEntity('gs');
    w.addComponent('gs', { type: 'Flag', id: 'confess', active: false } as Flag);
    effect(w, 'ef', { onSignal: 'love60', kind: 'set-flag', targetId: 'confess', value: true });
    w.tick(); // 无信号
    expect(w.getComponent<Flag>('gs', 'Flag')!.active).toBe(false);
  });
});

describe('T2 effect-apply — 与 event-when 合链（Condition→Event→Effect 同 tick）', () => {
  it('好感越 60 → 信号 → 同 tick 置 flag（event-when=Update 先于 effect-apply=Commit）', () => {
    const w = new World();
    for (const s of eventWhenCapability.systems) w.addSystem(s);
    for (const s of effectApplyCapability.systems) w.addSystem(s);

    w.createEntity('gs');
    w.addComponent('gs', { type: 'Resource', id: 'affection_S', current: 65, min: 0, max: 100 } as Resource);
    w.addComponent('gs', { type: 'Flag', id: 'S_confess', active: false } as Flag);
    w.createEntity('ew');
    w.addComponent('ew', { type: 'EventWhen', signal: 'S_love_60', when: { kind: 'resource', id: 'affection_S', cmp: 'gte', value: 60 }, mode: 'edge', armed: false } as EventWhen);
    effect(w, 'ef', { onSignal: 'S_love_60', kind: 'set-flag', targetId: 'S_confess', value: true });

    w.tick();
    expect(w.getComponent<Flag>('gs', 'Flag')!.active).toBe(true);
  });
});

describe('T2 effect-apply — modify-resource 运算 op + 结算顺序 order（REQ-012）', () => {
  function worldWithRes(id: string, current: number, max = 1000): World {
    const w = worldWithEffect();
    w.createEntity('gs');
    w.addComponent('gs', { type: 'Resource', id, current, min: 0, max } as Resource);
    return w;
  }
  const res = (w: World, id = 'r') => w.getComponent<Resource>('gs', 'Resource')!.current;

  it("op:'mul' → current × value（×倍率，Balatro mult）", () => {
    const w = worldWithRes('mult', 4);
    effect(w, 'ef', { onSignal: 'score', kind: 'modify-resource', targetId: 'mult', op: 'mul', value: 1.5 });
    signal(w, 'score');
    w.tick();
    expect(res(w)).toBe(6); // 4 × 1.5
  });

  it("op:'set' → current = value（无视原值）", () => {
    const w = worldWithRes('chips', 5);
    effect(w, 'ef', { onSignal: 'reset', kind: 'modify-resource', targetId: 'chips', op: 'set', value: 20 });
    signal(w, 'reset');
    w.tick();
    expect(res(w)).toBe(20);
  });

  it("op:'add' 显式 → 与缺省一致（current + value）", () => {
    const w = worldWithRes('chips', 5);
    effect(w, 'ef', { onSignal: 'gain', kind: 'modify-resource', targetId: 'chips', op: 'add', value: 7 });
    signal(w, 'gain');
    w.tick();
    expect(res(w)).toBe(12);
  });

  it('order 升序结算：先 + 后 ×（order 1 加、order 2 乘）→ (10+5)×2 = 30', () => {
    const w = worldWithRes('score', 10);
    effect(w, 'ef_add', { onSignal: 'score', kind: 'modify-resource', targetId: 'score', op: 'add', value: 5, order: 1 });
    effect(w, 'ef_mul', { onSignal: 'score', kind: 'modify-resource', targetId: 'score', op: 'mul', value: 2, order: 2 });
    signal(w, 'score');
    w.tick();
    expect(res(w)).toBe(30); // (10+5)*2
  });

  it('order 升序结算：先 × 后 +（order 1 乘、order 2 加）→ (10×2)+5 = 25 ≠ 30（顺序敏感）', () => {
    const w = worldWithRes('score', 10);
    effect(w, 'ef_mul', { onSignal: 'score', kind: 'modify-resource', targetId: 'score', op: 'mul', value: 2, order: 1 });
    effect(w, 'ef_add', { onSignal: 'score', kind: 'modify-resource', targetId: 'score', op: 'add', value: 5, order: 2 });
    signal(w, 'score');
    w.tick();
    expect(res(w)).toBe(25); // (10*2)+5 —— 与「先+后×」的 30 不同，证明 order 决定结果
  });

  it('order 并列 → 按 eid 字典序 tie-break（确定性，无关插入/查询顺序）', () => {
    // 两个 add 同 order，结果与顺序无关（加法可交换）；此测确认不抛错且确定结算两者。
    const w = worldWithRes('score', 0);
    effect(w, 'ef_b', { onSignal: 'score', kind: 'modify-resource', targetId: 'score', op: 'add', value: 3, order: 0 });
    effect(w, 'ef_a', { onSignal: 'score', kind: 'modify-resource', targetId: 'score', op: 'add', value: 4, order: 0 });
    signal(w, 'score');
    w.tick();
    expect(res(w)).toBe(7); // 3+4，两者都结算
  });

  it('mul 结果照样钳上下限（current × value 超 max → 钳到 max）', () => {
    const w = worldWithRes('mult', 60, /*max*/ 100);
    effect(w, 'ef', { onSignal: 'score', kind: 'modify-resource', targetId: 'mult', op: 'mul', value: 3, order: 0 });
    signal(w, 'score');
    w.tick();
    expect(res(w)).toBe(100); // 60*3=180 钳到 max
  });

  it('回归：老数据（无 op/order）行为不变 —— 仍按 add 结算', () => {
    const w = worldWithRes('hp', 5, /*max*/ 100);
    effect(w, 'ef', { onSignal: 'heal', kind: 'modify-resource', targetId: 'hp', value: 10 });
    signal(w, 'heal');
    w.tick();
    expect(res(w)).toBe(15); // 5+10，无 op 即 add
  });
});

describe('T2 effect-apply — modify-resource 动态值 valueFrom（REQ-013）', () => {
  function w0(resources: Array<{ id: string; current: number; max?: number }>): World {
    const w = worldWithEffect();
    for (const r of resources) {
      const e = `res:${r.id}`;
      w.createEntity(e);
      w.addComponent(e, { type: 'Resource', id: r.id, current: r.current, min: 0, max: r.max ?? 1e12 } as Resource);
    }
    return w;
  }
  const cur = (w: World, id: string): number => w.getComponent<Resource>(`res:${id}`, 'Resource')!.current;

  it('两资源相乘 score += chips × mult（timesResourceId）—— Balatro 最终计分', () => {
    const w = w0([{ id: 'chips', current: 15 }, { id: 'mult', current: 3 }, { id: 'score', current: 0 }]);
    effect(w, 'ef', { onSignal: 'commit', kind: 'modify-resource', targetId: 'score', op: 'add', value: 0, valueFrom: { resourceId: 'chips', timesResourceId: 'mult' } });
    signal(w, 'commit');
    w.tick();
    expect(cur(w, 'score')).toBe(45); // 0 + 15×3
  });

  it('系数 × 资源 chips += 2 × money（coeff）—— Bull 每 $1 +2c', () => {
    const w = w0([{ id: 'money', current: 7 }, { id: 'chips', current: 10 }]);
    effect(w, 'ef', { onSignal: 'score', kind: 'modify-resource', targetId: 'chips', op: 'add', value: 0, valueFrom: { resourceId: 'money', coeff: 2 } });
    signal(w, 'score');
    w.tick();
    expect(cur(w, 'chips')).toBe(24); // 10 + 7×2
  });

  it('op:set + valueFrom：score = chips × mult（覆盖原值）', () => {
    const w = w0([{ id: 'chips', current: 10 }, { id: 'mult', current: 4 }, { id: 'score', current: 99 }]);
    effect(w, 'ef', { onSignal: 'commit', kind: 'modify-resource', targetId: 'score', op: 'set', value: 0, valueFrom: { resourceId: 'chips', timesResourceId: 'mult' } });
    signal(w, 'commit');
    w.tick();
    expect(cur(w, 'score')).toBe(40);
  });

  it('有序链：order1 +mult 后 order2 提交 score=chips×mult（commit 读到改后 mult）', () => {
    const w = w0([{ id: 'chips', current: 10 }, { id: 'mult', current: 2 }, { id: 'score', current: 0 }]);
    effect(w, 'ef_join', { onSignal: 'score', kind: 'modify-resource', targetId: 'mult', op: 'add', value: 3, order: 1 }); // mult 2→5
    effect(w, 'ef_commit', { onSignal: 'score', kind: 'modify-resource', targetId: 'score', op: 'add', value: 0, valueFrom: { resourceId: 'chips', timesResourceId: 'mult' }, order: 2 });
    signal(w, 'score');
    w.tick();
    expect(cur(w, 'mult')).toBe(5);
    expect(cur(w, 'score')).toBe(50); // 10 × (2+3)，证明 commit 读的是 join 之后的 mult
  });

  it('动态值照样钳上下限', () => {
    const w = w0([{ id: 'chips', current: 100 }, { id: 'mult', current: 100 }, { id: 'score', current: 0, max: 5000 }]);
    effect(w, 'ef', { onSignal: 'commit', kind: 'modify-resource', targetId: 'score', op: 'add', value: 0, valueFrom: { resourceId: 'chips', timesResourceId: 'mult' } });
    signal(w, 'commit');
    w.tick();
    expect(cur(w, 'score')).toBe(5000); // 10000 钳到 max
  });

  it('valueFrom 资源缺失 → 取 0（无效不动）', () => {
    const w = w0([{ id: 'chips', current: 10 }]);
    effect(w, 'ef', { onSignal: 'score', kind: 'modify-resource', targetId: 'chips', op: 'add', value: 0, valueFrom: { resourceId: 'ghost', coeff: 5 } });
    signal(w, 'score');
    w.tick();
    expect(cur(w, 'chips')).toBe(10); // +（0×5）
  });

  it('回归：无 valueFrom 仍用静态 value', () => {
    const w = w0([{ id: 'hp', current: 5 }]);
    effect(w, 'ef', { onSignal: 'heal', kind: 'modify-resource', targetId: 'hp', value: 10 });
    signal(w, 'heal');
    w.tick();
    expect(cur(w, 'hp')).toBe(15);
  });
});

describe('T2 effect-apply — valueFrom.countOf 按 Tag 掩码数实体（REQ-E-023①）', () => {
  const setup = (resCurrent: number): World => {
    const w = worldWithEffect();
    w.createEntity('res');
    w.addComponent('res', { type: 'Resource', id: 'mult', current: resCurrent, min: 0, max: 1e9 } as Resource);
    return w;
  };
  const tag = (w: World, id: string, flags: number): void => { w.createEntity(id); w.addComponent(id, { type: 'Tag', flags } as Tag); };
  const mult = (w: World): number => w.getComponent<Resource>('res', 'Resource')!.current;

  it('op:add：每个命中掩码的实体 ×coeff（abstract「每小丑 +3 倍」）', () => {
    const w = setup(0);
    tag(w, 'j1', 4); tag(w, 'j2', 4); tag(w, 'j3', 4); // 3 个小丑（掩码 4）
    tag(w, 'card', 1); // 别的 tag 不计
    effect(w, 'ef', { onSignal: 'score', kind: 'modify-resource', targetId: 'mult', op: 'add', value: 0, valueFrom: { countOf: 4, coeff: 3 } });
    signal(w, 'score'); w.tick();
    expect(mult(w)).toBe(9); // 3 个 ×3
  });

  it('op:mul：×(count×coeff)（stencil 类「每个 ×」）', () => {
    const w = setup(5);
    tag(w, 'a', 2); tag(w, 'b', 2); // count=2
    effect(w, 'ef', { onSignal: 'score', kind: 'modify-resource', targetId: 'mult', op: 'mul', value: 0, valueFrom: { countOf: 2, coeff: 1 } });
    signal(w, 'score'); w.tick();
    expect(mult(w)).toBe(10); // 5 × (2×1)
  });

  it('无命中实体 → count 0（add 不动）', () => {
    const w = setup(7);
    tag(w, 'x', 1); // 掩码 4 不命中
    effect(w, 'ef', { onSignal: 'score', kind: 'modify-resource', targetId: 'mult', op: 'add', value: 0, valueFrom: { countOf: 4, coeff: 3 } });
    signal(w, 'score'); w.tick();
    expect(mult(w)).toBe(7); // +0
  });
});

describe('T2 effect-apply — chance 概率门（REQ-E-023②，确定性种子 PRNG）', () => {
  const seeded = (cur: number): World => {
    const w = worldWithEffect();
    w.createEntity('gs'); w.addComponent('gs', { type: 'Resource', id: 'hp', current: cur, min: 0, max: 100 } as Resource);
    w.createEntity('rng'); w.addComponent('rng', { type: 'RandomSeed', seed: 12345, sequence: 0 } as RandomSeed);
    return w;
  };
  const hp = (w: World): number => w.getComponent<Resource>('gs', 'Resource')!.current;

  it('chance 1/1 → 必中（施用）', () => {
    const w = seeded(5);
    effect(w, 'ef', { onSignal: 'hit', kind: 'modify-resource', targetId: 'hp', value: 10, chance: { num: 1, den: 1 } });
    signal(w, 'hit'); w.tick();
    expect(hp(w)).toBe(15);
  });
  it('chance 0/1 → 必不中（跳过）', () => {
    const w = seeded(5);
    effect(w, 'ef', { onSignal: 'hit', kind: 'modify-resource', targetId: 'hp', value: 10, chance: { num: 0, den: 1 } });
    signal(w, 'hit'); w.tick();
    expect(hp(w)).toBe(5);
  });
  it('无 RandomSeed + chance → fail-closed（不施用）', () => {
    const w = worldWithEffect();
    w.createEntity('gs'); w.addComponent('gs', { type: 'Resource', id: 'hp', current: 5, min: 0, max: 100 } as Resource);
    effect(w, 'ef', { onSignal: 'hit', kind: 'modify-resource', targetId: 'hp', value: 10, chance: { num: 1, den: 1 } });
    signal(w, 'hit'); w.tick();
    expect(hp(w)).toBe(5);
  });
});

describe('T2 effect-apply — 物理 kind（REQ-008：信号→物理改动，按 targetEntity）', () => {
  it('set-sensor true → 目标实体加 Sensor（踩开关 → 墙变可穿过）', () => {
    const w = worldWithEffect();
    w.createEntity('wall');
    effect(w, 'ef', { onSignal: 'plate_on', kind: 'set-sensor', targetId: '', targetEntity: 'wall', value: true });
    signal(w, 'plate_on');
    w.tick();
    expect(w.hasComponent('wall', 'Sensor')).toBe(true);
  });

  it('set-sensor false → 去掉 Sensor（墙恢复实心）', () => {
    const w = worldWithEffect();
    w.createEntity('wall');
    w.addComponent('wall', { type: 'Sensor' } as Sensor);
    effect(w, 'ef', { onSignal: 'plate_off', kind: 'set-sensor', targetId: '', targetEntity: 'wall', value: false });
    signal(w, 'plate_off');
    w.tick();
    expect(w.hasComponent('wall', 'Sensor')).toBe(false);
  });

  it('set-visible false → 切目标 Visibility.visible（门消失）', () => {
    const w = worldWithEffect();
    w.createEntity('door');
    w.addComponent('door', { type: 'Visibility', visible: true, active: true } as Visibility);
    effect(w, 'ef', { onSignal: 'open', kind: 'set-visible', targetId: '', targetEntity: 'door', value: false });
    signal(w, 'open');
    w.tick();
    expect(w.getComponent<Visibility>('door', 'Visibility')!.visible).toBe(false);
  });

  it('set-visible-tagged（REQ-F-056）：Tag 掩码命中者批量切 Visibility；只触有 Visibility 者；缺省不命中不动', () => {
    const w = worldWithEffect();
    const TOKEN = 1 << 3;
    // 三个带 token tag：a/b 有 Visibility，c 无 Visibility（不应被凭空 add）
    w.createEntity('a'); w.addComponent('a', { type: 'Tag', flags: TOKEN } as never); w.addComponent('a', { type: 'Visibility', visible: true, active: true } as Visibility);
    w.createEntity('b'); w.addComponent('b', { type: 'Tag', flags: TOKEN } as never); w.addComponent('b', { type: 'Visibility', visible: true, active: true } as Visibility);
    w.createEntity('c'); w.addComponent('c', { type: 'Tag', flags: TOKEN } as never);
    w.createEntity('d'); w.addComponent('d', { type: 'Tag', flags: 1 << 4 } as never); w.addComponent('d', { type: 'Visibility', visible: true, active: true } as Visibility); // 别的 tag
    effect(w, 'ef', { onSignal: 'hide', kind: 'set-visible-tagged', targetId: '', tagMask: TOKEN, value: false });
    signal(w, 'hide');
    w.tick();
    expect(w.getComponent<Visibility>('a', 'Visibility')!.visible).toBe(false); // 命中
    expect(w.getComponent<Visibility>('b', 'Visibility')!.visible).toBe(false); // 命中
    expect(w.hasComponent('c', 'Visibility')).toBe(false); // 无 Visibility 不凭空 add
    expect(w.getComponent<Visibility>('d', 'Visibility')!.visible).toBe(true); // 别的 tag 不动
  });

  it('set-flag-tagged（REQ-ORDERROT 姊妹条）：Tag 掩码命中 + Flag.id===targetId 者批量置 active；用例=过阈值解锁东区 webbed', () => {
    const w = worldWithEffect();
    const ZONE_EAST = 1 << 5;
    // a/b 在东区且挂 webbed flag（应被清）；c 在东区但挂的是别的 flag id（不该被碰，需指名 targetId）；
    // d 挂 webbed 但不在东区（掩码不命中，不该被碰）。
    w.createEntity('a'); w.addComponent('a', { type: 'Tag', flags: ZONE_EAST } as Tag); w.addComponent('a', { type: 'Flag', id: 'webbed', active: true } as Flag);
    w.createEntity('b'); w.addComponent('b', { type: 'Tag', flags: ZONE_EAST } as Tag); w.addComponent('b', { type: 'Flag', id: 'webbed', active: true } as Flag);
    w.createEntity('c'); w.addComponent('c', { type: 'Tag', flags: ZONE_EAST } as Tag); w.addComponent('c', { type: 'Flag', id: 'locked', active: true } as Flag);
    w.createEntity('d'); w.addComponent('d', { type: 'Tag', flags: 1 << 6 } as Tag); w.addComponent('d', { type: 'Flag', id: 'webbed', active: true } as Flag);
    effect(w, 'ef', { onSignal: 'S_progress_50', kind: 'set-flag-tagged', tagMask: ZONE_EAST, targetId: 'webbed', value: false });
    signal(w, 'S_progress_50');
    w.tick();
    expect(w.getComponent<Flag>('a', 'Flag')!.active).toBe(false); // 命中掩码 + id 匹配
    expect(w.getComponent<Flag>('b', 'Flag')!.active).toBe(false); // 命中掩码 + id 匹配
    expect(w.getComponent<Flag>('c', 'Flag')!.active).toBe(true); // 命中掩码但 flag id 不匹配 → 不动
    expect(w.getComponent<Flag>('d', 'Flag')!.active).toBe(true); // id 匹配但掩码不命中 → 不动
  });

  it('set-flag-tagged：命中掩码但无 Flag 组件的实体不受影响（不凭空 add，同 set-visible-tagged 纪律）', () => {
    const w = worldWithEffect();
    const MASK = 1 << 2;
    w.createEntity('nof'); w.addComponent('nof', { type: 'Tag', flags: MASK } as Tag); // 无 Flag
    effect(w, 'ef', { onSignal: 'x', kind: 'set-flag-tagged', tagMask: MASK, targetId: 'webbed', value: true });
    signal(w, 'x');
    expect(() => w.tick()).not.toThrow();
    expect(w.hasComponent('nof', 'Flag')).toBe(false);
  });

  it('set-flag-tagged：信号不在场 → 不施加', () => {
    const w = worldWithEffect();
    const MASK = 1 << 2;
    w.createEntity('a'); w.addComponent('a', { type: 'Tag', flags: MASK } as Tag); w.addComponent('a', { type: 'Flag', id: 'webbed', active: true } as Flag);
    effect(w, 'ef', { onSignal: 'never', kind: 'set-flag-tagged', tagMask: MASK, targetId: 'webbed', value: false });
    w.tick(); // 无信号
    expect(w.getComponent<Flag>('a', 'Flag')!.active).toBe(true);
  });

  it('destroy → 在目标实体发 DestroyRequest（清障碍，destroy-apply 随后移除）', () => {
    const w = worldWithEffect();
    w.createEntity('rock');
    effect(w, 'ef', { onSignal: 'boom', kind: 'destroy', targetId: '', targetEntity: 'rock', value: true });
    signal(w, 'boom');
    w.tick();
    expect(w.getComponent<DestroyRequest>('rock', 'DestroyRequest')?.entityId).toBe('rock');
  });

  it('信号不在场 → 物理改动也不施加', () => {
    const w = worldWithEffect();
    w.createEntity('wall');
    effect(w, 'ef', { onSignal: 'plate_on', kind: 'set-sensor', targetId: '', targetEntity: 'wall', value: true });
    w.tick(); // 无信号
    expect(w.hasComponent('wall', 'Sensor')).toBe(false);
  });
});

// ── REQ-009：reset-timer（事件→重置/启动计时器，限时机制前置）──
import type { Timer } from '@engine/protocol/components.js';
describe('T2 effect-apply — reset-timer（REQ-009）', () => {
  function timer(w: World, eid: string, t: Omit<Timer, 'type'>): void {
    w.createEntity(eid);
    w.addComponent(eid, { type: 'Timer', ...t } as Timer);
  }
  const T = (w: World, eid: string) => w.getComponent<Timer>(eid, 'Timer')!;

  it('信号在场 → 目标 Timer.elapsed 归零（从此刻重新计时）', () => {
    const w = worldWithEffect();
    timer(w, 'door_timer', { id: 'dt', elapsed: 50, duration: 60, loop: false });
    signal(w, 'plate');
    effect(w, 'e', { onSignal: 'plate', kind: 'reset-timer', targetId: '', targetEntity: 'door_timer', value: 0 });
    w.tick();
    expect(T(w, 'door_timer').elapsed).toBe(0);
    expect(T(w, 'door_timer').duration).toBe(60); // value≤0 → duration 不变（只重置 elapsed）
  });

  it('value 给数值 → 一并设 duration（启动一个 N 拍倒计时）', () => {
    const w = worldWithEffect();
    timer(w, 'door_timer', { id: 'dt', elapsed: 99, duration: 30, loop: false });
    signal(w, 'plate');
    effect(w, 'e', { onSignal: 'plate', kind: 'reset-timer', targetId: '', targetEntity: 'door_timer', value: 120 });
    w.tick();
    expect(T(w, 'door_timer').elapsed).toBe(0);
    expect(T(w, 'door_timer').duration).toBe(120);
  });

  it('信号不在场 → Timer 不动', () => {
    const w = worldWithEffect();
    timer(w, 'door_timer', { id: 'dt', elapsed: 50, duration: 60, loop: false });
    signal(w, 'other');
    effect(w, 'e', { onSignal: 'plate', kind: 'reset-timer', targetId: '', targetEntity: 'door_timer', value: 120 });
    w.tick();
    expect(T(w, 'door_timer').elapsed).toBe(50); // 未触发
    expect(T(w, 'door_timer').duration).toBe(60);
  });
});

// ── REQ-F-041(B)：targetEntity='@signal-source' 哨兵寻址（点谁卖谁/点谁选谁） ──
import { World as W41 } from '@engine/core/world.js';
import type { Signal as Sig41, Effect as Ef41 } from '@engine/protocol/components.js';
import { destroyCapability as destroy41 } from '@atom-skills/destroy/index.js';
describe('effect-apply · REQ-F-041 @signal-source 寻址', () => {
  const mk41 = (): W41 => {
    const w = new W41();
    for (const s of effectApplyCapability.systems) w.addSystem(s);
    for (const s of destroy41.systems) w.addSystem(s);
    w.createEntity('fx');
    w.addComponent('fx', { type: 'Effect', onSignal: 'sell', kind: 'destroy', targetId: '', targetEntity: '@signal-source', value: 0 } as Ef41);
    return w;
  };
  const click = (w: W41, eid: string) => w.addComponent(eid, { type: 'Signal', name: 'sell', source: eid } as Sig41);
  const alive41 = (w: W41, id: string) => w.getAllEntities().includes(id);

  it('点谁卖谁：destroy 作用于信号源实体（运行时实例 id 无需写进数据）', () => {
    const w = mk41();
    w.createEntity('seat#7'); // 模拟运行时席位实例
    w.createEntity('seat#8');
    click(w, 'seat#7');
    w.tick(); // Commit 写 DestroyRequest（信号被 event-when 域外手注，自行清理）
    w.getComponent<Sig41>('seat#7', 'Signal') && w.removeComponent('seat#7', 'Signal');
    w.tick(); // destroy-apply 消费
    expect(alive41(w, 'seat#7')).toBe(false); // 点的没了
    expect(alive41(w, 'seat#8')).toBe(true); // 没点的还在
  });

  it('同拍点两个 → 双源各自生效；静态 targetEntity 行为不变（回归）', () => {
    const w = mk41();
    w.createEntity('a'); w.createEntity('b'); w.createEntity('wall');
    w.createEntity('fx2');
    w.addComponent('fx2', { type: 'Effect', onSignal: 'sell', kind: 'destroy', targetId: '', targetEntity: 'wall', value: 0 } as Ef41);
    click(w, 'a'); click(w, 'b');
    w.tick();
    w.removeComponent('a', 'Signal'); w.removeComponent('b', 'Signal');
    w.tick();
    expect(alive41(w, 'a')).toBe(false);
    expect(alive41(w, 'b')).toBe(false);
    expect(alive41(w, 'wall')).toBe(false); // 静态寻址照常
  });
});
