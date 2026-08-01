import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Caster, Signal, SpawnRequest, Transform, Tag, InputQueue, PrefabLibrary, PrefabTemplate } from '@engine/protocol/components.js';
import { casterCapability } from './caster.js';
import { prefabCapability } from './prefab.js';

const ENEMY = 1 << 2;
const xf = (x: number, y: number): Transform => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const sr = (w: World, e: string): SpawnRequest | undefined => w.getComponent<SpawnRequest>(e, 'SpawnRequest');

function casterWorld(): World {
  const w = new World();
  for (const s of casterCapability.systems) w.addSystem(s);
  return w;
}
// 手注一条 Signal（不引入 event-when，故无人清扫，单 tick 测试可见）。
function signal(w: World, name: string): void {
  w.createEntity(`sig:${name}`);
  w.addComponent(`sig:${name}`, { type: 'Signal', name, source: `sig:${name}` } as Signal);
}
function caster(w: World, id: string, c: Omit<Caster, 'type'>, t?: Transform): void {
  w.createEntity(id);
  if (t) w.addComponent(id, t);
  w.addComponent(id, { type: 'Caster', ...c } as Caster);
}

describe('caster — 元数据 / 定序', () => {
  it('id 正确 + runsAfter event-when/clickable（信号已就绪后再读）', () => {
    expect(casterCapability.id).toBe('t3-caster');
    expect(casterCapability.systems[0].runsAfter).toEqual(expect.arrayContaining(['event-when', 'clickable']));
  });
});

describe('caster — 位置策略', () => {
  it("at:'self' → 在施法者坐标产出 SpawnRequest", () => {
    const w = casterWorld();
    caster(w, 'hero', { onSignal: 'cast', template: 'nova', at: 'self' }, xf(5, 7));
    signal(w, 'cast');
    w.tick();
    expect(sr(w, 'hero')).toMatchObject({ templateId: 'nova', x: 5, y: 7 });
  });

  it("at:'pointer' → 在光标世界坐标产出（无相机时屏幕=世界）", () => {
    const w = casterWorld();
    caster(w, 'hero', { onSignal: 'cast', template: 'nova', at: 'pointer' }, xf(0, 0));
    w.createEntity('input');
    w.addComponent('input', { type: 'InputQueue', actions: [{ source: 'pointer', x: 100, y: 50, phase: 'down' }] } as InputQueue);
    signal(w, 'cast');
    w.tick();
    expect(sr(w, 'hero')).toMatchObject({ templateId: 'nova', x: 100, y: 50 });
  });

  it("at:'target' → 在最近的 targetTag 敌人坐标产出（自动索敌）", () => {
    const w = casterWorld();
    caster(w, 'hero', { onSignal: 'cast', template: 'bolt', at: 'target', targetTag: ENEMY }, xf(0, 0));
    for (const [id, x] of [['e_far', 40], ['e_near', -10]] as const) {
      w.createEntity(id);
      w.addComponent(id, xf(x, 0));
      w.addComponent(id, { type: 'Tag', flags: ENEMY } as Tag);
    }
    signal(w, 'cast');
    w.tick();
    expect(sr(w, 'hero')).toMatchObject({ templateId: 'bolt', x: -10, y: 0 }); // 最近的 e_near
  });

  it('无匹配信号 → 不产出', () => {
    const w = casterWorld();
    caster(w, 'hero', { onSignal: 'cast', template: 'nova', at: 'self' }, xf(0, 0));
    signal(w, 'other');
    w.tick();
    expect(sr(w, 'hero')).toBeUndefined();
  });

  it("originEntity：独立绑定实体(无 Transform)委托英雄锚点 → at:'target' 从英雄索敌", () => {
    const w = casterWorld();
    // 英雄（锚点），有 Transform；敌人 e_near 最近。
    w.createEntity('hero');
    w.addComponent('hero', xf(0, 0));
    for (const [id, x] of [['e_far', 50], ['e_near', 12]] as const) {
      w.createEntity(id);
      w.addComponent(id, xf(x, 0));
      w.addComponent(id, { type: 'Tag', flags: ENEMY } as Tag);
    }
    // 绑定实体：无 Transform，靠 originEntity 委托英雄。
    caster(w, 'bind_smash', { onSignal: 'cast', template: 'smash', at: 'target', targetTag: ENEMY, originEntity: 'hero' });
    signal(w, 'cast');
    w.tick();
    expect(sr(w, 'bind_smash')).toMatchObject({ templateId: 'smash', x: 12, y: 0 }); // 从英雄索敌到 e_near
  });
});

describe('caster — 与 prefab 端到端（信号 → 释放 → 展开实体）', () => {
  it('点地放技能：Signal → caster 产 SpawnRequest → prefab 在该坐标展开伤害区（零游戏代码）', () => {
    const w = new World();
    for (const s of casterCapability.systems) w.addSystem(s);
    for (const s of prefabCapability.systems) w.addSystem(s);

    const nova: PrefabTemplate = { entities: { area: { Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, Shape: { kind: 'box', width: 60, height: 60 } } } };
    w.createEntity('library');
    w.addComponent('library', { type: 'PrefabLibrary', templates: { nova }, seq: 0 } as PrefabLibrary);
    caster(w, 'hero', { onSignal: 'cast', template: 'nova', at: 'pointer' }, xf(0, 0));
    w.createEntity('input');
    w.addComponent('input', { type: 'InputQueue', actions: [{ source: 'pointer', x: 200, y: 120 }] } as InputQueue);
    signal(w, 'cast');

    w.tick();
    // prefab 展开出 nova#0:area，Transform 偏移到光标 (200,120)。
    const area = w.getComponent<Transform>('nova#0:area', 'Transform');
    expect(area).toMatchObject({ x: 200, y: 120 });
    // caster 的 SpawnRequest 已被 prefab 消费。
    expect(sr(w, 'hero')).toBeUndefined();
  });
});
