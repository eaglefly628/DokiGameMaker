// navmesh-bake（REQ-3D-Nav · owner「自动摆放」）：自动烘 NavGraph + 主程 pathfind 端到端·确定性 sim·进 hash。
import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@engine/core/world.js';
import { navmeshBakeCapability } from './index.js';
import { pathfindCapability } from '@skills/tier2/index.js';
import { motionApplyCapability } from '@skills/tier1/index.js';
import type { Transform, Collider3D, NavMesh, NavGraph, NavAgent, Relation, Velocity } from '@engine/protocol/components.js';
import { hashSnapshot } from '@net/index.js';

const bake = navmeshBakeCapability.systems[0]!;
const navFollow = pathfindCapability.systems[0]!;
const motion = motionApplyCapability.systems[0]!;

function build(): World {
  const w = new World();
  w.addSystem(bake); w.addSystem(navFollow); w.addSystem(motion);
  w.createEntity('nav');
  w.addComponent('nav', { type: 'NavMesh', minX: -20, minZ: -20, maxX: 20, maxZ: 20, cellSize: 2, agentRadius: 1 } as NavMesh);
  return w;
}
function wall(w: World, id: string, x: number, z: number, hx: number, hz: number): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x, y: z, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(id, { type: 'Collider3D', kind: 'box', halfX: hx, halfY: 5, halfZ: hz } as Collider3D);
}
function agent(w: World, id: string, x: number, z: number, target: string): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x, y: z, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(id, { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
  w.addComponent(id, { type: 'NavAgent', speed: 1, arriveRange: 2, repathPeriod: 5 } as NavAgent);
  w.addComponent(id, { type: 'Relation', kind: 'target', targetId: target } as Relation);
}
const pos = (w: World, id: string): { x: number; z: number } => {
  const t = w.getComponent<Transform>(id, 'Transform')!;
  return { x: t.x, z: t.y };
};

describe('navmesh-bake + 主程 pathfind 端到端', () => {
  let world: World;
  beforeEach(() => { world = build(); });

  it('自动烘 NavGraph：栅格化障碍 → 写出节点/边（封格无节点）', () => {
    wall(world, 'wall', 0, 0, 2, 8);
    world.tick();
    const ng = world.getComponent<NavGraph>('nav', 'NavGraph');
    expect(ng).toBeTruthy();
    expect(ng!.nodes.length).toBeGreaterThan(0);
    expect(ng!.edges.length).toBeGreaterThan(0);
    expect(ng!.nodes.some((n) => Math.abs(n.x) < 2 && Math.abs(n.y) < 8)).toBe(false); // 墙处无航点
  });

  it('寻路碰撞：追兵沿自动生成的图绕墙到达目标·全程不穿墙', () => {
    wall(world, 'wall', 0, 0, 2, 8); // x[-2,2] z[-8,8] 隔开左右
    world.createEntity('prey');
    world.addComponent('prey', { type: 'Transform', x: 16, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    agent(world, 'a', -16, 0, 'prey');
    let penetrated = false;
    for (let i = 0; i < 240; i++) {
      world.tick();
      const p = pos(world, 'a');
      if (Math.abs(p.x) < 2 && Math.abs(p.z) < 8) penetrated = true;
    }
    expect(penetrated).toBe(false); // 「寻路碰撞」：从不穿墙
    const fin = pos(world, 'a');
    expect(Math.hypot(fin.x - 16, fin.z - 0)).toBeLessThan(4); // 绕墙到达目标附近
  });

  it('动态体不挡路：带 Velocity 的碰撞体不烘进图（玩家/追兵不在自己的导航上挖洞）', () => {
    wall(world, 'static', 12, 0, 2, 2);  // 静态障碍 → 封格
    // 动态体（有 Velocity）在 (-12,0)：不应封格。
    world.createEntity('mover');
    world.addComponent('mover', { type: 'Transform', x: -12, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    world.addComponent('mover', { type: 'Collider3D', kind: 'box', halfX: 2, halfY: 5, halfZ: 2 } as Collider3D);
    world.addComponent('mover', { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
    world.tick();
    const ng = world.getComponent<NavGraph>('nav', 'NavGraph')!;
    expect(ng.nodes.some((n) => Math.abs(n.x - 12) < 2 && Math.abs(n.y) < 2)).toBe(false); // 静态处无航点
    expect(ng.nodes.some((n) => Math.abs(n.x + 12) < 2 && Math.abs(n.y) < 2)).toBe(true);  // 动态体处仍有航点
  });

  it('共存：无 NavMesh → 不烘焙（用手摆 NavGraph 模式·navmesh-bake 不动）', () => {
    const w = new World();
    w.addSystem(bake);
    w.createEntity('hand');
    w.addComponent('hand', { type: 'NavGraph', nodes: [{ x: 0, y: 0 }], edges: [] } as NavGraph);
    w.tick();
    // 手摆图原样保留（没被烘焙覆盖：无 NavMesh）
    expect(w.getComponent<NavGraph>('hand', 'NavGraph')!.nodes.length).toBe(1);
  });

  it('确定性：两世界同步进·终态逐位一致（NavGraph + Transform 进 hash）', () => {
    const setup = (w: World): void => {
      wall(w, 'wall', 0, 0, 2, 8);
      w.createEntity('prey'); w.addComponent('prey', { type: 'Transform', x: 16, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
      agent(w, 'a', -16, 0, 'prey');
    };
    const w1 = build(); setup(w1);
    const w2 = build(); setup(w2);
    for (let i = 0; i < 40; i++) { w1.tick(); w2.tick(); }
    expect(hashSnapshot(w1.snapshot())).toBe(hashSnapshot(w2.snapshot()));
  });
});
