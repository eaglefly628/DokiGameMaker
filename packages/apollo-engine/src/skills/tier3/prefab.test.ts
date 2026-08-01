import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { PrefabLibrary, PrefabTemplate, SpawnRequest, Transform, Shape, Tag, Resource, Hitbox, Sensor, Status } from '@engine/protocol/components.js';
import { prefabCapability } from './prefab.js';
import { hitboxCapability } from '../tier2/hitbox.js';
import { triggerZoneCapability, ZONE_FLAG } from '../tier2/trigger-zone.js';
import { resourceCapability } from '@atom-skills/index.js';
import { overlapDetectCapability } from '@skills/atoms/overlap-detect/index.js';

const ENEMY = 1 << 1;
const FROZEN = 1 << 0;
const xf = (x: number, y: number): Record<string, unknown> => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });

function prefabWorld(templates: Record<string, PrefabTemplate>): World {
  const w = new World();
  for (const s of prefabCapability.systems) w.addSystem(s);
  w.createEntity('lib');
  w.addComponent('lib', { type: 'PrefabLibrary', templates, seq: 0 } as PrefabLibrary);
  return w;
}
function request(w: World, templateId: string, x: number, y: number, holder = 'spawner'): void {
  w.createEntity(holder);
  w.addComponent(holder, { type: 'SpawnRequest', templateId, x, y } as SpawnRequest);
}

const BOX: Record<string, PrefabTemplate> = {
  box: { entities: { body: { Transform: xf(5, 0), Shape: { kind: 'box', width: 10, height: 10 } } } },
};

describe('prefab — 展开 / 偏移 / 唯一 id', () => {
  it('SpawnRequest → 实例化模板实体，Transform 偏移到 (x,y)', () => {
    const w = prefabWorld(BOX);
    request(w, 'box', 100, 50);
    w.tick();
    const t = w.getComponent<Transform>('box#0:body', 'Transform');
    expect(t).toBeTruthy();
    expect(t!.x).toBe(105); // 5 + 100
    expect(t!.y).toBe(50);
  });

  it('SpawnRequest 被消费（一次性）', () => {
    const w = prefabWorld(BOX);
    request(w, 'box', 0, 0);
    w.tick();
    expect(w.getComponent('spawner', 'SpawnRequest')).toBeUndefined();
  });

  it('seq 递增 → 多次实例化得唯一 id', () => {
    const w = prefabWorld(BOX);
    request(w, 'box', 0, 0, 's1');
    request(w, 'box', 0, 0, 's2');
    w.tick();
    expect(w.getComponent('box#0:body', 'Transform')).toBeTruthy();
    expect(w.getComponent('box#1:body', 'Transform')).toBeTruthy();
  });

  it('深拷贝隔离：实例化不污染模板（偏移只作用于实例）', () => {
    const w = prefabWorld(BOX);
    request(w, 'box', 100, 100);
    w.tick();
    expect((BOX.box.entities.body.Transform as { x: number }).x).toBe(5); // 模板原值不变
  });

  it('多实体模板：一次展开多个实体', () => {
    const MULTI: Record<string, PrefabTemplate> = {
      combo: { entities: { a: { Transform: xf(0, 0) }, b: { Transform: xf(10, 0) } } },
    };
    const w = prefabWorld(MULTI);
    request(w, 'combo', 0, 0);
    w.tick();
    expect(w.getComponent('combo#0:a', 'Transform')).toBeTruthy();
    expect(w.getComponent('combo#0:b', 'Transform')).toBeTruthy();
  });

  it('未知 templateId → 静默跳过（不崩）', () => {
    const w = prefabWorld(BOX);
    request(w, 'nope', 0, 0);
    expect(() => w.tick()).not.toThrow();
  });
});

describe('prefab — 全数据链 money shot：SpawnRequest → 展开 nova → 重叠 → 结算', () => {
  it('发 SpawnRequest 释放冰霜新星 → 敌人真扣血 + 冻结（零游戏代码、零编译器）', () => {
    const NOVA: Record<string, PrefabTemplate> = {
      frost_nova: {
        entities: {
          area: {
            Transform: xf(0, 0),
            Shape: { kind: 'box', width: 100, height: 100 },
            Sensor: {},
            Tag: { flags: ZONE_FLAG },
            Hitbox: { resource: 'hp', amount: 7, targetMask: ENEMY, setMask: FROZEN },
          },
        },
      },
    };
    const w = new World();
    for (const s of prefabCapability.systems) w.addSystem(s);
    for (const s of overlapDetectCapability.systems) w.addSystem(s);
    for (const s of triggerZoneCapability.systems) w.addSystem(s);
    for (const s of hitboxCapability.systems) w.addSystem(s);
    for (const s of resourceCapability.systems) w.addSystem(s);

    w.createEntity('lib');
    w.addComponent('lib', { type: 'PrefabLibrary', templates: NOVA, seq: 0 } as PrefabLibrary);
    // 敌人站在将要释放的新星范围内。
    w.createEntity('enemy');
    w.addComponent('enemy', { type: 'Transform', ...xf(10, 0) } as Transform);
    w.addComponent('enemy', { type: 'Shape', kind: 'box', width: 20, height: 20 } as Shape);
    w.addComponent('enemy', { type: 'Tag', flags: ENEMY } as Tag);
    w.addComponent('enemy', { type: 'Resource', id: 'hp', current: 100, min: 0, max: 100 } as Resource);

    // 释放技能 = 发一条 SpawnRequest（数据）。
    request(w, 'frost_nova', 0, 0);

    // 几拍内：展开 nova → overlap-detect → trigger-zone → hitbox → resource-apply。
    for (let i = 0; i < 3; i++) w.tick();

    const enemyHp = w.getComponent<Resource>('enemy', 'Resource')!.current;
    const enemyStatus = w.getComponent<Status>('enemy', 'Status')?.flags ?? 0;
    expect(enemyHp).toBeLessThan(100); // 真受伤
    expect(enemyStatus & FROZEN).toBe(FROZEN); // 被冻结
  });
});

// ── BUG-004 回归：专用请求载体展开后回收，持久施法者实体保留 ──
describe('prefab — BUG-004 载体回收（不泄漏空实体 / 不误删持久实体）', () => {
  it('专用载体（仅 SpawnRequest）展开后被销毁，不残留空实体', () => {
    const w = prefabWorld(BOX);
    w.createEntity('drop:enemy-3');
    w.addComponent('drop:enemy-3', { type: 'SpawnRequest', templateId: 'box', x: 0, y: 0 } as SpawnRequest);
    w.tick();
    expect(w.getAllEntities()).not.toContain('drop:enemy-3'); // 载体已回收
    expect(w.getComponent<Transform>('box#0:body', 'Transform')).toBeTruthy(); // 掉落已展开
  });

  it('持久实体（SpawnRequest + 其他组件，如 caster 施法者）不被销毁，仅 SpawnRequest 被消费', () => {
    const w = prefabWorld(BOX);
    w.createEntity('caster');
    w.addComponent('caster', { type: 'Transform', ...xf(0, 0) } as unknown as Transform); // 持久实体有别的组件
    w.addComponent('caster', { type: 'SpawnRequest', templateId: 'box', x: 0, y: 0 } as SpawnRequest);
    w.tick();
    expect(w.getAllEntities()).toContain('caster'); // 持久实体保留
    expect(w.getComponent('caster', 'SpawnRequest')).toBeUndefined(); // 仅其 SpawnRequest 被 consume
    expect(w.getComponent<Transform>('caster', 'Transform')).toBeTruthy();
  });
});
