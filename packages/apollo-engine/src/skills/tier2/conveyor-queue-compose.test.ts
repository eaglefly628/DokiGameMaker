import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { CapabilityDefinition } from '@engine/core/define-capability.js';
import { groupCountCapability } from './group-count.js';
import { eventWhenCapability } from './event-when.js';
import { effectApplyCapability } from './effect-apply.js';
import { trayCapability } from './tray.js';
import { pathFollowCapability } from './path-follow.js';
import type { Resource, Tag, GroupCount, EventWhen, Effect, Flag, Tray, Transform, TraySeat } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  REQ-CONVEYOR-CAP —— 重组证明（M2/M3/M4 裁剪依据·同 group-count.test.ts「重组证明」先例）。
//
//  调查结论（先于本文件的四机制分解）：
//    M1（有序不重叠占位 + 队列递进）——**真缺口**，已下沉：`PathFollow` 加 `queueId?`/`minGap?`
//    两字段 + `path-follow.ts` 系统内的队列夹紧逻辑（见 path-follow.ts 文件头 + path-follow.test.ts
//    「queueId/minGap 队列递进」）。这是唯一动了引擎代码的部分。
//
//    M2（容量准入·计数 + full 旗标）——**回驳，不建 ConveyorQueue**：`group-count` 已产出计数
//    Resource（game102 现有 conveyor.count/tray.count 即此）；「count≥capacity → level 语义 full 旗标
//    （进则亮离则灭）」= 两个 `event-when`（正向 gte + 反向 not(gte)，皆 mode:'level'）各配一个
//    `effect-apply`（set-flag true / false）镜像同一 Flag——纯数据、零新代码，本文件「M2」证明。
//
//    M3（空槽分配）——**回驳，不建 SlotBuffer**：`t2-tray` 的「② 落座：无座成员落最小空槽」正是
//    「入槽请求实体 → 分配第一个空位、写 Transform」（`tray.ts` `lowestFree()`），且「中间空出 →
//    下一个填该空位」已被 `tray.test.ts`「上板让座…回席落最小空槽」覆盖。game102 当前未接线
//    `trayCapability`（`theme.ts TRAY` 常量已按 `Tray{originX,originY,gap,capacity}` 形状备好，
//    仅缺 PE 在 blueprint.ts 数据接线，非引擎缺口）。满员 full 旗标 = 同 M2 手法（数 tray 成员）。
//    本文件「M3」证明 tray + group-count + event-when + effect-apply 四件同装可跑出完整管道。
//
//    M4（死锁=两 full 且）——**回驳，不建内建 deadlock 字段**：两个 Flag 直接可被 `t3-flow` 的
//    `GameFlow.transitions[].when`（ConditionExpr，与 event-when 共用同一求值器）或 `event-when`
//    的 `and` 条件树读——本文件按题面要求用 `event-when` AND 给出数据例。
//
//  结论：REQ-CONVEYOR-CAP 的四机制只有 M1 是真缺口；M2/M3/M4 建议 wontfix + 本文件即等价组合摆法
//  的证明测试（供 requests.md 归档时引用）。
// ═══════════════════════════════════════════════════════════════

function addSystems(w: World, ...caps: CapabilityDefinition[]): void {
  for (const cap of caps) for (const s of cap.systems) w.addSystem(s);
}

const BELT_TAG = 1 << 10;
const BUFFER_TAG = 1 << 11;

function tagged(w: World, id: string, flags: number): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Tag', flags } as Tag);
}

function counter(w: World, id: string, countResource: string, requiredTag: number, max = 99): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'GroupCount', countResource, requiredTag } as GroupCount);
  w.addComponent(id, { type: 'Resource', id: countResource, current: 0, min: 0, max } as Resource);
}

// 容量→level 语义 full 旗标：正向(gte)+反向(not gte) 两个 event-when(level) 镜像同一 Flag（M2/M3 共用手法）。
function wireFullFlag(w: World, prefix: string, countResource: string, capacity: number, flagId: string): void {
  w.createEntity(`${prefix}-flag`);
  w.addComponent(`${prefix}-flag`, { type: 'Flag', id: flagId, active: false } as Flag);
  w.createEntity(`${prefix}-on`);
  w.addComponent(`${prefix}-on`, {
    type: 'EventWhen', signal: `${prefix}_full_on`,
    when: { kind: 'resource', id: countResource, cmp: 'gte', value: capacity }, mode: 'level', armed: false,
  } as EventWhen);
  w.addComponent(`${prefix}-on`, { type: 'Effect', onSignal: `${prefix}_full_on`, kind: 'set-flag', targetId: flagId, value: true } as Effect);
  w.createEntity(`${prefix}-off`);
  w.addComponent(`${prefix}-off`, {
    type: 'EventWhen', signal: `${prefix}_full_off`,
    when: { kind: 'not', of: { kind: 'resource', id: countResource, cmp: 'gte', value: capacity } }, mode: 'level', armed: false,
  } as EventWhen);
  w.addComponent(`${prefix}-off`, { type: 'Effect', onSignal: `${prefix}_full_off`, kind: 'set-flag', targetId: flagId, value: false } as Effect);
}

