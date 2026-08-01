// 真物理刚体（cannon-es·render-only 表现·非同步）：重力下落 + 落地不穿地 + render-only 不进 hash。
import { describe, it, expect, beforeAll } from 'vitest';
import { PhysicsSystem, preloadPhysics } from './physics.js';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/index.js';
import type { RigidBody3D, Transform3D, Mesh3D, Impulse3D, Joint3D } from '@engine/protocol/components.js';

describe('PhysicsSystem：真物理刚体（cannon-es·render-only 表现）', () => {
  beforeAll(async () => { await preloadPhysics(); }); // cannon-es 懒加载 → 测试先预载，首帧即可步进
  it('刚体在重力下下落 → 落地停在地面之上（不穿地）+ 写四元数', () => {
    const w = new World();
    w.createEntity('d');
    w.addComponent('d', { type: 'Transform3D', x: 0, y: 20, z: 0 } as Transform3D);
    w.addComponent('d', { type: 'Mesh3D', shape: 'box', width: 4, height: 4, depth: 4, frontTint: 0xffffff } as Mesh3D);
    w.addComponent('d', { type: 'RigidBody3D', shape: 'box', mass: 1 } as RigidBody3D);
    const phys = new PhysicsSystem();
    const t = (): Transform3D => w.getComponent<Transform3D>('d', 'Transform3D')!;
    const y0 = t().y;
    for (let i = 1; i <= 10; i++) phys.sync(w, i * 16.7);
    expect(t().y).toBeLessThan(y0); // 下落了
    for (let i = 11; i <= 240; i++) phys.sync(w, i * 16.7);
    expect(t().y).toBeGreaterThan(1.0); // 盒半高 2·没穿地
    expect(t().y).toBeLessThan(3.5); // 停在地面附近
    expect(t().quat).toBeTruthy(); // 写了四元数
    phys.dispose();
  });

  it('cylinder 碰撞形（桶/冰球）：下落落地不穿地', () => {
    const w = new World();
    w.createEntity('cyl');
    w.addComponent('cyl', { type: 'Transform3D', x: 0, y: 18, z: 0 } as Transform3D);
    w.addComponent('cyl', { type: 'Mesh3D', shape: 'cylinder', width: 4, height: 3, frontTint: 0xffffff } as Mesh3D);
    w.addComponent('cyl', { type: 'RigidBody3D', shape: 'cylinder', mass: 1 } as RigidBody3D);
    const phys = new PhysicsSystem();
    const t = (): Transform3D => w.getComponent<Transform3D>('cyl', 'Transform3D')!;
    for (let i = 1; i <= 240; i++) phys.sync(w, i * 16.7);
    expect(t().y).toBeGreaterThan(0.3); // 落地·没穿地（高 3·半高 1.5 左右稳住）
    expect(t().y).toBeLessThan(6);
    phys.dispose();
  });

  it('angularFactor 锁转轴（[0,1,0]）：薄圆盘带 X 翻滚初速也永不立边（只准平旋）', () => {
    const w = new World();
    w.createEntity('disc');
    w.addComponent('disc', { type: 'Transform3D', x: 0, y: 10, z: 0 } as Transform3D);
    w.addComponent('disc', { type: 'Mesh3D', shape: 'cylinder', width: 6, height: 0.6, frontTint: 0xffffff } as Mesh3D); // 薄圆盘（筹码）
    // 给 X 翻滚初速（本会立起/翻倒）+ angularFactor 锁 X/Z → 只准绕 Y 平旋
    w.addComponent('disc', { type: 'RigidBody3D', shape: 'cylinder', mass: 1, avx: 8, avy: 3, angularFactor: [0, 1, 0] } as RigidBody3D);
    const phys = new PhysicsSystem();
    const t = (): Transform3D => w.getComponent<Transform3D>('disc', 'Transform3D')!;
    for (let i = 1; i <= 240; i++) phys.sync(w, i * 16.7);
    const q = t().quat!; // [x,y,z,w]·orientation
    // 锁 X/Z → 姿态只含 Y 轴旋转 → quat 的 x、z 分量恒 ≈0（永远平躺·不立边）
    expect(Math.abs(q[0])).toBeLessThan(0.02); // 无 X 翻
    expect(Math.abs(q[2])).toBeLessThan(0.02); // 无 Z 翻
    // 上向量 up=q·(0,1,0) 的 y 分量 ≈1（盘面朝上·彻底平）
    const upY = 1 - 2 * (q[0] * q[0] + q[2] * q[2]);
    expect(upY).toBeGreaterThan(0.999);
    phys.dispose();
  });

  it('capsule 碰撞形（角色）：下落立地不穿地', () => {
    const w = new World();
    w.createEntity('cap');
    w.addComponent('cap', { type: 'Transform3D', x: 0, y: 20, z: 0 } as Transform3D);
    w.addComponent('cap', { type: 'Mesh3D', shape: 'capsule', width: 2, height: 5, frontTint: 0xffffff } as Mesh3D);
    w.addComponent('cap', { type: 'RigidBody3D', shape: 'capsule', mass: 1 } as RigidBody3D);
    const phys = new PhysicsSystem();
    const t = (): Transform3D => w.getComponent<Transform3D>('cap', 'Transform3D')!;
    for (let i = 1; i <= 240; i++) phys.sync(w, i * 16.7);
    expect(t().y).toBeGreaterThan(0.8); // 底半球坐地·没穿地（半径 1）
    expect(t().y).toBeLessThan(4);
    phys.dispose();
  });

  it('heightfield 地形（静态·恒 mass0）：球落在抬高的地形上·高于基础地面', () => {
    const w = new World();
    w.createEntity('terrain');
    w.addComponent('terrain', { type: 'Transform3D', x: 0, y: 0, z: 0 } as Transform3D);
    const heights = [[5, 5, 5, 5], [5, 5, 5, 5], [5, 5, 5, 5], [5, 5, 5, 5]]; // 平抬高台 y=5
    w.addComponent('terrain', { type: 'RigidBody3D', shape: 'heightfield', mass: 3, heights, elementSize: 4 } as RigidBody3D); // mass 给了也强制静态
    w.createEntity('ball');
    w.addComponent('ball', { type: 'Transform3D', x: 6, y: 20, z: -6 } as Transform3D); // 落在地形网格足迹内（世界 x∈[0,12]·z∈[0,-12]）
    w.addComponent('ball', { type: 'Mesh3D', shape: 'sphere', width: 2, height: 2, frontTint: 0xffffff } as Mesh3D);
    w.addComponent('ball', { type: 'RigidBody3D', shape: 'sphere', mass: 1 } as RigidBody3D);
    const phys = new PhysicsSystem();
    const tb = (): Transform3D => w.getComponent<Transform3D>('ball', 'Transform3D')!;
    for (let i = 1; i <= 300; i++) phys.sync(w, i * 16.7);
    expect(tb().y).toBeGreaterThan(4); // 停在抬高地形(5)之上·而非落到基础地面(y≈1)
    phys.dispose();
  });

  it('convex 凸包（不规则道具）：由 hull 顶点算凸面·下落立地不穿地', () => {
    const w = new World();
    w.createEntity('rock');
    w.addComponent('rock', { type: 'Transform3D', x: 0, y: 20, z: 0 } as Transform3D);
    // 立方体 8 角 → 凸包 = 2×2×2 盒
    const hull: Array<[number, number, number]> = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ];
    w.addComponent('rock', { type: 'RigidBody3D', shape: 'convex', mass: 1, hull } as RigidBody3D);
    const phys = new PhysicsSystem();
    const t = (): Transform3D => w.getComponent<Transform3D>('rock', 'Transform3D')!;
    for (let i = 1; i <= 240; i++) phys.sync(w, i * 16.7);
    expect(t().y).toBeGreaterThan(0.5); // 凸包坐地·没穿地（半高 1）
    expect(t().y).toBeLessThan(3);
    phys.dispose();
  });

  it('无刚体时 sync 返回 0（不建物理世界）；有则返回刚体数', () => {
    const w = new World();
    const phys = new PhysicsSystem();
    expect(phys.sync(w, 16)).toBe(0);
    w.createEntity('d');
    w.addComponent('d', { type: 'Transform3D', x: 0, y: 10, z: 0 } as Transform3D);
    w.addComponent('d', { type: 'RigidBody3D', shape: 'box', mass: 1 } as RigidBody3D);
    expect(phys.sync(w, 32)).toBe(1);
    phys.dispose();
  });

  it('Impulse3D 数据触发施力：bump trigger → 施一次冲量（水平速度起来）·同 trigger 不重复施', () => {
    const w = new World();
    w.createEntity('ball');
    w.addComponent('ball', { type: 'Transform3D', x: 0, y: 3, z: 0 } as Transform3D);
    w.addComponent('ball', { type: 'Mesh3D', shape: 'sphere', width: 2, height: 2, frontTint: 0xffffff } as Mesh3D);
    w.addComponent('ball', { type: 'RigidBody3D', shape: 'sphere', mass: 1 } as RigidBody3D);
    w.addComponent('ball', { type: 'Impulse3D', trigger: 0, x: 0, y: 0, z: 0 } as Impulse3D);
    const phys = new PhysicsSystem();
    const t = (): Transform3D => w.getComponent<Transform3D>('ball', 'Transform3D')!;
    for (let i = 1; i <= 5; i++) phys.sync(w, i * 16.7); // 落到地面稳住
    const xBefore = t().x;
    // bump trigger + 水平冲量 → 球被弹向 +X
    const imp = w.getComponent<Impulse3D>('ball', 'Impulse3D')!;
    (imp as { trigger: number; x: number }).trigger = 1;
    (imp as { trigger: number; x: number }).x = 12;
    for (let i = 6; i <= 30; i++) phys.sync(w, i * 16.7);
    const xAfter = t().x;
    expect(xAfter).toBeGreaterThan(xBefore + 1); // 冲量把球推向 +X
    // 同 trigger 不再施力：记录位移趋势后再跑若干帧不应有新的突跃（仅惯性/摩擦）
    const xMid = t().x;
    for (let i = 31; i <= 45; i++) phys.sync(w, i * 16.7);
    expect(t().x).toBeGreaterThanOrEqual(xMid - 0.01); // 未反向突变（没被重复反复施力乱套）
    phys.dispose();
  });

  it('Impulse3D 首见基线：静态带 trigger 的场景装载不自射（出生初速用 vx）', () => {
    const w = new World();
    w.createEntity('ball');
    w.addComponent('ball', { type: 'Transform3D', x: 0, y: 3, z: 0 } as Transform3D);
    w.addComponent('ball', { type: 'Mesh3D', shape: 'sphere', width: 2, height: 2, frontTint: 0xffffff } as Mesh3D);
    w.addComponent('ball', { type: 'RigidBody3D', shape: 'sphere', mass: 1 } as RigidBody3D);
    w.addComponent('ball', { type: 'Impulse3D', trigger: 5, x: 20, y: 0, z: 0 } as Impulse3D); // 静态非零冲量·trigger 从未 bump
    const phys = new PhysicsSystem();
    const t = (): Transform3D => w.getComponent<Transform3D>('ball', 'Transform3D')!;
    for (let i = 1; i <= 30; i++) phys.sync(w, i * 16.7);
    expect(Math.abs(t().x)).toBeLessThan(0.5); // 没被水平弹出（首见=基线·不施力）
    phys.dispose();
  });

  it('applyImpulse 命令式接口（输入胶水甩球）：直接对刚体施冲量', () => {
    const w = new World();
    w.createEntity('b');
    w.addComponent('b', { type: 'Transform3D', x: 0, y: 3, z: 0 } as Transform3D);
    w.addComponent('b', { type: 'Mesh3D', shape: 'sphere', width: 2, height: 2, frontTint: 0xffffff } as Mesh3D);
    w.addComponent('b', { type: 'RigidBody3D', shape: 'sphere', mass: 1 } as RigidBody3D);
    const phys = new PhysicsSystem();
    const t = (): Transform3D => w.getComponent<Transform3D>('b', 'Transform3D')!;
    for (let i = 1; i <= 5; i++) phys.sync(w, i * 16.7);
    const zBefore = t().z;
    phys.applyImpulse('b', 0, 0, 14); // 命令式：沿 +Z 弹
    for (let i = 6; i <= 30; i++) phys.sync(w, i * 16.7);
    expect(t().z).toBeGreaterThan(zBefore + 1);
    phys.dispose();
  });

  it('Joint3D point 约束：本体连接点锁定在世界锚（球铰·抗重力不掉落）', () => {
    const w = new World();
    w.createEntity('bob');
    w.addComponent('bob', { type: 'Transform3D', x: 0, y: 12, z: 0 } as Transform3D);
    w.addComponent('bob', { type: 'Mesh3D', shape: 'sphere', width: 2, height: 2, frontTint: 0xffffff } as Mesh3D);
    w.addComponent('bob', { type: 'RigidBody3D', shape: 'sphere', mass: 1 } as RigidBody3D);
    w.addComponent('bob', { type: 'Joint3D', kind: 'point', anchor: [0, 12, 0] } as Joint3D); // 中心 pivot 钉到 (0,12,0)
    const phys = new PhysicsSystem();
    const t = (): Transform3D => w.getComponent<Transform3D>('bob', 'Transform3D')!;
    for (let i = 1; i <= 120; i++) phys.sync(w, i * 16.7);
    // point 约束把连接点(球心)锁在锚 → 抗重力·不掉落（球心始终 ≈ 锚·可自由转）
    expect(Math.hypot(t().x - 0, t().y - 12, t().z - 0)).toBeLessThan(1);
    phys.dispose();
  });

  it('Joint3D distance 约束（连杆）：两刚体保持定距', () => {
    const w = new World();
    w.createEntity('a'); w.createEntity('b');
    w.addComponent('a', { type: 'Transform3D', x: 0, y: 15, z: 0 } as Transform3D);
    w.addComponent('a', { type: 'Mesh3D', shape: 'sphere', width: 2, height: 2, frontTint: 0xffffff } as Mesh3D);
    w.addComponent('a', { type: 'RigidBody3D', shape: 'sphere', mass: 0 } as RigidBody3D); // 静态锚（mass0）
    w.addComponent('b', { type: 'Transform3D', x: 5, y: 15, z: 0 } as Transform3D);
    w.addComponent('b', { type: 'Mesh3D', shape: 'sphere', width: 2, height: 2, frontTint: 0xffffff } as Mesh3D);
    w.addComponent('b', { type: 'RigidBody3D', shape: 'sphere', mass: 1 } as RigidBody3D);
    w.addComponent('b', { type: 'Joint3D', kind: 'distance', bodyB: 'a', distance: 5 } as Joint3D);
    const phys = new PhysicsSystem();
    const tb = (): Transform3D => w.getComponent<Transform3D>('b', 'Transform3D')!;
    for (let i = 1; i <= 120; i++) phys.sync(w, i * 16.7);
    const ta = w.getComponent<Transform3D>('a', 'Transform3D')!;
    const d = Math.hypot(tb().x - ta.x, tb().y - ta.y, tb().z - ta.z);
    expect(d).toBeGreaterThan(4); expect(d).toBeLessThan(6.5); // 保持定距 ~5（连杆·b 绕 a 摆但距离锁定）
    phys.dispose();
  });

  it('Joint3D 端点实体消失 → 拆约束不崩（悬垂引用防护）', () => {
    const w = new World();
    w.createEntity('a'); w.createEntity('b');
    for (const id of ['a', 'b']) {
      w.addComponent(id, { type: 'Transform3D', x: id === 'a' ? 0 : 4, y: 12, z: 0 } as Transform3D);
      w.addComponent(id, { type: 'Mesh3D', shape: 'sphere', width: 2, height: 2, frontTint: 0xffffff } as Mesh3D);
      w.addComponent(id, { type: 'RigidBody3D', shape: 'sphere', mass: id === 'a' ? 0 : 1 } as RigidBody3D);
    }
    w.addComponent('b', { type: 'Joint3D', kind: 'point', bodyB: 'a' } as Joint3D);
    const phys = new PhysicsSystem();
    phys.sync(w, 16.7);
    w.destroyEntity('a'); // 锚实体消失 → 约束须拆
    expect(() => { for (let i = 2; i <= 10; i++) phys.sync(w, i * 16.7); }).not.toThrow();
    phys.dispose();
  });

  it('roll 重落：静态体（mass0 围栏/地台）不被甩飞·动态体才重落', () => {
    const w = new World();
    // 静态围栏（mass0·坐地 y=3）
    w.createEntity('wall');
    w.addComponent('wall', { type: 'Transform3D', x: 10, y: 3, z: 0 } as Transform3D);
    w.addComponent('wall', { type: 'Mesh3D', shape: 'box', width: 2, height: 6, depth: 20, frontTint: 0xffffff } as Mesh3D);
    w.addComponent('wall', { type: 'RigidBody3D', shape: 'box', mass: 0 } as RigidBody3D);
    // 动态方块（mass1·已落地）
    w.createEntity('blk');
    w.addComponent('blk', { type: 'Transform3D', x: 0, y: 8, z: 0 } as Transform3D);
    w.addComponent('blk', { type: 'Mesh3D', shape: 'box', width: 4, height: 4, depth: 4, frontTint: 0xffffff } as Mesh3D);
    w.addComponent('blk', { type: 'RigidBody3D', shape: 'box', mass: 1 } as RigidBody3D);
    const phys = new PhysicsSystem();
    const wallT = (): Transform3D => w.getComponent<Transform3D>('wall', 'Transform3D')!;
    const blkT = (): Transform3D => w.getComponent<Transform3D>('blk', 'Transform3D')!;
    for (let i = 1; i <= 180; i++) phys.sync(w, i * 16.7); // 落定
    const wallY = wallT().y, blkYSettled = blkT().y;
    expect(wallY).toBeCloseTo(3, 1); // 静态墙固定在 y=3
    phys.roll(w); // 重落
    for (let i = 181; i <= 200; i++) phys.sync(w, i * 16.7);
    expect(wallT().y).toBeCloseTo(3, 1); // 墙仍在 y=3（未被甩飞）
    expect(blkT().y).toBeGreaterThan(blkYSettled + 2); // 动态块被抬起重落（升到高处）
    phys.dispose();
  });

  it('RigidBody3D + Transform3D（含 quat）是 render-only（不进 hash）', () => {
    const w = new World();
    w.createEntity('d');
    const h0 = hashSnapshot(w.snapshot());
    w.addComponent('d', { type: 'RigidBody3D', shape: 'box', mass: 1, avx: 5 } as RigidBody3D);
    expect(hashSnapshot(w.snapshot())).toBe(h0); // RigidBody3D 不进 hash
    w.addComponent('d', { type: 'Transform3D', x: 0, y: 5, z: 0, quat: [0, 0, 0, 1] } as Transform3D);
    expect(hashSnapshot(w.snapshot())).toBe(h0); // Transform3D 整体 render-only
  });
});
