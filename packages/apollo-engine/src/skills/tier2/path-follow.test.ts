import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { PathFollow, Transform, Velocity, SpawnRequest, DestroyRequest } from '@engine/protocol/components.js';
import { pathFollowCapability, pathFollowAt } from './path-follow.js';
import {
  transformCapability, shapeCapability, tagCapability, colorCapability,
  resourceCapability, flagCapability, randomCapability, velocityCapability,
  timerCapability, relationCapability, destroyCapability, overlapDetectCapability,
} from '@atom-skills/index.js';
import { motionApplyCapability, lifetimeCapability, hierarchyResolveCapability, hierarchyCascadeCapability } from '@skills/tier1/index.js';
import {
  steeringCapability, launchCapability, clickableCapability, groupCountCapability, effectApplyCapability,
  selfRuleCapability, hitboxCapability, mortalCapability, triggerZoneCapability, eventWhenCapability, textBindingCapability,
} from '@skills/tier2/index.js';
import { aggroCapability, flowCapability, prefabCapability, casterCapability } from '@skills/tier3/index.js';

// path-follow 固定航点轨道测试（REQ-PATHFOLLOW）。确定性·无随机/墙钟。
const xf = (x: number, y: number): Transform => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const pos = (w: World, e: string): Transform => w.getComponent<Transform>(e, 'Transform')!;
const vel = (w: World, e: string): Velocity => w.getComponent<Velocity>(e, 'Velocity')!;
const pf = (w: World, e: string): PathFollow => w.getComponent<PathFollow>(e, 'PathFollow')!;
const alive = (w: World, e: string): boolean => w.getAllEntities().includes(e);

// path-follow(定速) + motion-apply(积分)。
function world(): World {
  const w = new World();
  for (const s of pathFollowCapability.systems) w.addSystem(s);
  for (const s of motionApplyCapability.systems) w.addSystem(s);
  return w;
}
function follower(w: World, id: string, x: number, y: number, comp: Omit<PathFollow, 'type'>): void {
  w.createEntity(id);
  w.addComponent(id, xf(x, y));
  w.addComponent(id, { type: 'PathFollow', ...comp } as PathFollow);
}

describe('path-follow — 元数据 / 定序', () => {
  it('id 正确 + runsBefore motion-apply', () => {
    expect(pathFollowCapability.id).toBe('t2-path-follow');
    expect(pathFollowCapability.systems[0].runsBefore).toContain('motion-apply');
  });
});

describe('path-follow — 航点推进', () => {
  it('两航点：从 wp0 朝 wp1 走，进 arriveRadius 内 index 前进', () => {
    const w = world();
    follower(w, 'm', 0, 0, pathFollowAt([{ x: 100, y: 0 }, { x: 100, y: 100 }], 2));
    w.tick();
    expect(vel(w, 'm').vx).toBeCloseTo(2, 9); // 首 tick 朝 wp0 方向
    expect(pf(w, 'm').index).toBe(0);
    // 跑到 wp0 附近（arriveRadius 缺省 4）。
    for (let i = 0; i < 60; i++) w.tick();
    expect(pos(w, 'm').x).toBeGreaterThanOrEqual(96);
    expect(pf(w, 'm').index).toBe(1); // 已到达 wp0 → 游标前进到 wp1
  });

  it('到达那一 tick 立即朝新航点走（不空转）', () => {
    const w = world();
    // 起点几乎贴着 wp0（在 arriveRadius 内），wp1 在别处。
    follower(w, 'm', 99, 0, pathFollowAt([{ x: 100, y: 0 }, { x: 100, y: 100 }], 2));
    w.tick();
    expect(pf(w, 'm').index).toBe(1); // 一 tick 内完成到达+推进
    expect(vel(w, 'm').vy).toBeGreaterThan(0); // 已朝 wp1（y 增）方向走
  });
});

