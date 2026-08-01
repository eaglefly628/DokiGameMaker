import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Perception, PullAnchor, Relation, Steering, Tag, Transform, Velocity } from '@engine/protocol/components.js';
import { pullAnchorCapability } from './pull-anchor.js';
import { bounceRelayCapability } from './bounce-relay.js';
import { steeringCapability } from './steering.js';
import {
  transformCapability, hierarchyCapability, velocityCapability, shapeCapability,
  overlapDetectCapability, timerCapability, resourceCapability, tagCapability,
  relationCapability, destroyCapability, colorCapability, controllableCapability, cameraCapability,
} from '@atom-skills/index.js';
import { motionApplyCapability, lifetimeCapability, hierarchyResolveCapability, hierarchyCascadeCapability } from '@skills/tier1/index.js';
import {
  boundsClampCapability, triggerZoneCapability, eventWhenCapability, effectApplyCapability,
  cameraFollowCapability, hitboxCapability, overTimeCapability, mortalCapability,
  launchCapability, selfRuleCapability, keybindCapability, gaugeCapability, groupCountCapability, orbitMotionCapability, animStateCapability,
} from '@skills/tier2/index.js';
import { prefabCapability, casterCapability, aggroCapability, flowCapability } from '@skills/tier3/index.js';

// pull-anchor — 区域施加器：重组方案（不新写位移数学，只批量改写 Relation→复用 steering seek）。
// REQ-SURVIVOR武器缺口 W9（黑洞/吸附类武器）。确定性·无随机/墙钟。
const ENEMY = 1 << 1;
const PLAYER = 1 << 2;
const xf = (x: number, y: number): Transform => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const rel = (w: World, e: string): Relation | undefined => w.getComponent<Relation>(e, 'Relation');

function world(): World {
  const w = new World();
  for (const s of pullAnchorCapability.systems) w.addSystem(s);
  return w;
}
function anchor(w: World, id: string, x: number, y: number, pa: Omit<PullAnchor, 'type'>): void {
  w.createEntity(id);
  w.addComponent(id, xf(x, y));
  w.addComponent(id, { type: 'PullAnchor', ...pa } as PullAnchor);
}
function mob(w: World, id: string, x: number, y: number, opts?: { steering?: boolean; tagFlags?: number }): void {
  w.createEntity(id);
  w.addComponent(id, xf(x, y));
  if (opts?.steering !== false) w.addComponent(id, { type: 'Steering', mode: 'seek', speed: 1, stopRange: 0 } as Steering);
  if (opts?.tagFlags !== undefined) w.addComponent(id, { type: 'Tag', flags: opts.tagFlags } as Tag);
}

describe('pull-anchor — 元数据 / 定序', () => {
  it('id 正确 + runsAfter aggro', () => {
    expect(pullAnchorCapability.id).toBe('t2-pull-anchor');
    expect(pullAnchorCapability.systems[0].runsAfter).toContain('aggro');
  });
});

