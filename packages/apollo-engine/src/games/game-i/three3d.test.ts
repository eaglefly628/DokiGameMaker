// 3D 能力展台蓝图：纯数据加载 + tick 不抛；nav 蓝图真能寻路（追兵被 pathfind 写出位移）；粒子真生成。
import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import { light3dBlueprint, post3dBlueprint, nav3dBlueprint, collide3dBlueprint, particle3dBlueprint, text3dBlueprint, ao3dBlueprint, vfx3dBlueprint, material3dBlueprint, fog3dBlueprint, pointlight3dBlueprint, surface3dBlueprint, model3dBlueprint, primitives3dBlueprint, worldui3dBlueprint, toon3dBlueprint, billboard3dBlueprint, path3dBlueprint, spring3dBlueprint } from './three3d.js';

function run(bp: ReturnType<typeof light3dBlueprint>, ticks: number): Engine {
  const e = new Engine();
  e.load(bp);
  for (let i = 0; i < ticks; i++) e.world.tick();
  return e;
}

describe('Game I · 3D 能力展台蓝图', () => {
  it('十九个蓝图都纯数据加载 + 长跑 tick 不抛错', () => {
    for (const bp of [light3dBlueprint, post3dBlueprint, nav3dBlueprint, collide3dBlueprint, particle3dBlueprint, text3dBlueprint, ao3dBlueprint, vfx3dBlueprint, material3dBlueprint, fog3dBlueprint, pointlight3dBlueprint, surface3dBlueprint, model3dBlueprint, primitives3dBlueprint, worldui3dBlueprint, toon3dBlueprint, billboard3dBlueprint, path3dBlueprint, spring3dBlueprint]) {
      expect(() => run(bp(), 120)).not.toThrow();
    }
  });

  it('现场调参台（REQ-DEMO-调参台）：tune 档改蓝图数据（Light3D 强度 / Camera3D 距 / Fog3D 浓度）·缺省零变', () => {
    const comp = <T>(bp: ReturnType<typeof light3dBlueprint>, ent: string, type: string): T => {
      const e = new Engine(); e.load(bp); return e.world.getComponent(ent, type) as unknown as T;
    };
    const sun = (bp: ReturnType<typeof light3dBlueprint>): number => comp<{ intensity: number }>(bp, 'sun', 'Light3D').intensity;
    // 主光强度 弱/中/强 单调递增；缺省=中档（老口径不变）。
    expect(sun(light3dBlueprint({ 'l.sun': 'low' }))).toBeLessThan(sun(light3dBlueprint({})));
    expect(sun(light3dBlueprint({ 'l.sun': 'high' }))).toBeGreaterThan(sun(light3dBlueprint({})));
    expect(sun(light3dBlueprint({}))).toBe(sun(light3dBlueprint({ 'l.sun': 'mid' }))); // 缺省=mid 档
    // 相机距离 近<远。
    const camDist = (bp: ReturnType<typeof light3dBlueprint>): number => comp<{ distance: number }>(bp, 'cam', 'Camera3D').distance;
    expect(camDist(light3dBlueprint({ 'l.cam': 'near' }))).toBeLessThan(camDist(light3dBlueprint({ 'l.cam': 'far' })));
    // 雾浓度：浓档 far 更小（雾更近）。
    const fogFar = (bp: ReturnType<typeof fog3dBlueprint>): number => comp<{ far: number }>(bp, 'fog', 'Fog3D').far;
    expect(fogFar(fog3dBlueprint({ 'f.den': 'thick' }))).toBeLessThan(fogFar(fog3dBlueprint({ 'f.den': 'thin' })));
    // 未知档回落缺省（弱模型乱填不炸）。
    expect(sun(light3dBlueprint({ 'l.sun': 'bogus' }))).toBe(sun(light3dBlueprint({})));
  });

  it('P3D 超休闲六连批接入：toon 描边 / 广告牌+贴花 / 路径 / 弹簧 组件在蓝图里', () => {
    const tn = new Engine(); tn.load(toon3dBlueprint());
    const mat = tn.world.getComponent('tn-sphere', 'Material3D') as unknown as { shading?: string; outline?: unknown };
    expect(mat.shading).toBe('toon'); expect(mat.outline).toBeTruthy(); // 卡通着色 + 描边
    const bb = new Engine(); bb.load(billboard3dBlueprint());
    expect(bb.world.query('Billboard3D').length).toBeGreaterThanOrEqual(5); // 朝相机金币
    expect(bb.world.query('Decal3D').length).toBeGreaterThanOrEqual(5);     // 地面贴花（阴影/环/splat）
    const pa = new Engine(); pa.load(path3dBlueprint());
    expect(pa.world.query('Path3D').length).toBe(3);                        // 巡逻/绕行/轨道
    const faced = pa.world.getComponent('patroller', 'Path3D') as unknown as { faceDir?: boolean };
    expect(faced.faceDir).toBe(true);
    const sp = new Engine(); sp.load(spring3dBlueprint());
    const anim = sp.world.getComponent('sp-1', 'Anim3D') as unknown as { channels: Array<{ kind: string }> };
    expect(anim.channels.some((c) => c.kind === 'spring')).toBe(true);      // 弹簧通道
  });

  it('圆润图元蓝图含 box 之外的全部 6 种 three 图元（cyl/cone/capsule/torus/plane/sphere）', () => {
    const e = new Engine(); e.load(primitives3dBlueprint());
    const shapes = new Set(
      e.world.query('Mesh3D')
        .map(([id]) => (e.world.getComponent(id, 'Mesh3D') as unknown as { shape: string }).shape),
    );
    for (const s of ['box', 'plane', 'sphere', 'cylinder', 'cone', 'capsule', 'torus']) {
      expect(shapes.has(s)).toBe(true); // 七图元俱全（ground 也是 box）
    }
    const torus = e.world.getComponent('p-torus', 'Mesh3D') as unknown as { tube?: number };
    expect(torus.tube).toBeGreaterThan(0); // torus 带管半径比
  });

  it('世界空间富面板蓝图：WorldUI3D.node 挂整棵 LayoutNode（Panel+ProgressBar·非纯 text）', () => {
    const e = new Engine(); e.load(worldui3dBlueprint());
    const uis = e.world.query('WorldUI3D')
      .map(([id]) => e.world.getComponent(id, 'WorldUI3D') as unknown as { node?: { type: string; children?: unknown[] }; text?: string });
    expect(uis.length).toBe(3); // Boss/治疗/精英怪
    for (const ui of uis) {
      expect(ui.node?.type).toBe('Panel'); // 富面板·非简写 text
      expect(ui.text).toBeUndefined();
      expect((ui.node?.children?.length ?? 0)).toBeGreaterThanOrEqual(2); // Label + ≥1 ProgressBar
    }
  });

  it('glTF 模型场景含 Model3D（蓝图只持 modelKey·保纯）', () => {
    const e = new Engine(); e.load(model3dBlueprint());
    expect(e.world.query('Model3D').length).toBe(4); // 3 鸭 + 1 盒
    const m = e.world.getComponent('duck-main', 'Model3D') as unknown as { modelKey?: string };
    expect(typeof m.modelKey).toBe('string'); // 持 key 不持 URL/字节
  });

  it('IBL 已开（材质场景 Sky3D.env>0）+ 表面细节含 surface', () => {
    const m = new Engine(); m.load(material3dBlueprint());
    const sky = m.world.getComponent('sky', 'Sky3D') as unknown as { env?: number };
    expect(sky.env).toBeGreaterThan(0);
    const s = new Engine(); s.load(surface3dBlueprint());
    const mat = s.world.getComponent('s-bumps', 'Material3D') as unknown as { surface?: unknown };
    expect(mat.surface).toBeTruthy();
  });

  it('点光源/聚光灯蓝图含 2 盏动态局部光（point + spot·预算内）', () => {
    const e = new Engine(); e.load(pointlight3dBlueprint());
    const locals = e.world.query('Light3D')
      .map(([id]) => e.world.getComponent(id, 'Light3D') as unknown as { kind: string })
      .filter((l) => l.kind === 'point' || l.kind === 'spot');
    expect(locals.length).toBe(2);
  });

  it('PBR 材质 / 距离雾组件在蓝图里', () => {
    const m = new Engine(); m.load(material3dBlueprint());
    expect(m.world.query('Material3D').length).toBe(7); // 7 个预设
    const f = new Engine(); f.load(fog3dBlueprint());
    expect(f.world.query('Fog3D').length).toBe(1);
  });

  it('新特性组件齐：WorldUI3D（头顶文字）/ Post3D.ao / Vfx3D 都在蓝图里', () => {
    const t = new Engine(); t.load(text3dBlueprint());
    expect(t.world.query('WorldUI3D').length).toBeGreaterThanOrEqual(4);
    const a = new Engine(); a.load(ao3dBlueprint());
    const post = a.world.getComponent('post', 'Post3D') as unknown as { ao?: unknown };
    expect(post.ao).toBeTruthy(); // AO 数据在
    const v = new Engine(); v.load(vfx3dBlueprint());
    expect(v.world.query('Vfx3D').length).toBe(3); // 三股喷泉发射器
  });

  it('光照/景深场景含 Camera3D + Light3D + Sky3D（渲染器自动读）', () => {
    const e = new Engine(); e.load(light3dBlueprint());
    expect(e.world.query('Camera3D').length).toBe(1);
    expect(e.world.query('Light3D').length).toBe(2); // 主光 + 环境
    expect(e.world.query('Sky3D').length).toBe(1);
    const p = new Engine(); p.load(post3dBlueprint());
    expect(p.world.query('Post3D').length).toBe(1);
  });

  it('3D 寻路：追兵被 pathfind 写出位移（绕障逼近移动目标）', () => {
    const e = new Engine(); e.load(nav3dBlueprint());
    const id = 'seeker-1';
    const before = e.world.getComponent(id, 'Transform') as unknown as { x: number; y: number };
    const bx = before.x, by = before.y;
    for (let i = 0; i < 80; i++) e.world.tick();
    const after = e.world.getComponent(id, 'Transform') as unknown as { x: number; y: number };
    const moved = Math.hypot(after.x - bx, after.y - by);
    expect(moved).toBeGreaterThan(2); // 真沿 NavGraph 走动了
  });

  it('3D 粒子：引爆后实体数增长（caster→Mesh3D 火花）且寿命有界', () => {
    const e = new Engine(); e.load(particle3dBlueprint());
    const n0 = e.world.query('Mesh3D').length;
    for (let i = 0; i < 60; i++) e.world.tick();
    const n1 = e.world.query('Mesh3D').length;
    expect(n1).toBeGreaterThan(n0); // 火花生出来
    for (let i = 0; i < 200; i++) e.world.tick();
    const n2 = e.world.query('Mesh3D').length;
    expect(n2).toBeLessThan(n1 + 40); // 到期自毁·总量有界
  });
});
