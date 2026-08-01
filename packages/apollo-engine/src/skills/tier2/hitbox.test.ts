import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Hitbox, Tag, Status, Resource, Trigger, Transform, Shape, Sensor, OverTime, PrefabOrigin, SpawnRequest } from '@engine/protocol/components.js';
import { hitboxCapability } from './hitbox.js';
import { triggerZoneCapability, ZONE_FLAG } from './trigger-zone.js';
import { overTimeCapability } from './over-time.js';
import { resourceCapability, destroyCapability } from '@atom-skills/index.js';
import { overlapDetectCapability } from '@skills/atoms/overlap-detect/index.js';
import { prefabCapability } from '@skills/tier3/index.js';

// 阵营/状态位（游戏数据自定义；测试里固定一套）。
const ENEMY = 1 << 1;
const PLAYER = 1 << 2;
const FROZEN = 1 << 0;

const hp = (w: World, e: string): number => w.getComponent<Resource>(e, 'Resource')!.current;
const status = (w: World, e: string): number => w.getComponent<Status>(e, 'Status')?.flags ?? 0;

// 语义测试：手工放 Trigger（跳过空间层），只加 hitbox + resource-apply 系统。
function combatWorld(): World {
  const w = new World();
  for (const s of hitboxCapability.systems) w.addSystem(s);
  for (const s of resourceCapability.systems) w.addSystem(s);
  return w;
}
function mob(w: World, id: string, tagFlags = ENEMY, statusFlags?: number): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Tag', flags: tagFlags } as Tag);
  w.addComponent(id, { type: 'Resource', id: 'hp', current: 100, min: 0, max: 100 } as Resource);
  if (statusFlags !== undefined) w.addComponent(id, { type: 'Status', flags: statusFlags } as Status);
}
function zone(w: World, id: string, hb: Omit<Hitbox, 'type'>): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Hitbox', ...hb } as Hitbox);
}
function trigger(w: World, zoneId: string, other: string): void {
  const tid = `trig:${zoneId}:${other}`;
  w.createEntity(tid);
  w.addComponent(tid, { type: 'Trigger', zone: zoneId, other } as Trigger);
}

describe('hitbox — 元数据 / 定序', () => {
  it('id / runsAfter trigger-zone / runsBefore resource-apply（定序正确）', () => {
    expect(hitboxCapability.id).toBe('t2-hitbox');
    const sys = hitboxCapability.systems[0];
    expect(sys.runsAfter).toContain('trigger-zone');
    expect(sys.runsBefore).toContain('resource-apply');
  });
});