describe('path-follow — loop / 非 loop 终点', () => {
  // 注：speed 须 <= arriveRadius 才保证「距离每 tick 精确减 speed、不越过到达窗再反弹」——
  // speed 远大于 arriveRadius 时，方向逐 tick 重瞄会在到达窗两侧来回越过（永不停、永不精确回 0），
  // 这是「定速直奔 + 离散逐 tick 判定」的固有约束（同 pathfind.ts NavAgent.waypointRange 注释所述取舍），
  // 非 bug——测试按此约束选参数以拿到确定的「已到达/已停」断言。
  it('loop 闭环：跑到末航点后回到 index 0', () => {
    const w = world();
    follower(w, 'm', 0, 0, pathFollowAt([{ x: 5, y: 0 }, { x: 5, y: 5 }], 1, { loop: true, arriveRadius: 1 }));
    // 闭环持续循环（1→0→1→…），不掐一个固定 tick 数断言瞬时值（脆），改记录轨迹：
    // 先推进到航点1、随后又回到航点0 = 证明「跑完末航点回到 index 0」成立。
    let sawIndex1 = false;
    let loopedBack = false;
    for (let i = 0; i < 12 && !loopedBack; i++) {
      w.tick();
      const idx = pf(w, 'm').index;
      if (idx === 1) sawIndex1 = true;
      if (sawIndex1 && idx === 0) loopedBack = true;
    }
    expect(sawIndex1).toBe(true); // 确实推进到了航点1
    expect(loopedBack).toBe(true); // 之后又循环回到航点0
  });

  it('非 loop：跑完停在末点，Velocity 归零', () => {
    const w = world();
    follower(w, 'm', 0, 0, pathFollowAt([{ x: 4, y: 0 }], 1));
    for (let i = 0; i < 6; i++) w.tick();
    expect(pf(w, 'm').index).toBe(0); // 唯一航点，钉死在末点（=0）
    expect(pos(w, 'm').x).toBeCloseTo(4, 9); // 精确停在航点上（d===0）
    expect(vel(w, 'm').vx).toBe(0);
    expect(vel(w, 'm').vy).toBe(0);
  });
});

describe('path-follow — 速度模长', () => {
  it('首 tick 方向正确、|v|≈speed', () => {
    const w = world();
    follower(w, 'm', 0, 0, pathFollowAt([{ x: 3, y: 4 }], 5)); // 3-4-5 三角
    w.tick();
    const v = vel(w, 'm');
    expect(v.vx).toBeCloseTo(3, 9);
    expect(v.vy).toBeCloseTo(4, 9);
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(5, 9);
  });
});

describe('path-follow — 边界', () => {
  it('空 waypoints → Velocity 置零', () => {
    const w = world();
    follower(w, 'm', 0, 0, { waypoints: [], speed: 3, index: 0 });
    w.tick();
    expect(vel(w, 'm').vx).toBe(0);
    expect(vel(w, 'm').vy).toBe(0);
  });
});