describe('pull-anchor — 批量改写 Relation(target)→锚点', () => {
  it('半径内 + tagMask 匹配 + 已挂 Steering → Relation 改指锚点', () => {
    const w = world();
    anchor(w, 'hole', 0, 0, { radius: 50, tagMask: ENEMY });
    mob(w, 'e1', 10, 0, { tagFlags: ENEMY });
    w.tick();
    expect(rel(w, 'e1')).toMatchObject({ kind: 'target', targetId: 'hole' });
  });

  it('半径外 → 不受影响', () => {
    const w = world();
    anchor(w, 'hole', 0, 0, { radius: 50, tagMask: ENEMY });
    mob(w, 'e1', 999, 0, { tagFlags: ENEMY });
    w.tick();
    expect(rel(w, 'e1')).toBeUndefined();
  });

  it('tagMask 不匹配 → 不受影响', () => {
    const w = world();
    anchor(w, 'hole', 0, 0, { radius: 50, tagMask: ENEMY });
    mob(w, 'p1', 10, 0, { tagFlags: PLAYER }); // 非 ENEMY
    w.tick();
    expect(rel(w, 'p1')).toBeUndefined();
  });

  it('边界：未挂 Steering 的实体不受影响（重组的诚实局限，非 bug）', () => {
    const w = world();
    anchor(w, 'hole', 0, 0, { radius: 50, tagMask: ENEMY });
    mob(w, 'item', 10, 0, { steering: false, tagFlags: ENEMY });
    w.tick();
    expect(rel(w, 'item')).toBeUndefined();
  });

  it('radius<=0 → 不生效（零回归）', () => {
    const w = world();
    anchor(w, 'hole', 0, 0, { radius: 0, tagMask: ENEMY });
    mob(w, 'e1', 1, 0, { tagFlags: ENEMY });
    w.tick();
    expect(rel(w, 'e1')).toBeUndefined();
  });

  it('礼让口径：Relation 已被另作他用(kind!=="target") → 让位，不覆盖', () => {
    const w = world();
    anchor(w, 'hole', 0, 0, { radius: 50, tagMask: ENEMY });
    mob(w, 'e1', 10, 0, { tagFlags: ENEMY });
    w.addComponent('e1', { type: 'Relation', kind: 'owner', targetId: 'someone' } as Relation);
    w.tick();
    expect(rel(w, 'e1')).toMatchObject({ kind: 'owner', targetId: 'someone' }); // 未被覆盖
  });

  it('tagMask=0（不限阵营）→ 只要挂 Steering 就命中', () => {
    const w = world();
    anchor(w, 'hole', 0, 0, { radius: 50, tagMask: 0 });
    mob(w, 'e1', 10, 0); // 无 Tag
    w.tick();
    expect(rel(w, 'e1')).toMatchObject({ kind: 'target', targetId: 'hole' });
  });
});

describe('pull-anchor — 盖过默认 aggro 目标（黑洞压制敌群 AI）', () => {
  it('敌人本追玩家(aggro) → 进入黑洞半径后改追黑洞（steering 读到本 tick 覆盖后的 Relation）', () => {
    const w = new World();
    for (const s of aggroCapability.systems) w.addSystem(s);
    for (const s of pullAnchorCapability.systems) w.addSystem(s);
    for (const s of steeringCapability.systems) w.addSystem(s);
    for (const s of motionApplyCapability.systems) w.addSystem(s);

    w.createEntity('hero');
    w.addComponent('hero', xf(1000, 0)); // 玩家很远
    w.addComponent('hero', { type: 'Tag', flags: PLAYER } as Tag);

    anchor(w, 'hole', 0, 0, { radius: 50, tagMask: ENEMY });

    w.createEntity('mob');
    w.addComponent('mob', xf(10, 0));
    w.addComponent('mob', { type: 'Perception', targetTag: PLAYER, sightRadius: 0 } as Perception); // 恒追玩家
    w.addComponent('mob', { type: 'Steering', mode: 'seek', speed: 1, stopRange: 0 } as Steering);
    w.addComponent('mob', { type: 'Tag', flags: ENEMY } as Tag);

    w.tick();
    // pull-anchor 在 aggro 之后覆盖 Relation → steering 本 tick 读到的是黑洞，而非 aggro 刚锁的玩家。
    expect(rel(w, 'mob')).toMatchObject({ kind: 'target', targetId: 'hole' });
    const v = w.getComponent<Velocity>('mob', 'Velocity')!;
    expect(v.vx).toBeLessThan(0); // 朝 (0,0) 而非朝远处的玩家(1000,0)
  });
});