describe('hitbox — scaleByResource per-caster 本地缩放（REQ-F-065）', () => {
  // 施法者复合体：main + eq 兄弟（同 templateId+seq）；eq 持 Resource{eq_atk}（异质装备 atk）。
  const caster = (w: World, id: string, eqAtk: number, seq: number): void => {
    w.createEntity(id);
    w.addComponent(id, { type: 'PrefabOrigin', templateId: 'unit', seq, localId: 'main' } as unknown as PrefabOrigin);
    w.createEntity(`${id}:eq`);
    w.addComponent(`${id}:eq`, { type: 'PrefabOrigin', templateId: 'unit', seq, localId: 'eq' } as unknown as PrefabOrigin);
    w.addComponent(`${id}:eq`, { type: 'Resource', id: 'eq_atk', current: eqAtk, min: 0, max: 999 } as Resource);
  };
  // 源自施法者的 strike 区（PrefabOrigin.source = 施法者 main）。
  const strikeFrom = (w: World, id: string, src: string, hb: Omit<Hitbox, 'type'>): void => {
    w.createEntity(id);
    w.addComponent(id, { type: 'Hitbox', ...hb } as Hitbox);
    w.addComponent(id, { type: 'PrefabOrigin', templateId: 'strike', seq: 99, localId: 'area', source: src } as unknown as PrefabOrigin);
  };

  it('strike 按施法者复合兄弟的 eq_atk 缩放（异质：每将装备不同→加成不同）', () => {
    const w = combatWorld();
    caster(w, 'guan', 3, 1); // 关羽 eq_atk=3
    caster(w, 'zhang', 5, 2); // 张飞 eq_atk=5
    mob(w, 'foe1');
    mob(w, 'foe2');
    strikeFrom(w, 'strk_guan', 'guan', { resource: 'hp', amount: 10, targetMask: ENEMY, scaleByResource: 'eq_atk' });
    strikeFrom(w, 'strk_zhang', 'zhang', { resource: 'hp', amount: 10, targetMask: ENEMY, scaleByResource: 'eq_atk' });
    trigger(w, 'strk_guan', 'foe1');
    trigger(w, 'strk_zhang', 'foe2');
    w.tick();
    expect(hp(w, 'foe1')).toBe(100 - 10 * 3); // 70：关羽本地 eq_atk=3
    expect(hp(w, 'foe2')).toBe(100 - 10 * 5); // 50：张飞本地 eq_atk=5（异质 → 证 per-caster）
  });

  it('源自身持有该资源（快路）', () => {
    const w = combatWorld();
    w.createEntity('solo');
    w.addComponent('solo', { type: 'PrefabOrigin', templateId: 'u', seq: 1, localId: 'main' } as unknown as PrefabOrigin);
    w.addComponent('solo', { type: 'Resource', id: 'eq_atk', current: 4, min: 0, max: 99 } as Resource);
    mob(w, 'foe');
    strikeFrom(w, 'strk', 'solo', { resource: 'hp', amount: 10, targetMask: ENEMY, scaleByResource: 'eq_atk' });
    trigger(w, 'strk', 'foe');
    w.tick();
    expect(hp(w, 'foe')).toBe(100 - 10 * 4); // 60：源自身 eq_atk=4
  });

  it('无 source / 未命中本地 → 回退全局（团队系数行为不变）', () => {
    const w = combatWorld();
    w.createEntity('gscale');
    w.addComponent('gscale', { type: 'Resource', id: 'dmg_scale', current: 2, min: 0, max: 9 } as Resource);
    mob(w, 'foe');
    zone(w, 'strk', { resource: 'hp', amount: 10, targetMask: ENEMY, scaleByResource: 'dmg_scale' }); // 无 PrefabOrigin.source
    trigger(w, 'strk', 'foe');
    w.tick();
    expect(hp(w, 'foe')).toBe(100 - 10 * 2); // 80：回退全局 dmg_scale=2
  });
});

describe('hitbox — 血量比例门 / 处决（REQ-F-061）', () => {
  const setHp = (w: World, e: string, cur: number): void => { w.getComponent<Resource>(e, 'Resource')!.current = cur; };

  it('requireHpFracBelow：仅残血(<30%)目标受击，满血跳过', () => {
    const w = combatWorld();
    zone(w, 'finish', { resource: 'hp', amount: 20, targetMask: ENEMY, requireHpFracBelow: 0.3 });
    mob(w, 'low'); setHp(w, 'low', 20); // 20% → 受击
    mob(w, 'high'); // 100% → 跳过
    trigger(w, 'finish', 'low');
    trigger(w, 'finish', 'high');
    w.tick();
    expect(hp(w, 'low')).toBe(0); // 20-20
    expect(hp(w, 'high')).toBe(100); // 满血不受残血门
  });

  it('requireHpFracAbove：仅满血(>=80%)目标受击（开胃技），残血跳过', () => {
    const w = combatWorld();
    zone(w, 'opener', { resource: 'hp', amount: 10, targetMask: ENEMY, requireHpFracAbove: 0.8 });
    mob(w, 'full'); // 100% → 受击
    mob(w, 'hurt'); setHp(w, 'hurt', 50); // 50% → 跳过
    trigger(w, 'opener', 'full');
    trigger(w, 'opener', 'hurt');
    w.tick();
    expect(hp(w, 'full')).toBe(90);
    expect(hp(w, 'hurt')).toBe(50);
  });

  it('executeBelow：命中低于阈值(<15%)直接清 0（斩杀）；高于阈值走常规伤害', () => {
    const w = combatWorld();
    zone(w, 'execute', { resource: 'hp', amount: 5, targetMask: ENEMY, executeBelow: 0.15 });
    mob(w, 'doomed'); setHp(w, 'doomed', 10); // 10% → 处决
    mob(w, 'safe'); setHp(w, 'safe', 50); // 50% → 常规 -5
    trigger(w, 'execute', 'doomed');
    trigger(w, 'execute', 'safe');
    w.tick();
    expect(hp(w, 'doomed')).toBe(0); // 处决清 0
    expect(hp(w, 'safe')).toBe(45); // 50-5（未处决）
  });
});

