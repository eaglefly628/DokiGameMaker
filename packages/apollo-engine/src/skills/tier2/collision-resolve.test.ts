import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { SystemPhase } from '@engine/core/types.js';
import type { Transform, Velocity, Shape, Acceleration, Mass, Overlap } from '@engine/protocol/components.js';
import { collisionResolveCapability } from './collision-resolve.js';
import { overlapDetectCapability } from '@atom-skills/index.js';
import { accelApplyCapability, motionApplyCapability } from '../tier1/index.js';

// 动态 box（有 Velocity）；mass 可选；static=true 则无 Velocity。
function addBox(w: World, id: string, x: number, y: number, opts: { vx?: number; vy?: number; mass?: number; static?: boolean } = {}): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(id, { type: 'Shape', kind: 'box', width: 20, height: 20 } as Shape);
  if (!opts.static) w.addComponent(id, { type: 'Velocity', vx: opts.vx ?? 0, vy: opts.vy ?? 0, angular: 0 } as Velocity);
  if (opts.mass !== undefined) w.addComponent(id, { type: 'Mass', value: opts.mass } as Mass);
}
const TX = (w: World, id: string): number => w.getComponent<Transform>(id, 'Transform')!.x;
const TY = (w: World, id: string): number => w.getComponent<Transform>(id, 'Transform')!.y;
function withSolver(): World {
  const w = new World();
  for (const s of collisionResolveCapability.systems) w.addSystem(s);
  return w;
}
function manualOverlap(w: World, a: string, b: string): void {
  const oid = `overlap:${a}:${b}`;
  w.createEntity(oid);
  w.addComponent(oid, { type: 'Overlap', entityA: a, entityB: b, normalX: 0, normalY: 0, depth: 0 } as Overlap); // 求解器自行重算几何
}

describe('T2 collision-resolve — capability metadata（契约钉死）', () => {
  it('id / version / 跑在 Resolve 阶段', () => {
    expect(collisionResolveCapability.id).toBe('t2-collision-resolve');
    expect(collisionResolveCapability.version).toBe('1.0.0');
    expect(collisionResolveCapability.systems[0].phase).toBe(SystemPhase.Resolve);
  });

  it('读 Overlap+Transform+Shape+Velocity+Mass，写 Transform+Velocity，不 consume/provide', () => {
    expect(collisionResolveCapability.components.provides).toEqual({});
    expect(collisionResolveCapability.components.reads).toEqual(['Overlap', 'Transform', 'Shape', 'Velocity', 'Mass', 'Sensor']);
    expect(collisionResolveCapability.components.writes).toEqual(['Transform', 'Velocity']);
    expect(collisionResolveCapability.components.consumes).toEqual([]);
  });
});

describe('T2 collision-resolve — REQ-002 sensor 非实心', () => {
  it('任一方挂 Sensor → 跳过物理解算（玩家能站进触发区，位置不被推开）', () => {
    const w = withSolver();
    addBox(w, 'player', 100, 195, { vy: 8 }); // 与 switch 重叠
    addBox(w, 'switch', 100, 210, { static: true });
    w.addComponent('switch', { type: 'Sensor' }); // 开关=非实心
    manualOverlap(w, 'player', 'switch');
    const before = TY(w, 'player');
    w.tick();
    expect(TY(w, 'player')).toBe(before); // 未被推开
    expect(w.getComponent<Velocity>('player', 'Velocity')!.vy).toBe(8); // 侵入速度也不清
  });

  it('无 Sensor → 照常推开（对照）', () => {
    const w = withSolver();
    addBox(w, 'player', 100, 195, { vy: 8 });
    addBox(w, 'wall', 100, 210, { static: true });
    manualOverlap(w, 'player', 'wall');
    w.tick();
    expect(TY(w, 'player')).toBeLessThan(195); // 被推出
  });
});

describe('T2 collision-resolve — behavior', () => {
  it('动态体推出静态体，并清零朝法线的侵入速度', () => {
    const w = withSolver();
    addBox(w, 'dyn', 100, 195, { vy: 8 }); // 半高 10，spans 185..205
    addBox(w, 'wall', 100, 210, { static: true }); // spans 200..220 → 与 dyn 重叠 5
    manualOverlap(w, 'dyn', 'wall');
    w.tick();
    expect(TY(w, 'dyn')).toBeCloseTo(190); // 195 - 穿透 5，被推出到接触
    expect(w.getComponent<Velocity>('dyn', 'Velocity')!.vy).toBeCloseTo(0); // 朝下侵入速度清零
    expect(TY(w, 'wall')).toBe(210); // 静态体不动
  });

  it('逆质量分摊：重的少动、轻的多动（位移比 = 质量比）', () => {
    const w = withSolver();
    addBox(w, 'heavy', 115, 100, { mass: 3 }); // invMass 1/3
    addBox(w, 'light', 100, 100, { mass: 1 }); // invMass 1；与 heavy 水平重叠 5
    manualOverlap(w, 'heavy', 'light');
    w.tick();
    const dHeavy = TX(w, 'heavy') - 115; // 向右
    const dLight = 100 - TX(w, 'light'); // 向左
    expect(dHeavy).toBeCloseTo(1.25); // 5 * (invHeavy/(invHeavy+invLight)) = 5 * (1/3)/(4/3)
    expect(dLight).toBeCloseTo(3.75); // 5 * 1/(4/3)
    expect(dLight / dHeavy).toBeCloseTo(3); // = 质量比
  });

  it('等质量：对称分离', () => {
    const w = withSolver();
    addBox(w, 'p', 100, 100); // 默认单位质量
    addBox(w, 'q', 115, 100);
    manualOverlap(w, 'p', 'q');
    w.tick();
    expect(100 - TX(w, 'p')).toBeCloseTo(2.5); // 各推一半
    expect(TX(w, 'q') - 115).toBeCloseTo(2.5);
  });
});

describe('T2 涌现：accel ⊕ motion ⊕ overlap-detect ⊕ collision-resolve = 落在地面上', () => {
  it('重力下落的方块被静态地面接住，停在地面之上（phase 让管线不成环）', () => {
    const w = new World();
    for (const s of collisionResolveCapability.systems) w.addSystem(s);
    for (const s of overlapDetectCapability.systems) w.addSystem(s);
    for (const s of motionApplyCapability.systems) w.addSystem(s);
    for (const s of accelApplyCapability.systems) w.addSystem(s);

    const order = w.getSortedSystems().map((s) => s.id);
    expect(order.indexOf('overlap-detect')).toBeLessThan(order.indexOf('collision-resolve'));
    expect(order[order.length - 1]).toBe('collision-resolve');

    addBox(w, 'player', 100, 150, {}); // 动态方块
    w.addComponent('player', { type: 'Acceleration', ax: 0, ay: 2 } as Acceleration);
    // 地面：静态方块 200×20，中心 y=200（顶边 190）。
    w.createEntity('ground');
    w.addComponent('ground', { type: 'Transform', x: 100, y: 200, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('ground', { type: 'Shape', kind: 'box', width: 200, height: 20 } as Shape);

    for (let i = 0; i < 20; i++) w.tick();

    expect(TY(w, 'player')).toBe(180); // 半高 10 + 地面顶边 190
    expect(w.getComponent<Velocity>('player', 'Velocity')!.vy).toBe(0);
    expect(TY(w, 'player')).toBeLessThan(200);
    expect(TY(w, 'ground')).toBe(200);
  });
});