const flagActive = (w: World, id: string): boolean => w.getComponent<Flag>(id, 'Flag')!.active;
const res = (w: World, id: string): number => w.getComponent<Resource>(id, 'Resource')!.current;

describe('REQ-CONVEYOR-CAP M2 —— 容量 full 旗标 = group-count + event-when(level) + effect-apply 组合（回驳，不建 ConveyorQueue）', () => {
  it('成员数 < capacity → full=false；达 capacity → full=true；退回 < capacity → full=false（level 语义·离开则灭）', () => {
    const w = new World();
    addSystems(w, groupCountCapability, eventWhenCapability, effectApplyCapability);
    counter(w, 'gc', 'belt.count', BELT_TAG);
    wireFullFlag(w, 'belt', 'belt.count', 2, 'belt.full');

    tagged(w, 'a', BELT_TAG);
    w.tick();
    expect(res(w, 'gc')).toBe(1);
    expect(flagActive(w, 'belt-flag')).toBe(false); // 1 < capacity(2)

    tagged(w, 'b', BELT_TAG);
    w.tick();
    expect(res(w, 'gc')).toBe(2);
    expect(flagActive(w, 'belt-flag')).toBe(true); // 达上限 → 亮

    w.destroyEntity('a');
    w.tick();
    expect(res(w, 'gc')).toBe(1);
    expect(flagActive(w, 'belt-flag')).toBe(false); // 离开 → 灭（level，非 edge 迟滞锁存）
  });
});