describe('hitbox — 命中结算（接触→伤害 / 逐目标 / 状态）', () => {
  it('命中敌人：扣固定血 + 置 frozen（局部寻址，改目标自己的 hp）', () => {
    const w = combatWorld();
    zone(w, 'nova', { resource: 'hp', amount: 5, targetMask: ENEMY, setMask: FROZEN });
    mob(w, 'm1');
    trigger(w, 'nova', 'm1');
    w.tick();
    expect(hp(w, 'm1')).toBe(95);
    expect(status(w, 'm1') & FROZEN).toBe(FROZEN);
  });

  it('阵营过滤：targetMask=ENEMY 不伤 PLAYER', () => {
    const w = combatWorld();
    zone(w, 'nova', { resource: 'hp', amount: 5, targetMask: ENEMY });
    mob(w, 'p1', PLAYER);
    trigger(w, 'nova', 'p1');
    w.tick();
    expect(hp(w, 'p1')).toBe(100); // 未受伤
  });
});

describe('hitbox — 计算伤害 / 状态门（碎冰重锤）', () => {
  it('碎冰：只对 frozen 目标结算 20% maxHP 真伤并解冻', () => {
    const w = combatWorld();
    zone(w, 'smash', { resource: 'hp', fracOfMax: 0.2, targetMask: ENEMY, requireMask: FROZEN, clearMask: FROZEN });
    mob(w, 'm1', ENEMY, FROZEN); // 已冰冻
    trigger(w, 'smash', 'm1');
    w.tick();
    expect(hp(w, 'm1')).toBe(80); // 100 - floor(100*0.2)
    expect(status(w, 'm1') & FROZEN).toBe(0); // 解冻
  });

  it('碎冰对未冰冻目标无效（requireMask 不满足）', () => {
    const w = combatWorld();
    zone(w, 'smash', { resource: 'hp', fracOfMax: 0.2, targetMask: ENEMY, requireMask: FROZEN });
    mob(w, 'm1', ENEMY, 0); // 无 frozen
    trigger(w, 'smash', 'm1');
    w.tick();
    expect(hp(w, 'm1')).toBe(100);
  });
});

describe('hitbox — 时间维度（命中挂 OverTime，D-003 集成）', () => {
  const ot = (w: World, e: string): OverTime | undefined => w.getComponent<OverTime>(e, 'OverTime');

  it('statusDuration：命中置 frozen + 挂"定时清除"TimedEffect（到期自动解冻，免手动清场）', () => {
    const w = combatWorld();
    zone(w, 'nova', { resource: 'hp', amount: 5, targetMask: ENEMY, setMask: FROZEN, statusDuration: 120 });
    mob(w, 'm1');
    trigger(w, 'nova', 'm1');
    w.tick();
    expect(status(w, 'm1') & FROZEN).toBe(FROZEN);
    expect(ot(w, 'm1')!.effects[0]).toMatchObject({ duration: 120, clearStatusOnEnd: FROZEN });
  });

  it('dotPerTick：命中挂燃烧 DoT TimedEffect', () => {
    const w = combatWorld();
    zone(w, 'fire', { resource: 'hp', amount: 0, targetMask: ENEMY, dotPerTick: 5, dotPeriod: 30, dotDuration: 180 });
    mob(w, 'm1');
    trigger(w, 'fire', 'm1');
    w.tick();
    expect(ot(w, 'm1')!.effects[0]).toMatchObject({ resource: 'hp', amountPerTick: -5, period: 30, duration: 180 });
  });

  it('R14-B：命中可同时挂 DoT + 定时状态（不再二选一）', () => {
    const w = combatWorld();
    zone(w, 'frostfire', { resource: 'hp', amount: 0, targetMask: ENEMY, setMask: FROZEN, statusDuration: 120, dotPerTick: 5, dotPeriod: 30, dotDuration: 180 });
    mob(w, 'm1');
    trigger(w, 'frostfire', 'm1');
    w.tick();
    expect(ot(w, 'm1')!.effects.length).toBe(2); // DoT + 定时冻结并存
  });
});

