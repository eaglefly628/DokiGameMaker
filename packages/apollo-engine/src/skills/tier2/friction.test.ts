import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { SystemPhase } from '@engine/core/types.js';
import type { Velocity, Overlap } from '@engine/protocol/components.js';
import { frictionCapability } from './friction.js';

// ── 工厂函数 ─────────────────────────────────────────────────────

function worldWithFriction(): World {
  const w = new World();
  for (const s of frictionCapability.systems) w.addSystem(s);
  return w;
}

/** 创建有 Velocity 的动态实体 */
function addDyn(w: World, id: string, vx: number, vy: number): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Velocity', vx, vy, angular: 0 } as Velocity);
}

/** 创建无 Velocity 的静态实体 */
function addStatic(w: World, id: string): void {
  w.createEntity(id);
}

/** 手工挂 Overlap（法线 A→B） */
function addOverlap(w: World, a: string, b: string, normalX: number, normalY: number): void {
  const oid = `overlap:${a}:${b}`;
  w.createEntity(oid);
  w.addComponent(oid, {
    type: 'Overlap',
    entityA: a,
    entityB: b,
    normalX,
    normalY,
    depth: 1,
  } as Overlap);
}

function vel(w: World, id: string): Velocity {
  return w.getComponent<Velocity>(id, 'Velocity')!;
}

// ── 契约（capability metadata）──────────────────────────────────

describe('T2 friction — capability metadata（契约钉死）', () => {
  it('id / version / name', () => {
    expect(frictionCapability.id).toBe('t2-friction');
    expect(frictionCapability.version).toBe('1.0.0');
    expect(frictionCapability.describe.name).toBe('friction');
  });

  it('跑在 PostResolve 阶段', () => {
    expect(frictionCapability.systems[0].phase).toBe(SystemPhase.PostResolve);
  });

  it('reads Overlap+Velocity，writes Velocity，不 consume/provide', () => {
    expect(frictionCapability.components.provides).toEqual({});
    expect(frictionCapability.components.reads).toEqual(['Overlap', 'Velocity']);
    expect(frictionCapability.components.writes).toEqual(['Velocity']);
    expect(frictionCapability.components.consumes).toEqual([]);
  });
});

// ── 核心行为 ─────────────────────────────────────────────────────

describe('T2 friction — 水平地面切向衰减', () => {
  it('n=(0,1)、v=(10,0)：vx 衰减 20%（→8），vy 不变（→0）', () => {
    // 水平地面：法线指向 +Y，实体横向滑动
    const w = worldWithFriction();
    addDyn(w, 'slider', 10, 0);
    addStatic(w, 'ground');
    addOverlap(w, 'slider', 'ground', 0, 1); // normalX=0, normalY=1
    w.tick();

    const v = vel(w, 'slider');
    // vn = 10*0 + 0*1 = 0；vtx = 10 - 0*0 = 10；vty = 0 - 0*1 = 0
    // vx_new = 10 - 0.2*10 = 8；vy_new = 0 - 0.2*0 = 0
    expect(v.vx).toBeCloseTo(8);
    expect(v.vy).toBeCloseTo(0);
  });

  it('法向速度不被改动：v=(0,5)、n=(0,1) → vy 基本不变（纯法向）', () => {
    // 只有法向速度，切向为零，摩擦不应改变它
    const w = worldWithFriction();
    addDyn(w, 'dyn', 0, 5);
    addStatic(w, 'wall');
    addOverlap(w, 'dyn', 'wall', 0, 1);
    w.tick();

    const v = vel(w, 'dyn');
    // vn = 0*0 + 5*1 = 5；vtx = 0 - 5*0 = 0；vty = 5 - 5*1 = 0
    // vx_new = 0；vy_new = 5（法向不衰减）
    expect(v.vx).toBeCloseTo(0);
    expect(v.vy).toBeCloseTo(5);
  });
});

