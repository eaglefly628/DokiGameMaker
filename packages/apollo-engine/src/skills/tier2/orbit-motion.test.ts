import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Orbit, Transform } from '@engine/protocol/components.js';
import { orbitMotionCapability, orbitAt } from './orbit-motion.js';
import { motionApplyCapability, hierarchyResolveCapability, hierarchyCascadeCapability } from '@skills/tier1/index.js';
import { cameraFollowCapability, boundsClampCapability } from '@skills/tier2/index.js';

// orbit-motion 圆周运动测试（REQ-SURVIVOR护盾绕转·VBUG-02）。运行时零 sin/cos·rotor 状态·确定性。
const xf = (x: number, y: number): Transform => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const pos = (w: World, e: string): Transform => w.getComponent<Transform>(e, 'Transform')!;
const dist = (w: World, e: string, cx: number, cy: number): number => { const t = pos(w, e); return Math.hypot(t.x - cx, t.y - cy); };

function world(): World {
  const w = new World();
  for (const s of orbitMotionCapability.systems) w.addSystem(s);
  return w;
}
function orbiter(w: World, id: string, o: Omit<Orbit, 'type'>): void {
  w.createEntity(id);
  w.addComponent(id, xf(0, 0));
  w.addComponent(id, { type: 'Orbit', ...o } as Orbit);
}

describe('orbit-motion — 元数据', () => {
  it('id + runsAfter motion-apply', () => {
    expect(orbitMotionCapability.id).toBe('t2-orbit-motion');
    expect(orbitMotionCapability.systems[0].runsAfter).toContain('motion-apply');
  });
});

describe('orbit-motion — 绕原点', () => {
  it('起始角 0·半径 40 → 首 tick 落在圆上、半径守恒', () => {
    const w = world();
    orbiter(w, 'o', orbitAt(40, 0, 0.05)); // 绕原点
    w.tick();
    expect(dist(w, 'o', 0, 0)).toBeCloseTo(40, 6); // 始终在半径 40 的圆上
  });

  it('匀速环绕：多 tick 后角度推进（位置变化）且半径不漂移', () => {
    const w = world();
    orbiter(w, 'o', orbitAt(40, 0, 0.05));
    w.tick();
    const p1 = { x: pos(w, 'o').x, y: pos(w, 'o').y };
    for (let i = 0; i < 100; i++) w.tick();
    const p2 = pos(w, 'o');
    expect(p2.x === p1.x && p2.y === p1.y).toBe(false); // 动了
    expect(dist(w, 'o', 0, 0)).toBeCloseTo(40, 4); // 100+ tick 后半径仍≈40（rotor+归一防漂）
  });

  it('sinStep 符号 → 转向（逆/顺时针）', () => {
    const ccw = world(); orbiter(ccw, 'o', orbitAt(40, 0, 0.1)); ccw.tick();
    const cw = world(); orbiter(cw, 'o', orbitAt(40, 0, -0.1)); cw.tick();
    expect(pos(ccw, 'o').y).toBeGreaterThan(0); // 逆时针：从 (40,0) 起 y 增
    expect(pos(cw, 'o').y).toBeLessThan(0); // 顺时针：y 减
  });
});

describe('orbit-motion — 绕 centerId（跟随移动的圆心）', () => {
  it('圆心移动 → 环绕中心随之平移', () => {
    const w = world();
    w.createEntity('hub');
    w.addComponent('hub', xf(100, 100));
    orbiter(w, 'o', orbitAt(30, 0, 0.05, 'hub'));
    w.tick();
    expect(dist(w, 'o', 100, 100)).toBeCloseTo(30, 6); // 绕 hub
    // 移动 hub → 环绕点跟随
    pos(w, 'hub').x = 200;
    w.tick();
    expect(dist(w, 'o', 200, 100)).toBeCloseTo(30, 6);
  });

  it('圆心实体缺失 → 保持原位（不崩）', () => {
    const w = world();
    orbiter(w, 'o', orbitAt(30, 0, 0.05, 'ghost')); // 无 'ghost' 实体
    pos(w, 'o').x = 7; pos(w, 'o').y = 9;
    w.tick();
    expect(pos(w, 'o').x).toBe(7); // 未动
    expect(pos(w, 'o').y).toBe(9);
  });
});

describe('orbit-motion — 双球对位 + 确定性', () => {
  it('相位差 180° 两球始终对绕（位置互为反向）', () => {
    const w = world();
    orbiter(w, 'a', orbitAt(40, 0, 0.07));
    orbiter(w, 'b', orbitAt(40, Math.PI, 0.07));
    for (let i = 0; i < 10; i++) w.tick();
    const a = pos(w, 'a');
    const b = pos(w, 'b');
    expect(a.x).toBeCloseTo(-b.x, 4);
    expect(a.y).toBeCloseTo(-b.y, 4);
  });

  it('同布局两次 → 同轨迹（确定性·无随机/墙钟）', () => {
    const run = (): string => {
      const w = world();
      orbiter(w, 'a', orbitAt(40, 0, 0.05));
      orbiter(w, 'b', orbitAt(25, 1, -0.08, undefined));
      for (let i = 0; i < 30; i++) w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});

describe('orbit-motion — 调度定序（首个消费者 game-103 撞环回归）', () => {
  it('与 motion-apply/hierarchy-resolve/hierarchy-cascade/camera-follow/bounds-clamp 同装不成环·可 tick', () => {
    // 复现 PE-103 报的「装一起拓扑成环→蓝图 load 不了」：全部读写 Transform 的系统 + orbit 同装。
    const w = new World();
    for (const cap of [
      motionApplyCapability, hierarchyResolveCapability, hierarchyCascadeCapability,
      cameraFollowCapability, boundsClampCapability, orbitMotionCapability,
    ]) for (const s of cap.systems) w.addSystem(s);
    w.createEntity('player');
    w.addComponent('player', xf(0, 0));
    w.addComponent('player', { type: 'Velocity', vx: 1, vy: 0, angular: 0 } as never);
    orbiter(w, 'shield', orbitAt(40, 0, 0.05, 'player'));
    // 成环则调度器在 tick 时抛错；这里断言可连跑不抛 + orbit 仍绕 player。
    expect(() => { for (let i = 0; i < 5; i++) w.tick(); }).not.toThrow();
    const p = pos(w, 'player');
    expect(Math.hypot(pos(w, 'shield').x - p.x, pos(w, 'shield').y - p.y)).toBeCloseTo(40, 4);
  });
});

describe('orbit-motion — orbitAt 助手', () => {
  it('算出 dir/step 常量（起始角 0 → dir=(1,0)）', () => {
    const o = orbitAt(50, 0, 0.05, 'player');
    expect(o.centerId).toBe('player');
    expect(o.radius).toBe(50);
    expect(o.dirX).toBeCloseTo(1, 9);
    expect(o.dirY).toBeCloseTo(0, 9);
    expect(o.cosStep).toBeCloseTo(Math.cos(0.05), 9);
    expect(o.sinStep).toBeCloseTo(Math.sin(0.05), 9);
  });
  it('省 centerId → 无该字段（绕原点）', () => {
    const o = orbitAt(50, 0, 0.05);
    expect('centerId' in o).toBe(false);
  });
});