describe('pull-anchor — 确定性', () => {
  it('多锚点重叠命中同一实体 → 按锚点 id 升序、后者覆盖前者（确定的 tie-break）', () => {
    const w = world();
    anchor(w, 'holeA', 0, 0, { radius: 100, tagMask: ENEMY });
    anchor(w, 'holeB', 5, 0, { radius: 100, tagMask: ENEMY });
    mob(w, 'e1', 10, 0, { tagFlags: ENEMY });
    w.tick();
    expect(rel(w, 'e1')).toMatchObject({ targetId: 'holeB' }); // 'holeA' < 'holeB'，后处理的 holeB 生效
  });

  it('同布局跑两遍 → snapshot 相等', () => {
    const run = (): string => {
      const w = world();
      anchor(w, 'hole', 0, 0, { radius: 50, tagMask: ENEMY });
      mob(w, 'e1', 10, 0, { tagFlags: ENEMY });
      mob(w, 'e2', -10, 5, { tagFlags: ENEMY });
      for (let i = 0; i < 5; i++) w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});

describe('pull-anchor — 撞环回归（同 game-103 实装能力集同装）', () => {
  it('与 motion-apply/steering/aggro 同装不成环·可 tick', () => {
    const w = new World();
    for (const cap of [motionApplyCapability, steeringCapability, aggroCapability, pullAnchorCapability]) {
      for (const s of cap.systems) w.addSystem(s);
    }
    anchor(w, 'hole', 0, 0, { radius: 50, tagMask: ENEMY });
    w.createEntity('hero');
    w.addComponent('hero', xf(200, 0));
    w.addComponent('hero', { type: 'Tag', flags: PLAYER } as Tag);
    w.createEntity('mob');
    w.addComponent('mob', xf(10, 0));
    w.addComponent('mob', { type: 'Perception', targetTag: PLAYER, sightRadius: 0 } as Perception);
    w.addComponent('mob', { type: 'Steering', mode: 'seek', speed: 1, stopRange: 0 } as Steering);
    w.addComponent('mob', { type: 'Tag', flags: ENEMY } as Tag);
    expect(() => {
      for (let i = 0; i < 5; i++) w.tick();
    }).not.toThrow();
  });

  it('与 game-103 蓝图实装的全量能力集（blueprint.ts import 清单）+ bounce-relay/pull-anchor 同装·可 tick', () => {
    const w = new World();
    for (const cap of [
      // atoms（game-103 blueprint.ts 逐一对应）
      transformCapability, hierarchyCapability, velocityCapability, shapeCapability,
      overlapDetectCapability, timerCapability, resourceCapability, tagCapability,
      relationCapability, destroyCapability, colorCapability, controllableCapability, cameraCapability,
      // tier1
      motionApplyCapability, lifetimeCapability, hierarchyResolveCapability, hierarchyCascadeCapability,
      // tier2
      boundsClampCapability, triggerZoneCapability, eventWhenCapability, effectApplyCapability,
      cameraFollowCapability, hitboxCapability, overTimeCapability, mortalCapability,
      steeringCapability, launchCapability, selfRuleCapability, keybindCapability, gaugeCapability, groupCountCapability, orbitMotionCapability, animStateCapability,
      // tier3
      prefabCapability, casterCapability, aggroCapability, flowCapability,
      // 本次新增（W7 bounce-relay + W9 pull-anchor；W8 lure 已在上面的 aggroCapability 内）
      bounceRelayCapability, pullAnchorCapability,
    ]) {
      for (const s of cap.systems) w.addSystem(s);
    }
    anchor(w, 'hole', 0, 0, { radius: 50, tagMask: ENEMY });
    w.createEntity('hero');
    w.addComponent('hero', xf(200, 0));
    w.addComponent('hero', { type: 'Tag', flags: PLAYER } as Tag);
    w.createEntity('mob');
    w.addComponent('mob', xf(10, 0));
    w.addComponent('mob', { type: 'Perception', targetTag: PLAYER, sightRadius: 0, lureTag: 1 << 4 } as Perception);
    w.addComponent('mob', { type: 'Steering', mode: 'seek', speed: 1, stopRange: 0 } as Steering);
    w.addComponent('mob', { type: 'Tag', flags: ENEMY } as Tag);
    expect(() => {
      for (let i = 0; i < 5; i++) w.tick();
    }).not.toThrow();
  });
});