describe('T2 friction — 斜面切向分解', () => {
  it('n=(1,0)（垂直墙）、v=(0,10)：vx 不变，vy 衰减', () => {
    // 垂直墙面：法线指向 +X，实体沿墙向下滑
    const w = worldWithFriction();
    addDyn(w, 'dyn', 0, 10);
    addStatic(w, 'wall');
    addOverlap(w, 'dyn', 'wall', 1, 0); // normalX=1, normalY=0
    w.tick();

    const v = vel(w, 'dyn');
    // vn = 0*1 + 10*0 = 0；vtx = 0 - 0*1 = 0；vty = 10 - 0*0 = 10
    // vx_new = 0；vy_new = 10 - 0.2*10 = 8
    expect(v.vx).toBeCloseTo(0);
    expect(v.vy).toBeCloseTo(8);
  });

  it('斜面 n=(0.6,0.8)、v=(8,0)：切向正确衰减', () => {
    // 斜面法线，混合切向分量
    const w = worldWithFriction();
    const nx = 0.6;
    const ny = 0.8;
    addDyn(w, 'dyn', 8, 0);
    addStatic(w, 'slope');
    addOverlap(w, 'dyn', 'slope', nx, ny);
    w.tick();

    const v = vel(w, 'dyn');
    // vn = 8*0.6 + 0*0.8 = 4.8
    // vtx = 8 - 4.8*0.6 = 8 - 2.88 = 5.12；vty = 0 - 4.8*0.8 = -3.84
    // vx_new = 8 - 0.2*5.12 = 8 - 1.024 = 6.976
    // vy_new = 0 - 0.2*(-3.84) = 0.768
    expect(v.vx).toBeCloseTo(6.976);
    expect(v.vy).toBeCloseTo(0.768);
  });
});

describe('T2 friction — 静态体不处理', () => {
  it('B 方无 Velocity（静态）→ B 不受影响，A 正常衰减', () => {
    const w = worldWithFriction();
    addDyn(w, 'a', 10, 0);
    addStatic(w, 'b'); // 无 Velocity
    addOverlap(w, 'a', 'b', 0, 1);
    w.tick();

    expect(vel(w, 'a').vx).toBeCloseTo(8); // A 衰减
    expect(w.hasComponent('b', 'Velocity')).toBe(false); // B 没有 Velocity，未添加
  });

  it('A 方无 Velocity（静态）→ A 不处理，B 正常衰减', () => {
    const w = worldWithFriction();
    addStatic(w, 'a'); // 无 Velocity
    addDyn(w, 'b', 10, 0);
    addOverlap(w, 'a', 'b', 0, 1);
    w.tick();

    expect(w.hasComponent('a', 'Velocity')).toBe(false); // A 没有 Velocity
    expect(vel(w, 'b').vx).toBeCloseTo(8); // B 衰减
  });

  it('双方都有 Velocity（动态-动态）→ 各自独立衰减切向', () => {
    const w = worldWithFriction();
    addDyn(w, 'a', 10, 0);
    addDyn(w, 'b', -10, 0);
    addOverlap(w, 'a', 'b', 0, 1); // normalX=0, normalY=1
    w.tick();

    // 法线 (0,1)，两者的 vy=0，切向各为 vx=±10
    expect(vel(w, 'a').vx).toBeCloseTo(8);
    expect(vel(w, 'b').vx).toBeCloseTo(-8);
  });
});

describe('T2 friction — COEF 边界', () => {
  it('无接触时速度不变', () => {
    const w = worldWithFriction();
    addDyn(w, 'dyn', 10, 5);
    // 没有 Overlap 实体
    w.tick();

    const v = vel(w, 'dyn');
    expect(v.vx).toBeCloseTo(10);
    expect(v.vy).toBeCloseTo(5);
  });

  it('v=(0,0)：静止体不产生额外速度', () => {
    const w = worldWithFriction();
    addDyn(w, 'dyn', 0, 0);
    addStatic(w, 'floor');
    addOverlap(w, 'dyn', 'floor', 0, 1);
    w.tick();

    const v = vel(w, 'dyn');
    expect(v.vx).toBeCloseTo(0);
    expect(v.vy).toBeCloseTo(0);
  });

  it('多帧累积：速度逐帧按 (1-COEF)^n 衰减', () => {
    const w = worldWithFriction();
    addDyn(w, 'dyn', 10, 0);
    addStatic(w, 'floor');
    addOverlap(w, 'dyn', 'floor', 0, 1);

    // n 帧后 vx ≈ 10 * 0.8^n
    for (let i = 0; i < 5; i++) w.tick();
    expect(vel(w, 'dyn').vx).toBeCloseTo(10 * Math.pow(0.8, 5));
  });
});
