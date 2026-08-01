import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@engine/core/world.js';
import { resourceCapability } from './index.js';
import type { Resource, ResourceModify, PrefabOrigin } from '@engine/protocol/components.js';
import {
  transformCapability, shapeCapability, tagCapability, colorCapability,
  flagCapability, randomCapability, velocityCapability,
  timerCapability, relationCapability, destroyCapability, overlapDetectCapability,
} from '@atom-skills/index.js';
import { motionApplyCapability, lifetimeCapability, hierarchyResolveCapability, hierarchyCascadeCapability } from '@skills/tier1/index.js';
import {
  clickableCapability, groupCountCapability, effectApplyCapability, launchCapability, pathFollowCapability,
  selfRuleCapability, hitboxCapability, mortalCapability, triggerZoneCapability, eventWhenCapability, textBindingCapability,
} from '@skills/tier2/index.js';
import { flowCapability, aggroCapability, prefabCapability, casterCapability } from '@skills/tier3/index.js';

const system = resourceCapability.systems[0];

function makeResource(id: string, current: number, min: number, max: number): Resource {
  return { type: 'Resource', id, current, min, max };
}

function makeModify(resourceId: string, amount: number): ResourceModify {
  return { type: 'ResourceModify', resourceId, amount };
}

// REQ-SPENDONFIRE：子弹的出身戳（source=发射它的炮台实体 id）。
function makeOrigin(source: string): PrefabOrigin {
  return { type: 'PrefabOrigin', templateId: 'bullet_x', seq: 0, localId: 'b', source };
}

function makeSourceModify(resourceId: string, amount: number): ResourceModify {
  return { type: 'ResourceModify', resourceId, amount, scope: 'source' };
}

describe('resource-apply system', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
    world.addSystem(system);
  });

  it('positive amount increases current, clamped to max', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeResource('hp', 90, 0, 100));
    world.addComponent('e1', makeModify('hp', 20));

    world.tick();

    const res = world.getComponent<Resource>('e1', 'Resource')!;
    expect(res.current).toBe(100);
  });

  it('negative amount decreases current, clamped to min', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeResource('hp', 10, 0, 100));
    world.addComponent('e1', makeModify('hp', -50));

    world.tick();

    const res = world.getComponent<Resource>('e1', 'Resource')!;
    expect(res.current).toBe(0);
  });

  it('clamps to non-zero min (min = -50)', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeResource('temp', -30, -50, 100));
    world.addComponent('e1', makeModify('temp', -40));

    world.tick();

    const res = world.getComponent<Resource>('e1', 'Resource')!;
    expect(res.current).toBe(-50);
  });

  it('positive amount stays within range without clamping', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeResource('mp', 40, 0, 100));
    world.addComponent('e1', makeModify('mp', 30));

    world.tick();

    const res = world.getComponent<Resource>('e1', 'Resource')!;
    expect(res.current).toBe(70);
  });

  it('negative amount stays within range without clamping', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeResource('hp', 80, 0, 100));
    world.addComponent('e1', makeModify('hp', -20));

    world.tick();

    const res = world.getComponent<Resource>('e1', 'Resource')!;
    expect(res.current).toBe(60);
  });

  it('resourceId mismatch leaves Resource unchanged', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeResource('hp', 80, 0, 100));
    world.addComponent('e1', makeModify('mp', -20));

    world.tick();

    const res = world.getComponent<Resource>('e1', 'Resource')!;
    expect(res.current).toBe(80);
  });

  it('ResourceModify is consumed after one tick', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeResource('hp', 50, 0, 100));
    world.addComponent('e1', makeModify('hp', 10));

    world.tick();

    expect(world.hasComponent('e1', 'ResourceModify')).toBe(false);
  });

  it('ResourceModify consumed even when resourceId does not match', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeResource('hp', 50, 0, 100));
    world.addComponent('e1', makeModify('mp', 10));

    world.tick();

    expect(world.hasComponent('e1', 'ResourceModify')).toBe(false);
  });

  it('no ResourceModify leaves Resource unchanged', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeResource('hp', 50, 0, 100));

    world.tick();

    const res = world.getComponent<Resource>('e1', 'Resource')!;
    expect(res.current).toBe(50);
  });

  it('clamps exactly at max boundary', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeResource('hp', 100, 0, 100));
    world.addComponent('e1', makeModify('hp', 1));

    world.tick();

    const res = world.getComponent<Resource>('e1', 'Resource')!;
    expect(res.current).toBe(100);
  });

  it('clamps exactly at min boundary', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeResource('hp', 0, 0, 100));
    world.addComponent('e1', makeModify('hp', -1));

    world.tick();

    const res = world.getComponent<Resource>('e1', 'Resource')!;
    expect(res.current).toBe(0);
  });

  it('R11 全局路由：ResourceModify 挂在别的实体，按 id 路由到持有资源的实体', () => {
    world.createEntity('game-state');
    world.addComponent('game-state', makeResource('affection_S', 30, 0, 100));
    // 修改挂在一个完全无关的"事件"实体上，只带 id —— 不知道资源住哪
    world.createEntity('dialogue-event');
    world.addComponent('dialogue-event', makeModify('affection_S', 5));

    world.tick();

    expect(world.getComponent<Resource>('game-state', 'Resource')!.current).toBe(35);
    expect(world.hasComponent('dialogue-event', 'ResourceModify')).toBe(false); // 仍被消费
  });

  it('R11 同实体优先：多实体同名资源，co-located 改各自的（不被全局路由抢走）', () => {
    world.createEntity('p1');
    world.addComponent('p1', makeResource('hp', 50, 0, 100));
    world.addComponent('p1', makeModify('hp', 20));
    world.createEntity('p2');
    world.addComponent('p2', makeResource('hp', 80, 0, 100));
    world.addComponent('p2', makeModify('hp', -30));

    world.tick();

    expect(world.getComponent<Resource>('p1', 'Resource')!.current).toBe(70);
    expect(world.getComponent<Resource>('p2', 'Resource')!.current).toBe(50);
  });

  it('multiple entities are processed independently', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeResource('hp', 50, 0, 100));
    world.addComponent('e1', makeModify('hp', 20));

    world.createEntity('e2');
    world.addComponent('e2', makeResource('hp', 80, 0, 100));
    world.addComponent('e2', makeModify('hp', -30));

    world.tick();

    const r1 = world.getComponent<Resource>('e1', 'Resource')!;
    const r2 = world.getComponent<Resource>('e2', 'Resource')!;
    expect(r1.current).toBe(70);
    expect(r2.current).toBe(50);
  });
});

