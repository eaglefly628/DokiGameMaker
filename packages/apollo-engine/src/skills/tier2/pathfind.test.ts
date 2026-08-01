// pathfind 能力单测：元数据 / 纯函数(nearestNode·buildAdjacency) / nav-follow 系统(沿航点 steer·整合 motion-apply
// 绕墙抵达·无目标 idle·CC 定身·空图不崩) / 确定性(两独立世界同结果)。
import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { motionApplyCapability } from '@skills/tier1/index.js';
import type { NavGraph, NavAgent, NavPath, Transform, Velocity, Relation, Status } from '@engine/protocol/components.js';
import { pathfindCapability, nearestNode, buildAdjacency } from './pathfind.js';

const T = (x: number, y: number): Transform => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);

// 航点图：L 形走廊 0(0,0)-1(100,0)-2(100,100)，绕开 (50,50) 的「墙」（无直达 0-2 边）。
function graph(w: World): void {
  w.createEntity('nav');
  w.addComponent('nav', {
    type: 'NavGraph',
    nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
    edges: [{ a: 0, b: 1 }, { a: 1, b: 2 }],
  } as NavGraph);
}
function agent(w: World, id: string, x: number, y: number, ag: Partial<NavAgent> & { speed: number; arriveRange: number }, target?: string): void {
  w.createEntity(id);
  w.addComponent(id, T(x, y));
  w.addComponent(id, { type: 'NavAgent', ...ag } as NavAgent);
  if (target) w.addComponent(id, { type: 'Relation', kind: 'target', targetId: target } as Relation);
}
function mk(withMotion = false): World {
  const w = new World();
  for (const s of pathfindCapability.systems) w.addSystem(s);
  if (withMotion) for (const s of motionApplyCapability.systems) w.addSystem(s);
  return w;
}
const vel = (w: World, id: string): Velocity => w.getComponent<Velocity>(id, 'Velocity')!;
const xf = (w: World, id: string): Transform => w.getComponent<Transform>(id, 'Transform')!;

describe('pathfind · 元数据', () => {
  it('id + reads/writes + provides', () => {
    expect(pathfindCapability.id).toBe('t2-pathfind');
    expect(pathfindCapability.components.reads).toContain('NavGraph');
    expect(pathfindCapability.components.writes).toEqual(expect.arrayContaining(['Velocity', 'NavPath']));
    expect(pathfindCapability.components.provides.NavGraph).toBeDefined();
    expect(pathfindCapability.components.provides.NavAgent).toBeDefined();
  });
});

describe('pathfind · 纯函数', () => {
  it('nearestNode 取最近航点（平方距离·相等取小下标）', () => {
    const nav = { type: 'NavGraph', nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 100, y: 0 }], edges: [] } as NavGraph;
    expect(nearestNode(nav, 4, 0)).toBe(0);
    expect(nearestNode(nav, 6, 0)).toBe(1);
    expect(nearestNode(nav, 90, 0)).toBe(2);
  });
  it('buildAdjacency 无向邻接 + 守界跳非法边', () => {
    const nav = { type: 'NavGraph', nodes: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], edges: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 0, b: 9 }] } as NavGraph;
    const { adj } = buildAdjacency(nav);
    expect([...adj[1]].sort()).toEqual([0, 2]); // 1 连 0 和 2（无向）
    expect(adj[0]).toEqual([1]);                 // 非法边 0-9 被守界跳过
  });
  it('buildAdjacency 边代价缺省 = Euclidean', () => {
    const nav = { type: 'NavGraph', nodes: [{ x: 0, y: 0 }, { x: 3, y: 4 }], edges: [{ a: 0, b: 1 }] } as NavGraph;
    const { edgeKey, edgeCost } = buildAdjacency(nav);
    expect(edgeCost.get(edgeKey(0, 1))).toBeCloseTo(5); // 3-4-5
  });
});

describe('pathfind · nav-follow 系统', () => {
  it('沿航点 steer：朝第一个航点定速（速度模长=speed）+ 缓存 NavPath', () => {
    const w = mk(); graph(w);
    agent(w, 'a', 0, 0, { speed: 5, arriveRange: 4 }, 'goal');
    w.createEntity('goal'); w.addComponent('goal', T(100, 100)); // 目标在节点 2
    w.tick();
    const v = vel(w, 'a');
    expect(v.vx).toBeGreaterThan(0);                 // 朝节点 1 (100,0)：+x
    expect(Math.abs(v.vy)).toBeLessThan(1e-9);       // 纯 +x（先走廊直段·不斜穿墙）
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(5);   // 模长 = speed
    expect(w.getComponent<NavPath>('a', 'NavPath')!.via).toEqual([1, 2]); // 去起点 0·留 1→2
  });

  it('整合 motion-apply：沿 L 走廊绕墙抵达目标、到 arriveRange 停', () => {
    const w = mk(true); graph(w);
    agent(w, 'a', 0, 0, { speed: 8, arriveRange: 12 }, 'goal');
    w.createEntity('goal'); w.addComponent('goal', T(100, 100));
    for (let i = 0; i < 80; i++) w.tick();
    const p = xf(w, 'a');
    expect(Math.hypot(p.x - 100, p.y - 100)).toBeLessThanOrEqual(12 + 1e-6); // 抵达终点
  });

  it('无目标 → idle（速度归零）', () => {
    const w = mk(); graph(w);
    agent(w, 'a', 0, 0, { speed: 5, arriveRange: 4 }); // 无 Relation
    w.addComponent('a', { type: 'Velocity', vx: 3, vy: 3, angular: 0 } as Velocity);
    w.tick();
    expect(vel(w, 'a')).toMatchObject({ vx: 0, vy: 0 });
  });

  it('CC 定身（haltStatusMask）→ 速度归零', () => {
    const FROZEN = 1 << 2;
    const w = mk(); graph(w);
    agent(w, 'a', 0, 0, { speed: 5, arriveRange: 4, haltStatusMask: FROZEN }, 'goal');
    w.createEntity('goal'); w.addComponent('goal', T(100, 100));
    w.addComponent('a', { type: 'Status', flags: FROZEN } as Status);
    w.tick();
    expect(vel(w, 'a')).toMatchObject({ vx: 0, vy: 0 });
  });

  it('无 NavGraph → 无操作不崩', () => {
    const w = mk(); // 不建图
    agent(w, 'a', 0, 0, { speed: 5, arriveRange: 4 }, 'goal');
    w.createEntity('goal'); w.addComponent('goal', T(100, 100));
    expect(() => w.tick()).not.toThrow();
  });
});

describe('pathfind · 确定性', () => {
  it('两独立世界同初态 + 同 tick 数 → Transform/NavPath 逐位相同（lockstep 安全）', () => {
    const run = (): { p: Transform; path: NavPath } => {
      const w = mk(true); graph(w);
      agent(w, 'a', 0, 0, { speed: 7, arriveRange: 10 }, 'goal');
      w.createEntity('goal'); w.addComponent('goal', T(100, 100));
      for (let i = 0; i < 18; i++) w.tick();
      return { p: xf(w, 'a'), path: w.getComponent<NavPath>('a', 'NavPath')! };
    };
    const A = run(), B = run();
    expect(A.p).toEqual(B.p);
    expect(A.path.via).toEqual(B.path.via);
    expect(A.path).toEqual(B.path);
  });
});
