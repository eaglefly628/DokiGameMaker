import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Overlap, Tag, Trigger } from '@engine/protocol/components.js';
import { triggerZoneCapability, ZONE_FLAG } from './trigger-zone.js';

function worldWithTriggerZone(): World {
  const w = new World();
  for (const s of triggerZoneCapability.systems) w.addSystem(s);
  return w;
}

function addZone(w: World, id: string): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Tag', flags: ZONE_FLAG } as Tag);
}

function addEntity(w: World, id: string): void {
  w.createEntity(id);
}

function addOverlap(w: World, a: string, b: string): void {
  const oid = `overlap:${a}:${b}`;
  w.createEntity(oid);
  w.addComponent(oid, { type: 'Overlap', entityA: a, entityB: b, normalX: 1, normalY: 0, depth: 1 } as Overlap);
}

describe('T2 trigger-zone — capability metadata', () => {
  it('契约：id / reads / writes / provides Trigger(event)', () => {
    expect(triggerZoneCapability.id).toBe('t2-trigger-zone');
    expect(triggerZoneCapability.components.reads).toEqual(['Overlap', 'Tag']);
    expect(triggerZoneCapability.components.writes).toEqual(['Trigger']);
    expect(triggerZoneCapability.components.provides.Trigger.category).toBe('event');
  });

  it('ZONE_FLAG 导出值为 1', () => {
    expect(ZONE_FLAG).toBe(1);
  });
});

describe('T2 trigger-zone — behavior', () => {
  it('zone(A) 与普通实体(B) 重叠 → 产出 Trigger{zone:A, other:B}', () => {
    const w = worldWithTriggerZone();
    addZone(w, 'zone');
    addEntity(w, 'player');
    addOverlap(w, 'zone', 'player');
    w.tick();

    const triggers = w.query('Trigger');
    expect(triggers.length).toBe(1);
    const trigger = w.getComponent<Trigger>(triggers[0][0], 'Trigger')!;
    expect(trigger.zone).toBe('zone');
    expect(trigger.other).toBe('player');
  });

  it('普通实体(A) 与 zone(B) 重叠（entityA 非 zone） → 产出 Trigger{zone:B, other:A}', () => {
    const w = worldWithTriggerZone();
    addEntity(w, 'player');
    addZone(w, 'zone');
    addOverlap(w, 'player', 'zone');
    w.tick();

    const triggers = w.query('Trigger');
    expect(triggers.length).toBe(1);
    const trigger = w.getComponent<Trigger>(triggers[0][0], 'Trigger')!;
    expect(trigger.zone).toBe('zone');
    expect(trigger.other).toBe('player');
  });

  it('无重叠 → 无 Trigger', () => {
    const w = worldWithTriggerZone();
    addZone(w, 'zone');
    addEntity(w, 'player');
    // 不加 Overlap
    w.tick();

    expect(w.query('Trigger').length).toBe(0);
  });

  it('两个普通实体重叠（都无 ZONE_FLAG） → 无 Trigger', () => {
    const w = worldWithTriggerZone();
    addEntity(w, 'entityA');
    addEntity(w, 'entityB');
    addOverlap(w, 'entityA', 'entityB');
    w.tick();

    expect(w.query('Trigger').length).toBe(0);
  });

  it('两个 zone 互相重叠 → 无 Trigger', () => {
    const w = worldWithTriggerZone();
    addZone(w, 'zoneA');
    addZone(w, 'zoneB');
    addOverlap(w, 'zoneA', 'zoneB');
    w.tick();

    expect(w.query('Trigger').length).toBe(0);
  });

  it('上一帧有 Trigger、这帧无重叠 → Trigger 被清除', () => {
    const w = worldWithTriggerZone();
    addZone(w, 'zone');
    addEntity(w, 'player');
    addOverlap(w, 'zone', 'player');
    w.tick();
    expect(w.query('Trigger').length).toBe(1);

    // 移除 Overlap，模拟实体离开触发区
    w.destroyEntity('overlap:zone:player');
    w.tick();
    expect(w.query('Trigger').length).toBe(0);
  });

  it('Trigger 实体 id 形如 trigger:<zone>:<other>', () => {
    const w = worldWithTriggerZone();
    addZone(w, 'zone');
    addEntity(w, 'player');
    addOverlap(w, 'zone', 'player');
    w.tick();

    const triggers = w.query('Trigger');
    expect(triggers.length).toBe(1);
    expect(triggers[0][0]).toBe('trigger:zone:player');
  });

  it('多个实体同时在触发区内 → 各产出一个 Trigger', () => {
    const w = worldWithTriggerZone();
    addZone(w, 'zone');
    addEntity(w, 'player1');
    addEntity(w, 'player2');
    addOverlap(w, 'zone', 'player1');
    addOverlap(w, 'zone', 'player2');
    w.tick();

    const triggers = w.query('Trigger');
    expect(triggers.length).toBe(2);
    const zones = triggers.map(([id]) => w.getComponent<Trigger>(id, 'Trigger')!.zone);
    expect(zones.every(z => z === 'zone')).toBe(true);
    const others = triggers.map(([id]) => w.getComponent<Trigger>(id, 'Trigger')!.other).sort();
    expect(others).toEqual(['player1', 'player2']);
  });
});