describe('REQ-CONVEYOR-CAP M3 —— 空槽分配 = t2-tray（既有）+ 满员 full 旗标同 M2 手法（回驳，不建 SlotBuffer）', () => {
  function slotRequest(w: World, id: string, tag: number): void {
    w.createEntity(id);
    w.addComponent(id, { type: 'Tag', flags: tag } as Tag);
    w.addComponent(id, { type: 'Transform', x: 999, y: 999, rotation: 0, scaleX: 1, scaleY: 1 } as Transform); // 落点=任意（spawn 位），交 tray 钉回槽位
  }
  const seat = (w: World, id: string): number | undefined => w.getComponent<TraySeat>(id, 'TraySeat')?.index;
  const at = (w: World, id: string): [number, number] => { const t = w.getComponent<Transform>(id, 'Transform')!; return [t.x, t.y]; };

  it('入槽请求实体落第一个空槽（写 Transform）；中间空出 → 下一个填该空位；满 3 槽 → full 旗标亮', () => {
    const w = new World();
    addSystems(w, trayCapability, groupCountCapability, eventWhenCapability, effectApplyCapability);
    w.createEntity('buffer');
    w.addComponent('buffer', { type: 'Tray', originX: 0, originY: 200, gap: 50, capacity: 3, requiredTag: BUFFER_TAG } as Tray);
    counter(w, 'gc', 'buffer.count', BUFFER_TAG);
    wireFullFlag(w, 'buffer', 'buffer.count', 3, 'buffer.full');

    slotRequest(w, 'r1', BUFFER_TAG);
    slotRequest(w, 'r2', BUFFER_TAG);
    w.tick();
    expect(seat(w, 'r1')).toBe(0);
    expect(seat(w, 'r2')).toBe(1);
    expect(at(w, 'r1')).toEqual([0, 200]); // 第一个空槽（非固定 spawn 位·已被 tray 钉回槽位）
    expect(flagActive(w, 'buffer-flag')).toBe(false); // 2 < capacity(3)

    slotRequest(w, 'r3', BUFFER_TAG);
    w.tick();
    expect(seat(w, 'r3')).toBe(2);
    expect(flagActive(w, 'buffer-flag')).toBe(true); // 满 3 → 亮

    // r2（中间槽）取走（如：点击复用重新派出）→ 空位 1 号 → 下一个入槽请求补上该空位。
    w.destroyEntity('r2');
    w.tick();
    expect(flagActive(w, 'buffer-flag')).toBe(false); // 2 < capacity → 灭
    slotRequest(w, 'r4', BUFFER_TAG);
    w.tick();
    expect(seat(w, 'r4')).toBe(1); // 补中间空出的 1 号（非排到末尾）
    expect(at(w, 'r4')).toEqual([50, 200]);
  });

  it('确定性：四件（tray+group-count+event-when+effect-apply）同装双跑 snapshot 相等', () => {
    const run = (): string => {
      const w = new World();
      addSystems(w, trayCapability, groupCountCapability, eventWhenCapability, effectApplyCapability);
      w.createEntity('buffer');
      w.addComponent('buffer', { type: 'Tray', originX: 0, originY: 200, gap: 50, capacity: 2, requiredTag: BUFFER_TAG } as Tray);
      counter(w, 'gc', 'buffer.count', BUFFER_TAG);
      wireFullFlag(w, 'buffer', 'buffer.count', 2, 'buffer.full');
      slotRequest(w, 'r1', BUFFER_TAG);
      slotRequest(w, 'r2', BUFFER_TAG);
      for (let i = 0; i < 5; i++) w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});

describe('REQ-CONVEYOR-CAP M4 —— 死锁 = event-when AND(两 full 旗标)（回驳，不内建 deadlock 字段）', () => {
  it('两旗标都亮才发 deadlock 信号（edge 一次）；任一灭则不发', () => {
    const w = new World();
    addSystems(w, eventWhenCapability, effectApplyCapability);
    w.createEntity('belt-flag');
    w.addComponent('belt-flag', { type: 'Flag', id: 'belt.full', active: false } as Flag);
    w.createEntity('buffer-flag');
    w.addComponent('buffer-flag', { type: 'Flag', id: 'buffer.full', active: false } as Flag);
    w.createEntity('deadlock');
    w.addComponent('deadlock', {
      type: 'EventWhen', signal: 'deadlock',
      when: { kind: 'and', of: [
        { kind: 'flag', id: 'belt.full', equals: true },
        { kind: 'flag', id: 'buffer.full', equals: true },
      ] },
      mode: 'edge', armed: false,
    } as EventWhen);
    w.addComponent('deadlock', { type: 'Effect', onSignal: 'deadlock', kind: 'set-flag', targetId: 'lost', value: true } as Effect);
    w.createEntity('lost-flag');
    w.addComponent('lost-flag', { type: 'Flag', id: 'lost', active: false } as Flag);

    w.tick();
    expect(flagActive(w, 'lost-flag')).toBe(false); // 都未满

    w.getComponent<Flag>('belt-flag', 'Flag')!.active = true;
    w.tick();
    expect(flagActive(w, 'lost-flag')).toBe(false); // 只一个满

    w.getComponent<Flag>('buffer-flag', 'Flag')!.active = true;
    w.tick();
    expect(flagActive(w, 'lost-flag')).toBe(true); // 两个都满 → 判负
  });
});

// 撞环回归：REQ-CONVEYOR-CAP 涉及的能力（M1 改过的 path-follow + M2/M3/M4 组合用的四件）同装可 tick，
// 不成拓扑环——供 PE 未来在 game102 接线 trayCapability（当前未接·M3 回驳建议）时的前置安全网。
describe('REQ-CONVEYOR-CAP —— 撞环回归（path-follow[M1 改过] + tray + group-count + event-when + effect-apply 同装）', () => {
  it('五件同装 w.tick()×5 not.toThrow', () => {
    const w = new World();
    addSystems(w, pathFollowCapability, trayCapability, groupCountCapability, eventWhenCapability, effectApplyCapability);
    // 各挂一个最小实体，确认各系统真的跑（非空 query 短路掉的假阴性）。
    w.createEntity('belt-member');
    w.addComponent('belt-member', { type: 'Tag', flags: BELT_TAG } as Tag);
    w.addComponent('belt-member', { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('belt-member', { type: 'PathFollow', waypoints: [{ x: 10, y: 0 }], speed: 1, index: 0, queueId: 'belt' } as never);
    w.createEntity('tray');
    w.addComponent('tray', { type: 'Tray', originX: 0, originY: 0, gap: 10, capacity: 1, requiredTag: BUFFER_TAG } as Tray);
    counter(w, 'gc', 'belt.count', BELT_TAG);
    wireFullFlag(w, 'belt', 'belt.count', 1, 'belt.full');
    expect(() => { for (let i = 0; i < 5; i++) w.tick(); }).not.toThrow();
  });
});