describe('hitbox — AOE fan-out', () => {
  it('一个伤害区 N 目标 → 各自结算', () => {
    const w = combatWorld();
    zone(w, 'nova', { resource: 'hp', amount: 10, targetMask: ENEMY, setMask: FROZEN });
    mob(w, 'm1');
    mob(w, 'm2');
    trigger(w, 'nova', 'm1');
    trigger(w, 'nova', 'm2');
    w.tick();
    expect(hp(w, 'm1')).toBe(90);
    expect(hp(w, 'm2')).toBe(90);
    expect(status(w, 'm2') & FROZEN).toBe(FROZEN);
  });
});

describe('hitbox — onHit 命中即生成（薄缺口，2026-07-26：击中火花/受击特效/穿透逐命中喷）', () => {
  function mobAt(w: World, id: string, x: number, y: number, tagFlags = ENEMY): void {
    mob(w, id, tagFlags);
    w.addComponent(id, { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  }
  const spawnReqs = (w: World): [string, SpawnRequest][] =>
    w.query('SpawnRequest').map(([e]) => [e, w.getComponent<SpawnRequest>(e, 'SpawnRequest')!]);

  it('命中一个目标 → 在目标位置发 1 个 SpawnRequest{spawnTemplate}', () => {
    const w = combatWorld();
    zone(w, 'nova', { resource: 'hp', amount: 5, targetMask: ENEMY, onHit: { spawnTemplate: 'hit_spark' } });
    mobAt(w, 'm1', 30, 40);
    trigger(w, 'nova', 'm1');
    w.tick();
    expect(hp(w, 'm1')).toBe(95); // 伤害仍照常结算（加性，零回归）
    const spawns = spawnReqs(w);
    expect(spawns.length).toBe(1);
    expect(spawns[0][1]).toMatchObject({ templateId: 'hit_spark', x: 30, y: 40 }); // 命中点=目标位置
  });

  it('穿透/AOE：一伤害区命中 N 目标 → N 个 SpawnRequest（各在各自目标位，fan-out 天然成立）', () => {
    const w = combatWorld();
    zone(w, 'beam', { resource: 'hp', amount: 3, targetMask: ENEMY, onHit: { spawnTemplate: 'hit_spark' } });
    mobAt(w, 'm1', 10, 0);
    mobAt(w, 'm2', 20, 5);
    mobAt(w, 'm3', 30, 9);
    trigger(w, 'beam', 'm1');
    trigger(w, 'beam', 'm2');
    trigger(w, 'beam', 'm3');
    w.tick();
    const spawns = spawnReqs(w).map(([, s]) => s);
    expect(spawns.length).toBe(3);
    const byX = new Map(spawns.map((s) => [s.x, s]));
    expect(byX.get(10)).toMatchObject({ templateId: 'hit_spark', y: 0 });
    expect(byX.get(20)).toMatchObject({ templateId: 'hit_spark', y: 5 });
    expect(byX.get(30)).toMatchObject({ templateId: 'hit_spark', y: 9 });
  });

  it('无 onHit（缺省）→ 零 SpawnRequest，现有 hitbox 行为逐字节不变（零回归）', () => {
    const w = combatWorld();
    zone(w, 'nova', { resource: 'hp', amount: 5, targetMask: ENEMY, setMask: FROZEN });
    mobAt(w, 'm1', 1, 2);
    trigger(w, 'nova', 'm1');
    w.tick();
    expect(spawnReqs(w).length).toBe(0);
    expect(hp(w, 'm1')).toBe(95);
    expect(status(w, 'm1') & FROZEN).toBe(FROZEN);
  });

  it('确定性：onHit 双跑 snapshot 相等（无随机/墙钟，单端录放一致）', () => {
    const run = (): string => {
      const w = combatWorld();
      zone(w, 'nova', { resource: 'hp', amount: 5, targetMask: ENEMY, onHit: { spawnTemplate: 'hit_spark' } });
      mobAt(w, 'm1', 5, 6);
      mobAt(w, 'm2', 7, 8);
      trigger(w, 'nova', 'm1');
      trigger(w, 'nova', 'm2');
      w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});

describe('hitbox — onHit 撞环回归（同 path-follow「撞环回归」先例·写 SpawnRequest 后与消费者 prefab 同装）', () => {
  it('overlap-detect→trigger-zone→hitbox(onHit)→prefab 全链路（+over-time/destroy/resource）同装 tick×5 not.toThrow', () => {
    // hitbox 新增 writes:['SpawnRequest']——唯一真正读+consume 它的是 prefab（t3-prefab），prefab 只
    // 读/consume SpawnRequest + 读/写 PrefabLibrary，不写 Trigger/Hitbox/Tag/Status/Resource，故只产生
    // "hitbox→prefab" 单向边，不与 hitbox 既有 runsAfter trigger-zone / runsBefore resource-apply,over-time
    // 成环（组件拓扑自动定序，见 hitbox.ts 文件头注释）。用真实 overlap（非手摆 Trigger）——trigger-zone
    // 每帧先清后重算，手摆的 Trigger 会在第一拍就被清掉、后续拍测不到 onHit 真正跑起来。
    const w = new World();
    for (const cap of [overlapDetectCapability, triggerZoneCapability, hitboxCapability, overTimeCapability, resourceCapability, destroyCapability, prefabCapability]) {
      for (const s of cap.systems) w.addSystem(s as never);
    }
    w.createEntity('nova');
    w.addComponent('nova', { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('nova', { type: 'Shape', kind: 'box', width: 100, height: 100 } as Shape);
    w.addComponent('nova', { type: 'Sensor' } as Sensor);
    w.addComponent('nova', { type: 'Tag', flags: ZONE_FLAG } as Tag);
    w.addComponent('nova', { type: 'Hitbox', resource: 'hp', amount: 5, targetMask: ENEMY, onHit: { spawnTemplate: 'hit_spark' }, dotPerTick: 1, dotPeriod: 1, dotDuration: 10 } as Hitbox);

    w.createEntity('enemy');
    w.addComponent('enemy', { type: 'Transform', x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('enemy', { type: 'Shape', kind: 'box', width: 20, height: 20 } as Shape);
    w.addComponent('enemy', { type: 'Tag', flags: ENEMY } as Tag);
    w.addComponent('enemy', { type: 'Resource', id: 'hp', current: 100, min: 0, max: 100 } as Resource);

    expect(() => {
      for (let i = 0; i < 5; i++) w.tick();
    }).not.toThrow();
  });
});

describe('hitbox — 全链路集成（overlap-detect→trigger-zone→hitbox→resource-apply）', () => {
  it('nova 伤害区与敌人重叠 → 真扣血 + 冻结（纯数据，零游戏代码）', () => {
    const w = new World();
    for (const s of overlapDetectCapability.systems) w.addSystem(s);
    for (const s of triggerZoneCapability.systems) w.addSystem(s);
    for (const s of hitboxCapability.systems) w.addSystem(s);
    for (const s of resourceCapability.systems) w.addSystem(s);

    // 伤害区：圆心原点的大 box，标 ZONE_FLAG + Sensor（感知不推开）+ Hitbox。
    w.createEntity('nova');
    w.addComponent('nova', { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('nova', { type: 'Shape', kind: 'box', width: 100, height: 100 } as Shape);
    w.addComponent('nova', { type: 'Sensor' } as Sensor);
    w.addComponent('nova', { type: 'Tag', flags: ZONE_FLAG } as Tag);
    w.addComponent('nova', { type: 'Hitbox', resource: 'hp', amount: 7, targetMask: ENEMY, setMask: FROZEN } as Hitbox);

    // 敌人：落在伤害区内。
    w.createEntity('enemy');
    w.addComponent('enemy', { type: 'Transform', x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('enemy', { type: 'Shape', kind: 'box', width: 20, height: 20 } as Shape);
    w.addComponent('enemy', { type: 'Tag', flags: ENEMY } as Tag);
    w.addComponent('enemy', { type: 'Resource', id: 'hp', current: 100, min: 0, max: 100 } as Resource);

    w.tick();
    expect(hp(w, 'enemy')).toBe(93);
    expect(status(w, 'enemy') & FROZEN).toBe(FROZEN);
  });
});

// ── REQ-F-044 consumeOnHit + REQ-F-047 scaleByResource ──
import { World as W44 } from '@engine/core/world.js';
import type { Resource as R44, DestroyRequest as DR44 } from '@engine/protocol/components.js';
import { destroyCapability as destroy44 } from '@atom-skills/destroy/index.js';
import { resourceCapability as resource44 } from '@atom-skills/resource/index.js';
describe('hitbox · REQ-F-044/047 单发结算 + 活系数乘区', () => {
  const PROTAG = 1 << 4;
  const mk44 = (hbExtra: Record<string, unknown>): W44 => {
    const w = new W44();
    for (const cap of [hitboxCapability, resource44, destroy44]) for (const s of cap.systems) w.addSystem(s as never);
    w.createEntity('orb'); // 拾取球 = zone
    w.addComponent('orb', { type: 'Hitbox', resource: 'loot', amount: -5, targetMask: PROTAG, ...hbExtra } as never);
    w.createEntity('hero');
    w.addComponent('hero', { type: 'Tag', flags: PROTAG } as never);
    w.addComponent('hero', { type: 'Resource', id: 'loot', current: 0, min: 0, max: 999 } as R44);
    return w;
  };
  const touch = (w: W44) => { w.createEntity('t1'); w.addComponent('t1', { type: 'Trigger', zone: 'orb', other: 'hero' } as never); };
  const loot = (w: W44) => w.getComponent<R44>('hero', 'Resource')!.current;
  const alive44 = (w: W44, id: string) => w.getAllEntities().includes(id);

  it('consumeOnHit：碰一下入账一次，球自毁 → 站桩不再重复入账（金币泵关死）', () => {
    const w = mk44({ consumeOnHit: true });
    touch(w);
    w.tick(); // 结算 +5 且球**同拍**被移除（hitbox 写请求 → destroy-apply 同拍消费，不留尾拍）
    expect(loot(w)).toBe(5);
    expect(alive44(w, 'orb')).toBe(false);
    w.destroyEntity('t1');
    w.tick();
    expect(loot(w)).toBe(5); // 不再涨
  });

  it('缺省（无 consumeOnHit）：行为不变——持续接触持续结算（回归）', () => {
    const w = mk44({});
    touch(w);
    w.tick(); w.tick();
    expect(loot(w)).toBe(10); // 两拍两次（旧语义）
    expect(alive44(w, 'orb')).toBe(true);
  });

  it('scaleByResource：amount × 全局系数资源；缺资源 → ×1 零迁移', () => {
    const w = mk44({ scaleByResource: 'buff_coef', consumeOnHit: true });
    w.createEntity('coef');
    w.addComponent('coef', { type: 'Resource', id: 'buff_coef', current: 3, min: 0, max: 99 } as R44);
    touch(w);
    w.tick();
    expect(loot(w)).toBe(15); // -5×3 → +15
    const w2 = mk44({ scaleByResource: 'nope', consumeOnHit: true });
    touch(w2);
    w2.tick();
    expect(loot(w2)).toBe(5); // 找不到系数 → 原值
  });
});