describe('path-follow — 确定性', () => {
  it('同布局跑两遍 → snapshot 相等', () => {
    const run = (): string => {
      const w = world();
      follower(w, 'a', 0, 0, pathFollowAt([{ x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], 1.5, { loop: true }));
      follower(w, 'b', 10, 10, pathFollowAt([{ x: 20, y: 10 }], 2));
      for (let i = 0; i < 30; i++) w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});

describe('path-follow — queueId/minGap 队列递进（REQ-CONVEYOR-CAP M1）', () => {
  // 三成员同 queueId、同轨（loop 环带），起点按不同 path 进度摆位（index=1，目标 wp1=x10，
  // arriveRadius=1 避免本 tick 就到达打乱进度基准）：a 进度8（离wp1最近=排头）> b 进度5 > c 进度1。
  const wps = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }];
  function queueMember(w: World, id: string, x: number, minGap: number): void {
    follower(w, id, x, 0, { waypoints: wps, speed: 2, index: 1, arriveRadius: 1, queueId: 'belt', minGap });
  }

  it('后车追到 minGap 内即被夹住（不叠）；再往后的车按剩余空间部分前进（不超车）', () => {
    const w = world();
    queueMember(w, 'a', 8, 3); // 进度 10-2=8（排头，minGap 对排头不生效）
    queueMember(w, 'b', 5, 3); // 进度 10-5=5；离 a 恰好=minGap(3) → 本 tick 前进量夹到 0
    queueMember(w, 'c', 1, 3); // 进度 10-9=1；离 b(5) 差 4>minGap(3) → 允许前进 min(speed, 4-3=1)=1
    w.tick();
    expect(vel(w, 'a').vx).toBeCloseTo(2, 9); // 排头不受限，全速
    expect(vel(w, 'b').vx).toBe(0); // 恰贴 minGap → 夹死，不越界叠上排头
    expect(vel(w, 'c').vx).toBeCloseTo(1, 9); // 半速前进，刚好顶到「b 起点进度 − minGap」的界
    // 位置不重叠：一 tick 后 a（全速前进）> b（原地）> c（部分前进），顺序不倒、不叠位。
    expect(pos(w, 'a').x).toBeGreaterThan(pos(w, 'b').x);
    expect(pos(w, 'b').x).toBeGreaterThan(pos(w, 'c').x - 1e-9);
  });

  it('排头出队（离开 queueId 分组）后，原二当家转正 → 不再受限、全速前进（队列前移天然涌现）', () => {
    const w = world();
    queueMember(w, 'a', 8, 3);
    queueMember(w, 'b', 5, 3);
    queueMember(w, 'c', 1, 3);
    w.tick();
    expect(vel(w, 'b').vx).toBe(0); // 第一拍仍被 a 挡住
    w.removeComponent('a', 'PathFollow'); // 排头出队（如：抵达终点被摘下/回收）
    w.tick();
    expect(vel(w, 'b').vx).toBeCloseTo(2, 9); // a 一走，b 转正排头 → 全速
  });

  it('minGap 缺省=0：仍不超车（贴到 0 间距即夹死），但不强加额外间距', () => {
    const w = world();
    follower(w, 'lead', 8, 0, { waypoints: wps, speed: 2, index: 1, arriveRadius: 1, queueId: 'q0' });
    follower(w, 'tail', 6, 0, { waypoints: wps, speed: 2, index: 1, arriveRadius: 1, queueId: 'q0' }); // 进度差=2<speed(2)
    w.tick();
    expect(vel(w, 'lead').vx).toBeCloseTo(2, 9);
    expect(vel(w, 'tail').vx).toBeCloseTo(2, 9); // 进度差(2) == 允许前进量(speed) → 恰好顶到边界、不缩放不越界
  });

  it('进度打平 tie-break 按 id 升序（更小 id 判定为排头，确定性、无随机）', () => {
    const w = world();
    queueMember(w, 'z', 5, 3); // 与 'a' 进度打平（同 x=5）
    queueMember(w, 'a', 5, 3);
    w.tick();
    expect(vel(w, 'a').vx).toBeCloseTo(2, 9); // id 更小 → 判排头，不受限
    expect(vel(w, 'z').vx).toBe(0); // 判跟车 → 贴着排头被夹死（进度差=0<minGap）
  });

  it('不设 queueId：现有单体行为字节不变（零回归）', () => {
    const w = world();
    follower(w, 'solo', 8, 0, { waypoints: wps, speed: 2, index: 1, arriveRadius: 1 });
    w.tick();
    expect(vel(w, 'solo').vx).toBeCloseTo(2, 9);
  });

  it('确定性：queueId 队列双跑 snapshot 相等', () => {
    const run = (): string => {
      const w = world();
      queueMember(w, 'a', 8, 3);
      queueMember(w, 'b', 5, 3);
      queueMember(w, 'c', 1, 3);
      for (let i = 0; i < 20; i++) w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});

describe('path-follow — 调度定序（撞环回归·同 orbit-motion「调度定序」先例）', () => {
  it('与 motion-apply/steering/aggro/launch 同装不成环·可 tick', () => {
    // 真撞环（不是假设）：path-follow 与 steering 都声明 reads+writes Velocity（对齐 steering 的既有口径、
    // 保留"存在性检查"语义），组件图给出互为前驱的两条边 → 判成 RMW 伪环（topological-sort.ts 报
    // "Circular dependency detected among systems: motion-apply, steering, path-follow"）。
    // 两者作用于不同实体集（PathFollow vs Steering 挂载对象不同）、顺序对结果无影响，
    // 已在 path-follow.ts 系统声明上补 `runsAfter: ['steering']` 打破（同 steering.ts 注释所述 RMW 破环手法）。
    // path-follow 不读 Relation/Status/Tag，与 aggro（写 Relation）/hitbox/over-time（写 Status）无耦合；
    // 与 launch 也无环（launch 未在 reads 里声明 Velocity，只有单向"launch 先写、path-follow 后读"的边）。
    const w = new World();
    for (const cap of [motionApplyCapability, steeringCapability, aggroCapability, launchCapability, pathFollowCapability]) {
      for (const s of cap.systems) w.addSystem(s);
    }
    w.createEntity('enemy');
    w.addComponent('enemy', xf(0, 0));
    w.addComponent('enemy', { type: 'Perception', targetTag: 0, sightRadius: -1 } as never); // 空索敌（无 Tag 目标）
    follower(w, 'patroller', 0, 0, pathFollowAt([{ x: 10, y: 0 }, { x: 10, y: 10 }], 1, { loop: true }));
    expect(() => {
      for (let i = 0; i < 5; i++) w.tick();
    }).not.toThrow();
    expect(pf(w, 'patroller').waypoints.length).toBe(2); // 仍在正常跑（未被拓扑排序破坏状态）
  });
});

describe('path-follow — onEnd 路径终点触发（REQ-PATHEND-DROP）', () => {
  // 两航点、arriveRadius=1 < speed=5：确保「到达」只在真正压到航点时判定（不会一开局就因起点距离
  // 恰巧 <= arriveRadius 而提前触发，见文件头 speed/arriveRadius 取舍注释）。终点=(20,0)。
  const wps = [{ x: 10, y: 0 }, { x: 20, y: 0 }];
  function ender(w: World, id: string, onEnd: { dropTemplate?: string; destroy?: boolean }): void {
    follower(w, id, 0, 0, pathFollowAt(wps, 5, { arriveRadius: 1, onEnd }));
  }
  const spawnReqs = (w: World): [string, SpawnRequest][] =>
    w.query('SpawnRequest').map(([e]) => [e, w.getComponent<SpawnRequest>(e, 'SpawnRequest')!]);
  const destroyReqs = (w: World): [string, DestroyRequest][] =>
    w.query('DestroyRequest').map(([e]) => [e, w.getComponent<DestroyRequest>(e, 'DestroyRequest')!]);

  it('loop:false 到末点 → 发 SpawnRequest(dropTemplate@自身)+DestroyRequest，只一次', () => {
    const w = world();
    ender(w, 'm', { dropTemplate: 'drop_x', destroy: true });
    // 精确跑到终点耗 5 tick（见上方模拟：t=0→5→10→(index 前进)→15→20→到达触发）。
    for (let i = 0; i < 5; i++) w.tick();
    expect(pf(w, 'm').index).toBe(1); // 已推进到末航点
    expect(pos(w, 'm').x).toBeCloseTo(20, 9); // 精确停在终点
    expect(pf(w, 'm').ended).toBe(true);

    const spawns = spawnReqs(w);
    expect(spawns.length).toBe(1);
    expect(spawns[0][1]).toMatchObject({ templateId: 'drop_x', x: 20, y: 0 }); // 落件在自身位

    const destroys = destroyReqs(w);
    expect(destroys.length).toBe(1);
    expect(destroys[0][1].entityId).toBe('m');

    // fire-once 钉死：到末点后再多 tick，drop/destroy 请求数不再增长（ended 守卫生效）。
    for (let i = 0; i < 3; i++) w.tick();
    expect(spawnReqs(w).length).toBe(1);
    expect(destroyReqs(w).length).toBe(1);
  });

  it('fire-once：destroy:false（只落件不消失）实体持续存在多 tick，drop 仍只发一次', () => {
    const w = world();
    ender(w, 'm', { dropTemplate: 'drop_x' }); // 无 destroy
    for (let i = 0; i < 5; i++) w.tick();
    expect(spawnReqs(w).length).toBe(1);
    // 实体未被销毁、继续原地停靠多 tick——最容易重发的场景，靠 ended 守卫防重发。
    for (let i = 0; i < 10; i++) w.tick();
    expect(spawnReqs(w).length).toBe(1);
    expect(destroyReqs(w).length).toBe(0);
    expect(alive(w, 'm')).toBe(true);
  });

  it('loop:true 永不触发 onEnd（即便设了 onEnd 也放行不炸）', () => {
    const w = world();
    follower(w, 'm', 0, 0, pathFollowAt(wps, 5, { arriveRadius: 1, loop: true, onEnd: { dropTemplate: 'drop_x', destroy: true } }));
    for (let i = 0; i < 40; i++) w.tick(); // 往返跑很多趟（loop 语义：两航点间来回）
    expect(spawnReqs(w).length).toBe(0);
    expect(destroyReqs(w).length).toBe(0);
    expect(pf(w, 'm').ended ?? false).toBe(false);
  });

  it('无 onEnd（缺省）→ 零回归：不发任何 SpawnRequest/DestroyRequest', () => {
    const w = world();
    follower(w, 'm', 0, 0, pathFollowAt(wps, 5, { arriveRadius: 1 }));
    for (let i = 0; i < 10; i++) w.tick();
    expect(spawnReqs(w).length).toBe(0);
    expect(destroyReqs(w).length).toBe(0);
  });

  it('确定性：onEnd 双跑 snapshot 相等', () => {
    const run = (): string => {
      const w = world();
      ender(w, 'm', { dropTemplate: 'drop_x', destroy: true });
      for (let i = 0; i < 8; i++) w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});

describe('path-follow — onEnd 撞环回归（同 game102 blueprint 能力集：含 spawn/destroy 消费者）', () => {
  it('与 game102 全套能力（destroy-apply/hierarchy-cascade/prefab 等 SpawnRequest/DestroyRequest 消费者）同装不成环·可 tick', () => {
    // path-follow 新增 writes:['DestroyRequest','SpawnRequest']——真正读/consume 这两型的只有三家
    // （destroy-apply consume DestroyRequest；hierarchy-cascade read+write DestroyRequest；prefab
    // read+consume SpawnRequest），三家都不写 PathFollow/Transform/Velocity，故只产生单向边、不成环
    // （见 path-follow.ts 文件头 onEnd 段注释）。这里按 game102/blueprint.ts 实际装配的能力集整装验证。
    const w = new World();
    for (const cap of [
      transformCapability, shapeCapability, tagCapability, colorCapability,
      resourceCapability, flagCapability, randomCapability, velocityCapability,
      timerCapability, relationCapability, destroyCapability, overlapDetectCapability,
      motionApplyCapability, lifetimeCapability, hierarchyResolveCapability, hierarchyCascadeCapability,
      clickableCapability, groupCountCapability, effectApplyCapability, pathFollowCapability,
      selfRuleCapability, hitboxCapability, mortalCapability, triggerZoneCapability, eventWhenCapability, textBindingCapability,
      flowCapability, aggroCapability, prefabCapability, casterCapability,
    ]) {
      for (const s of cap.systems) w.addSystem(s);
    }
    follower(w, 'cannon', 0, 0, pathFollowAt(
      [{ x: 10, y: 0 }, { x: 20, y: 0 }], 5, { arriveRadius: 1, onEnd: { dropTemplate: 'tray_red', destroy: true } },
    ));
    expect(() => {
      for (let i = 0; i < 5; i++) w.tick();
    }).not.toThrow();
  });
});