describe('resource-apply — scope:"source"（REQ-SPENDONFIRE：per-shot 扣发射源）', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
    world.addSystem(system);
  });

  it('per-source 路由：两门炮各自的子弹各扣各自的 ammo（不像 global 那样扣到第一个同名资源）', () => {
    world.createEntity('cannonA');
    world.addComponent('cannonA', makeResource('ammo', 5, 0, 5));
    world.createEntity('cannonB');
    world.addComponent('cannonB', makeResource('ammo', 8, 0, 8));

    world.createEntity('bulletA');
    world.addComponent('bulletA', makeOrigin('cannonA'));
    world.addComponent('bulletA', makeSourceModify('ammo', -1));

    world.createEntity('bulletB');
    world.addComponent('bulletB', makeOrigin('cannonB'));
    world.addComponent('bulletB', makeSourceModify('ammo', -1));

    world.tick();

    expect(world.getComponent<Resource>('cannonA', 'Resource')!.current).toBe(4);
    expect(world.getComponent<Resource>('cannonB', 'Resource')!.current).toBe(7);
  });

  it('应用一次（第一坑）：子弹活 5 tick，源 ammo 只 -1，不是 -5', () => {
    world.createEntity('cannon');
    world.addComponent('cannon', makeResource('ammo', 10, 0, 10));
    world.createEntity('bullet');
    world.addComponent('bullet', makeOrigin('cannon'));
    world.addComponent('bullet', makeSourceModify('ammo', -1));

    for (let i = 0; i < 5; i++) world.tick();

    expect(world.getComponent<Resource>('cannon', 'Resource')!.current).toBe(9);
    // read-then-consume：ResourceModify 首拍即被删，之后 4 拍无重复扣（不会有人重新挂它）。
    expect(world.hasComponent('bullet', 'ResourceModify')).toBe(false);
  });

  it('源实体已销毁/从未存在 → 静默跳过，不崩', () => {
    world.createEntity('bullet');
    world.addComponent('bullet', makeOrigin('ghost')); // 'ghost' 从未 createEntity，等价于源已销毁
    world.addComponent('bullet', makeSourceModify('ammo', -1));

    expect(() => world.tick()).not.toThrow();
    expect(world.hasComponent('bullet', 'ResourceModify')).toBe(false); // 仍被消费（read-then-consume 无条件）
  });

  it('本实体无 PrefabOrigin（source-scope modify 挂在普通实体上）→ 静默跳过，不崩', () => {
    world.createEntity('e1');
    world.addComponent('e1', makeSourceModify('ammo', -1));

    expect(() => world.tick()).not.toThrow();
  });

  it('源实体存在但无该 id 资源 → 静默跳过，绝不误扣同 id 的全局资源', () => {
    // 全局确实存在一个同 id 的资源（挂在另一无关实体上）——验证 source-scope 找不到本地就跳过，不会
    // 像 auto/global 那样退而求其次抢别人的资源（否则就是"扣错炮"）。
    world.createEntity('decoy');
    world.addComponent('decoy', makeResource('ammo', 3, 0, 3));
    world.createEntity('cannon'); // 源实体存在，但没有 Resource 组件
    world.createEntity('bullet');
    world.addComponent('bullet', makeOrigin('cannon'));
    world.addComponent('bullet', makeSourceModify('ammo', -1));

    world.tick();

    expect(world.getComponent<Resource>('decoy', 'Resource')!.current).toBe(3);
  });

  it('local/global 零回归：既有 scope 行为不变（同一系统内混装 source 不影响）', () => {
    world.createEntity('p1');
    world.addComponent('p1', makeResource('hp', 50, 0, 100));
    world.addComponent('p1', makeModify('hp', 20)); // 缺省 auto/local

    world.createEntity('cannon');
    world.addComponent('cannon', makeResource('ammo', 5, 0, 5));
    world.createEntity('bullet');
    world.addComponent('bullet', makeOrigin('cannon'));
    world.addComponent('bullet', makeSourceModify('ammo', -1));

    world.tick();

    expect(world.getComponent<Resource>('p1', 'Resource')!.current).toBe(70);
    expect(world.getComponent<Resource>('cannon', 'Resource')!.current).toBe(4);
  });

  it('确定性：同布局双跑 snapshot 相等', () => {
    const run = (): string => {
      const w = new World();
      w.addSystem(system);
      w.createEntity('cannonA');
      w.addComponent('cannonA', makeResource('ammo', 5, 0, 5));
      w.createEntity('bulletA');
      w.addComponent('bulletA', makeOrigin('cannonA'));
      w.addComponent('bulletA', makeSourceModify('ammo', -1));
      for (let i = 0; i < 3; i++) w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});

describe('resource-apply — 撞环回归（与 game102 blueprint.ts 能力清单同装）', () => {
  // game102（src/games/game102/blueprint.ts）的完整 capabilities 清单原样搬来同装：证明
  // ResourceModify.scope:'source' 的路由改动（读 PrefabOrigin、写任意实体 Resource）没有给这套
  // 已在生产蓝图使用的能力组合引入新的系统依赖环（topological-sort.ts 报 Circular 会在 addSystem/tick 炸出）。
  it('与 game102 全量能力清单同装 · 可 tick', () => {
    const w = new World();
    for (const cap of [
      transformCapability, shapeCapability, tagCapability, colorCapability,
      resourceCapability, flagCapability, randomCapability, velocityCapability,
      timerCapability, relationCapability, destroyCapability, overlapDetectCapability,
      motionApplyCapability, lifetimeCapability, hierarchyResolveCapability, hierarchyCascadeCapability,
      clickableCapability, groupCountCapability, effectApplyCapability, launchCapability, pathFollowCapability,
      selfRuleCapability, hitboxCapability, mortalCapability, triggerZoneCapability, eventWhenCapability, textBindingCapability,
      flowCapability, aggroCapability, prefabCapability, casterCapability,
    ]) {
      for (const s of cap.systems) w.addSystem(s);
    }

    // 挂一个 REQ-SPENDONFIRE 场景：炮台 + 它打出的一发带 source-scope modify 的子弹。
    w.createEntity('cannon');
    w.addComponent('cannon', makeResource('ammo', 5, 0, 5));
    w.createEntity('bullet');
    w.addComponent('bullet', makeOrigin('cannon'));
    w.addComponent('bullet', makeSourceModify('ammo', -1));

    expect(() => {
      for (let i = 0; i < 5; i++) w.tick();
    }).not.toThrow();
    expect(w.getComponent<Resource>('cannon', 'Resource')!.current).toBe(4);
  });
});
