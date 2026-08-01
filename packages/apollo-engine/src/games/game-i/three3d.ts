// Game I · 3D 能力展台（消费 P3D 的 3D 渲染线·纯 game-i 蓝图·不改 three-renderer/game-z）
//
// 每个蓝图都是纯数据：放 Camera3D / Light3D / Sky3D / Post3D / Mesh3D / Transform3D / Collider3D /
// NavMesh / NavAgent 这些 **render-only + 3D 能力组件**，挂 ThreeRenderer 即活。逐个展 P3D 新能力：
//   光照阴影(Light3D) · 景深泛光(Post3D) · 3D 寻路(navmesh 自动烘焙) · 3D 碰撞(Collider3D/Overlap3D) · 3D 粒子(prefab→Mesh3D)。
// 边界：只消费 3D 数据接口，渲染器/组件/game-z 一概不碰（P3D 域）。缺口→记 requests-3d.md，不 hack。
// 注：蓝图组件值是无 `type` 判别符的字段对象（键=组件名·同 three-lab.ts 体例）。

import type { WorldBlueprint } from '../../assembly/demo.assembly.js';
import type { LayoutNode } from '@ui/components/index.js';
import {
  transformCapability, velocityCapability, timerCapability, destroyCapability,
} from '@atom-skills/index.js';
import { tweenCapability, motionApplyCapability, lifetimeCapability } from '@skills/tier1/index.js';
import { eventWhenCapability, pathfindCapability } from '@skills/tier2/index.js';
import { casterCapability, prefabCapability } from '@skills/tier3/index.js';
import { overlapDetect3dCapability, navmeshBakeCapability } from '@skills/atoms/index.js';
import { MODEL_DUCK, MODEL_BOX } from './assets3d.js';

type Ent = WorldBlueprint['entities'][string];
type Prim = 'box' | 'plane' | 'sphere' | 'cylinder' | 'cone' | 'capsule' | 'torus';
type ProgressTone = 'accent' | 'gold' | 'ok' | 'warn' | 'danger';
const TWO_PI = 6.28318;

// 静态盒（Transform3D 真 3D 定位 + Mesh3D 体）：x 右 / y 高(中心) / z 深。
function box(x: number, y: number, z: number, w: number, h: number, d: number, front: number, edge: number): Ent {
  return {
    Transform3D: { x, y, z },
    Mesh3D: { shape: 'box', width: w, height: h, depth: d, frontTint: front, backTint: front, edgeTint: edge },
  };
}

// 现场调参预设解析（REQ-DEMO-调参台·client demo「数据即渲染」）：闭集离散档 → 蓝图数值。
// key 不填/不识别 → 回落 def 档（老口径零变化）。纯数据映射·弱模型也能扩。
export function pick3d<T>(map: Record<string, T>, key: string | undefined, def: string): T {
  return map[key ?? def] ?? map[def]!;
}

// 子效果编号（owner：外主编号-里子编号·如 12-4）：给一批演示物挂世界空间数字标签 `<no>-<i>`（i 从 1 起·render-only
// WorldUI3D·锚实体投影到屏幕）。已有名牌的（text3d/worldui）前缀编号保留原文。no=该效果的主编号（MODULE_NO·宿主传入）。
function numberEnts(no: number, ents: Record<string, Ent>, keys: readonly string[], offsetY = 10): void {
  keys.forEach((k, i) => {
    const e = ents[k] as Record<string, unknown> | undefined;
    if (!e) return;
    const tag = `${no}-${i + 1}`;
    const cur = e['WorldUI3D'] as { text?: string } | undefined;
    e['WorldUI3D'] = cur
      ? { ...cur, text: `${tag} · ${cur.text ?? ''}`.trim() }               // 已有名牌 → 前缀编号
      : { text: tag, offsetY, size: 'sm', color: 'gold', glow: false };     // 纯编号标签
  });
}

// 公共场景底：轨道相机 + 主光(投影)+ 环境光 + 天空 + 草地台。各蓝图在此之上加自己的演示物。
// opts=现场可调档覆盖（缺省=原口径·所有旧调用方 sceneBase() 零变化）。
function sceneBase(o: { sun?: number; amb?: number; camDist?: number } = {}): Record<string, Ent> {
  return {
    cam: { Camera3D: { yaw: 0.72, pitch: 0.62, distance: o.camDist ?? 96, pivotX: 0, pivotY: 4, pivotZ: 0, fov: 40, pitchMin: 0.12, pitchMax: 1.45 } },
    sun: { Light3D: { kind: 'directional', color: 0xfff1d6, intensity: o.sun ?? 1.55, castShadow: true } },
    fill: { Light3D: { kind: 'ambient', color: 0xbfd2ff, intensity: o.amb ?? 0.42 } },
    // env:1 开 IBL（中性影室环境贴图）→ PBR 金属/玻璃有反射可照（P3D TA Phase5·REQ-3D-PBR-IBL 已交付）。
    sky: { Sky3D: { top: 0x4a90d9, bottom: 0xcfe9f7, clouds: true, cloudTint: 0xffffff, scroll: 0.6, env: 1 } },
    // 草地台：Mesh3D 的 edgeTint=「边+顶」色 → 顶面草绿、front=四周泥土侧（盒庭草坡观感）。
    ground: box(0, -2.5, 0, 78, 5, 78, 0x6d4c41, 0x7cb342),
  };
}

// ── ① 数据化光照 Light3D：定向主光投影 + 环境补光，盒阵 + 一只缓转金盒（各面随光明暗·光照是数据）。
//     tune=现场调参档（l.sun 主光强 / l.amb 环境光 / l.cam 相机距）——改档即改数据、渲染器自动读，无一行代码。
export function light3dBlueprint(tune: Record<string, string> = {}, no = 0): WorldBlueprint {
  const sun = pick3d({ low: 0.55, mid: 1.55, high: 2.9 }, tune['l.sun'], 'mid');
  const amb = pick3d({ low: 0.12, mid: 0.42, high: 0.95 }, tune['l.amb'], 'mid');
  const camDist = pick3d({ near: 68, mid: 96, far: 132 }, tune['l.cam'], 'mid');
  const ents: Record<string, Ent> = {
    ...sceneBase({ sun, amb, camDist }),
    'pillar-a': box(-18, 6, -6, 8, 16, 8, 0x8d6e63, 0x5d4037),
    'pillar-b': box(16, 4, 8, 10, 12, 10, 0xa1887f, 0x6d4c41),
    'slab': box(0, 1, 18, 22, 2, 8, 0xb0bec5, 0x78909c),
    spinner: {
      Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      Transform3D: { x: 0, y: 7, z: 0, rotY: 0 },
      Mesh3D: { shape: 'box', width: 12, height: 12, depth: 12, frontTint: 0xe7c96a, backTint: 0xe7c96a, edgeTint: 0xb8932f, flipAxis: 'y' },
      Tween: { target: 'Transform.rotation', from: 0, to: TWO_PI, elapsed: 0, duration: 200, easing: 'linear', done: false, loop: 'restart' },
    },
  };
  numberEnts(no, ents, ['pillar-a', 'pillar-b', 'slab', 'spinner']);
  return { capabilities: [transformCapability, tweenCapability], entities: ents };
}

// ── ② 移轴景深 + 泛光 Post3D：同场景叠 EffectComposer——中段清晰、上下虚化(微缩盒庭感) + 亮处泛光。
export function post3dBlueprint(tune: Record<string, string> = {}, no = 0): WorldBlueprint {
  const tilt  = pick3d({ soft: 1.6, mid: 3.6, strong: 6.0 }, tune['ps.tilt'], 'mid');   // 移轴虚化量
  const bloom = pick3d({ low: 0.35, mid: 0.7, high: 1.4 }, tune['ps.bloom'], 'mid');     // 泛光强度
  const focus = pick3d({ low: 0.35, mid: 0.52, high: 0.7 }, tune['ps.focus'], 'mid');    // 清晰焦平面高度
  const ents: Record<string, Ent> = {
    ...sceneBase(),
    post: { Post3D: { tiltShift: { focus, intensity: tilt }, bloom: { strength: bloom, radius: 0.5, threshold: 0.72 } } },
    'c1': box(-22, 3, 4, 8, 8, 8, 0xff7043, 0xe64a19),
    'c2': box(-8, 5, -8, 8, 12, 8, 0x42a5f5, 0x1e88e5),
    'c3': box(8, 4, 6, 8, 10, 8, 0x66bb6a, 0x43a047),
    'c4': box(22, 6, -4, 8, 14, 8, 0xffca28, 0xffa000),
    glow: {
      Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      Transform3D: { x: 0, y: 12, z: 0 },
      Mesh3D: { shape: 'box', width: 6, height: 6, depth: 6, frontTint: 0xfff6c0, backTint: 0xfff6c0, edgeTint: 0xffffff },
      Tween: { target: 'Transform3D.y', from: 10, to: 16, elapsed: 0, duration: 70, easing: 'easeInOut', done: false, loop: 'pingpong' },
    },
  };
  numberEnts(no, ents, ['c1', 'c2', 'c3', 'c4', 'glow']);
  return { capabilities: [transformCapability, tweenCapability], entities: ents };
}

// ── ③ 3D 寻路 navmesh（REQ-3D-Nav 自动烘焙）：NavMesh 罩草地，障碍自动栅格化织图，追兵 NavAgent 绕障逼近巡逻目标。
//      相机 follow 目标（Camera3D follow 模式）。开 debug nav 看青图/黄路径。
export function nav3dBlueprint(tune: Record<string, string> = {}): WorldBlueprint {
  const spd = pick3d({ slow: 0.28, mid: 0.5, fast: 0.85 }, tune['nav.spd'], 'mid');  // 追兵速度
  const cell = pick3d({ coarse: 5, mid: 3, fine: 2 }, tune['nav.cell'], 'mid');       // 导航网格精度（细=贴障绕行）
  const obstacle = (x: number, z: number, w: number, d: number, front: number, edge: number): Ent => ({
    Transform: { x, y: z, rotation: 0, scaleX: 1, scaleY: 1 }, // 2D：碰撞/烘焙 planar（x→X、y→Z）
    Transform3D: { x, y: 5, z },
    Mesh3D: { shape: 'box', width: w, height: 10, depth: d, frontTint: front, backTint: front, edgeTint: edge },
    Collider3D: { kind: 'box', halfX: w / 2, halfY: 5, halfZ: d / 2, baseY: 5 },
  });
  return {
    capabilities: [transformCapability, velocityCapability, tweenCapability, motionApplyCapability, navmeshBakeCapability, pathfindCapability],
    entities: {
      ...sceneBase(),
      cam: { Camera3D: { yaw: 0.7, pitch: 0.62, distance: 104, pivotY: 3, fov: 42, mode: 'follow', target: 'hero', pitchMin: 0.12, pitchMax: 1.45 } },
      nav: { NavMesh: { minX: -34, minZ: -34, maxX: 34, maxZ: 34, cellSize: cell, agentRadius: 2.6 } },
      'rock-1': obstacle(-12, -10, 6, 14, 0x9e9e9e, 0x616161),
      'rock-2': obstacle(2, 8, 16, 6, 0x9e9e9e, 0x616161),
      'rock-3': obstacle(16, -6, 6, 12, 0x9e9e9e, 0x616161),
      hero: {
        Transform: { x: -26, y: 24, rotation: 0, scaleX: 1, scaleY: 1 },
        Transform3D: { x: -26, y: 3, z: 24 },
        Mesh3D: { shape: 'box', width: 5, height: 6, depth: 5, frontTint: 0x26c6da, backTint: 0x26c6da, edgeTint: 0x00838f },
        Tween: { target: 'Transform.x', from: -26, to: 26, elapsed: 0, duration: 260, easing: 'easeInOut', done: false, loop: 'pingpong' },
      },
      'seeker-1': {
        Transform: { x: -28, y: -28, rotation: 0, scaleX: 1, scaleY: 1 },
        Velocity: { vx: 0, vy: 0, angular: 0 },
        Mesh3D: { shape: 'box', width: 4, height: 4, depth: 4, frontTint: 0xff7043, backTint: 0xff7043, edgeTint: 0xffab91 },
        NavAgent: { speed: spd, arriveRange: 7 },
        Relation: { kind: 'target', targetId: 'hero' },
      },
      'seeker-2': {
        Transform: { x: 28, y: -28, rotation: 0, scaleX: 1, scaleY: 1 },
        Velocity: { vx: 0, vy: 0, angular: 0 },
        Mesh3D: { shape: 'box', width: 4, height: 4, depth: 4, frontTint: 0xef5350, backTint: 0xef5350, edgeTint: 0xb71c1c },
        NavAgent: { speed: spd * 0.84, arriveRange: 7 }, // 保二号略慢于一号（默认 0.5→0.42）
        Relation: { kind: 'target', targetId: 'hero' },
      },
    },
  };
}

// ── ④ 3D 碰撞 Collider3D/Overlap3D（REQ-3D-Collision）：两盒来回穿过中央触发区，overlap-detect-3d 每帧判交、产 Overlap3D。
//      开 debug colliders 看线框（实心黄 / 触发绿）。
export function collide3dBlueprint(): WorldBlueprint {
  return {
    capabilities: [transformCapability, velocityCapability, tweenCapability, motionApplyCapability, overlapDetect3dCapability],
    entities: {
      ...sceneBase(),
      zone: {
        Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        Transform3D: { x: 0, y: 4, z: 0 },
        Mesh3D: { shape: 'box', width: 18, height: 8, depth: 18, frontTint: 0x33d17a, backTint: 0x33d17a, edgeTint: 0x2ec27e },
        Color: { tint: 0x33d17a, alpha: 0.35 },
        Collider3D: { kind: 'box', halfX: 9, halfY: 4, halfZ: 9, baseY: 4, trigger: true },
      },
      'mover-x': {
        Transform: { x: -30, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        Transform3D: { x: -30, y: 4, z: 0 },
        Mesh3D: { shape: 'box', width: 6, height: 6, depth: 6, frontTint: 0xffa726, backTint: 0xffa726, edgeTint: 0xf57c00 },
        Collider3D: { kind: 'sphere', radius: 3.4, baseY: 4 },
        Tween: { target: 'Transform.x', from: -30, to: 30, elapsed: 0, duration: 150, easing: 'easeInOut', done: false, loop: 'pingpong' },
      },
      'mover-z': {
        Transform: { x: 0, y: -30, rotation: 0, scaleX: 1, scaleY: 1 },
        Transform3D: { x: 0, y: 4, z: -30 },
        Mesh3D: { shape: 'box', width: 6, height: 6, depth: 6, frontTint: 0x42a5f5, backTint: 0x42a5f5, edgeTint: 0x1565c0 },
        Collider3D: { kind: 'box', halfX: 3, halfY: 3, halfZ: 3, baseY: 4 },
        Tween: { target: 'Transform.y', from: -30, to: 30, elapsed: 0, duration: 190, easing: 'easeInOut', done: false, loop: 'pingpong' },
      },
    },
  };
}

// ── ⑥ 头顶 3D 文字 WorldUI3D（世界空间 UI·锚实体投影到屏幕·经 mountUI 渲 LayoutNode Label）：盒上飘名字/血量/状态。
export function text3dBlueprint(): WorldBlueprint {
  const titled = (x: number, z: number, h: number, front: number, edge: number, text: string, color: string, glow: boolean): Ent => ({
    Transform: { x, y: z, rotation: 0, scaleX: 1, scaleY: 1 },
    Transform3D: { x, y: h / 2, z },
    Mesh3D: { shape: 'box', width: 8, height: h, depth: 8, frontTint: front, backTint: front, edgeTint: edge },
    WorldUI3D: { text, offsetY: h / 2 + 4, size: 'sm', color, glow },
  });
  return {
    capabilities: [transformCapability],
    entities: {
      ...sceneBase(),
      boss: titled(0, 0, 16, 0x8e44ad, 0x6c3483, '★ 暗影领主  Lv.70', 'gold', true),
      'ally-1': titled(-20, 6, 10, 0x2980b9, 0x1f618d, '索瑞森  HP 6100', 'jade', false),
      'ally-2': titled(20, -6, 12, 0x27ae60, 0x1e8449, '艾拉娜  能量 88', 'ok', false),
      'mob-1': titled(-12, -18, 7, 0xc0392b, 0x922b21, '小怪 ×3', 'danger', false),
    },
  };
}

// ── ⑦ 环境光遮蔽 AO（Post3D.ao·GTAO）：紧挨的盒堆，接触缝隙被压暗 → 厚重接地的盒庭玩具感。
export function ao3dBlueprint(tune: Record<string, string> = {}, no = 0): WorldBlueprint {
  const aoStr = pick3d({ low: 0.5, mid: 1.4, high: 2.4 }, tune['ao.str'], 'mid'); // 遮蔽强度
  const aoRad = pick3d({ tight: 2, mid: 5, wide: 9 }, tune['ao.rad'], 'mid');     // 遮蔽扩散半径
  const ents: Record<string, Ent> = {
    ...sceneBase(),
    // 强 AO + 关泛光，凸显接触压暗（缝隙/墙根变深）。
    post: { Post3D: { ao: { intensity: aoStr, radius: aoRad, scale: 1 } } },
    // 紧挨成簇的盒堆（多接触面 = AO 最显处）。
    'b1': box(-6, 3, -6, 10, 6, 10, 0xd7ccc8, 0xa1887f),
    'b2': box(5, 3, -5, 9, 6, 9, 0xcfd8dc, 0x90a4ae),
    'b3': box(-4, 3, 6, 8, 6, 8, 0xe0e0e0, 0xbdbdbd),
    'b4': box(7, 9, 4, 7, 6, 7, 0xffe0b2, 0xffb74d),
    'tower': box(0, 12, 0, 6, 18, 6, 0xb0bec5, 0x78909c),
  };
  numberEnts(no, ents, ['b1', 'b2', 'b3', 'b4', 'tower']);
  return { capabilities: [transformCapability], entities: ents };
}

// ── ⑧ 数据驱动 3D 粒子 Vfx3D（TA「Niagara-lite」·render-only）：锥形喷泉，重力回落、size/color over life、加色发光。
//      区别于 ⑤(prefab→Mesh3D 那套)：Vfx3D 是专门的发射器闭集模块，一个组件就是一台粒子机。
export function vfx3dBlueprint(tune: Record<string, string> = {}, no = 0): WorldBlueprint {
  const rate = pick3d({ low: 22, mid: 55, high: 120 }, tune['vfx.rate'], 'mid'); // 喷量（粒子/秒）
  const grav = pick3d({ low: 4, mid: 12, high: 24 }, tune['vfx.grav'], 'mid');   // 重力回落
  const spdF = pick3d({ low: 0.65, mid: 1, high: 1.5 }, tune['vfx.spd'], 'mid'); // 初速倍率（保三股相对差）
  const fountain = (x: number, z: number, color: number, speed: number): Ent => ({
    Transform3D: { x, y: 2, z },
    Vfx3D: {
      rate, lifetime: 1.5, lifeVar: 0.3, max: 180,
      shape: 'cone', coneAngle: 0.28, speed: speed * spdF, speedVar: speed * spdF * 0.25,
      gravity: grav, drag: 0.08, size: 2.6, // 大粒子=清晰可辨（之前 1.4 太小、被 bloom 糊成雾）
      sizeCurve: { keys: [{ t: 0, v: 0.5 }, { t: 0.2, v: 1 }, { t: 1, v: 0 }] },
      colorGradient: { stops: [{ t: 0, color: 0xffffff, alpha: 1 }, { t: 0.35, color, alpha: 1 }, { t: 1, color, alpha: 0 }] },
      blend: 'add',
    },
  });
  const ents: Record<string, Ent> = {
    ...sceneBase(),
    // 暗暮天空衬发光粒子；bloom 收紧（radius 0.3·strength 0.7·高阈值）→ 是「亮点」不是「雾」。
    sky: { Sky3D: { top: 0x0a0e1f, bottom: 0x241a33, clouds: false } },
    sun: { Light3D: { kind: 'directional', color: 0x6a7fd0, intensity: 0.6, castShadow: true } },
    fill: { Light3D: { kind: 'ambient', color: 0x2a3350, intensity: 0.55 } },
    post: { Post3D: { bloom: { strength: 0.7, radius: 0.3, threshold: 0.82 }, aa: true } },
    'fx-gold': fountain(-16, 0, 0xffd86b, 16),
    'fx-jade': fountain(0, -4, 0x6cf0d0, 19),
    'fx-rose': fountain(16, 0, 0xff7ab0, 16),
  };
  numberEnts(no, ents, ['fx-gold', 'fx-jade', 'fx-rose'], 6);
  return { capabilities: [transformCapability], entities: ents };
}

// ── ⑬ 导入式 glTF 模型 Model3D（P3D·box 原语表达不了圆润模型→真模型）：几只小黄鸭（不同缩放/染色）+ 盒模型，
//      自带材质 + 软影。蓝图只持 modelKey（保纯），ModelAssetLoader 取字节、ThreeRenderer 解析。需给渲染器接 AssetManager。
export function model3dBlueprint(tune: Record<string, string> = {}): WorldBlueprint {
  const spin = pick3d({ slow: 420, mid: 260, fast: 130 }, tune['mdl.spin'], 'mid'); // 主鸭自转周期
  const camD = pick3d({ near: 56, mid: 78, far: 110 }, tune['mdl.cam'], 'mid');      // 相机距离
  return {
    capabilities: [transformCapability, tweenCapability],
    entities: {
      ...sceneBase(),
      cam: { Camera3D: { yaw: 0.7, pitch: 0.5, distance: camD, pivotY: 6, fov: 40, pitchMin: 0.12, pitchMax: 1.45 } },
      // 居中主鸭（缓转·看各角度自带材质）。
      'duck-main': {
        Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        Transform3D: { x: 0, y: 0, z: 0, rotY: 0 },
        Model3D: { modelKey: MODEL_DUCK, scale: 3.4 },
        Tween: { target: 'Transform3D.rotY', from: 0, to: TWO_PI, elapsed: 0, duration: spin, easing: 'linear', done: false, loop: 'restart' },
      },
      // 染色鸭 ×2（同模板多实例·共享几何·各自染色）。
      'duck-jade': { Transform3D: { x: -22, y: 0, z: 4, rotY: 0.8 }, Model3D: { modelKey: MODEL_DUCK, scale: 2.4, tint: 0x6cc6a0 } },
      'duck-rose': { Transform3D: { x: 22, y: 0, z: 4, rotY: -0.8 }, Model3D: { modelKey: MODEL_DUCK, scale: 2.4, tint: 0xe88fa8 } },
      // 盒模型（另一个 glTF·验证多模板）。
      'box-model': { Transform3D: { x: 0, y: 2, z: -18, rotY: 0.6 }, Model3D: { modelKey: MODEL_BOX, scale: 8 } },
    },
  };
}

// ── ⑨ PBR 材质预设 Material3D（TA Phase 5）：一排盒各挂一个 PBR 预设（金/钢/铜/玻璃/木/岩/自发光）——
//      金属反光、玻璃透射、哑光，全是数据选预设。叠 Post3D 调色(暖电影感) + 抗锯齿。
export function material3dBlueprint(tune: Record<string, string> = {}, no = 0): WorldBlueprint {
  const emit = pick3d({ low: 0.6, mid: 1.8, high: 3.5 }, tune['mat.emit'], 'mid');    // 自发光盒亮度
  const expo = pick3d({ dim: 0.8, mid: 1.05, bright: 1.4 }, tune['mat.expo'], 'mid'); // 整体曝光（金属显亮）
  const sat  = pick3d({ low: 0.7, mid: 1.15, high: 1.6 }, tune['mat.sat'], 'mid');    // 调色饱和度
  const slab = (x: number, preset: string, color: number, extra: Record<string, unknown> = {}): Ent => ({
    Transform3D: { x, y: 6, z: 0 },
    Mesh3D: { shape: 'box', width: 9, height: 12, depth: 9, frontTint: color, backTint: color, edgeTint: color },
    Material3D: { preset, ...extra },
  });
  const ents: Record<string, Ent> = {
    ...sceneBase(),
    cam: { Camera3D: { yaw: 0.62, pitch: 0.34, distance: 110, pivotY: 6, fov: 38, pitchMin: 0.1, pitchMax: 1.4 } },
    post: { Post3D: { grade: { exposure: expo, contrast: 1.08, saturation: sat, tint: 0xffe7c2 }, aa: true } },
    // IBL 已开（sceneBase env:1）→ 纯金属预设直接反射环境、显真金属光泽，无需 metalness 绕法。
    'm-gold': slab(-40, 'gold', 0xffc64a),
    'm-steel': slab(-27, 'steel', 0x8a8d92),
    'm-copper': slab(-14, 'copper', 0xb87333),
    'm-glass': slab(-1, 'glass', 0x8fe9f0, { color: 0x8fe9f0 }),
    'm-wood': slab(12, 'wood', 0x9c6b3f),
    'm-rock': slab(25, 'rock', 0x8d8f92),
    'm-emit': slab(38, 'emissive', 0x222222, { emissive: 0xffd86b, emissiveIntensity: emit }),
  };
  numberEnts(no, ents, ['m-gold', 'm-steel', 'm-copper', 'm-glass', 'm-wood', 'm-rock', 'm-emit']);
  return { capabilities: [transformCapability], entities: ents };
}

// ── ⑫ 程序化表面细节 Material3D.surface（TA Phase 5·零美术文件）：渲染器按数据生成 normal/roughness 贴图——
//      凸点/噪声/划痕图案 + 平铺/法线强度/粗糙起伏/频率，给盒面真实凹凸质感（同天空盒程序化纹理先例）。
export function surface3dBlueprint(tune: Record<string, string> = {}): WorldBlueprint {
  const nrmF  = pick3d({ flat: 0.4, mid: 1, deep: 1.7 }, tune['sf.normal'], 'mid');   // 凹凸强倍率（保三块相对差）
  const tileF = pick3d({ coarse: 0.5, mid: 1, fine: 2 }, tune['sf.tiles'], 'mid');    // 纹理密度倍率
  const tile = (x: number, preset: string, color: number, surface?: Record<string, unknown>): Ent => ({
    Transform3D: { x, y: 6, z: 0 },
    Mesh3D: { shape: 'box', width: 11, height: 12, depth: 11, frontTint: color, backTint: color, edgeTint: color },
    Material3D: { preset, ...(surface ? { surface } : {}) },
  });
  // 表面参数经 nrmF/tileF 倍率（默认 mid=1→原值不变），凹凸强/密度一档全变。
  const surf = (pattern: string, tiles: number, normal: number, rough: number, scale?: number): Record<string, unknown> =>
    ({ pattern, tiles: Math.max(1, Math.round(tiles * tileF)), normal: normal * nrmF, rough, ...(scale !== undefined ? { scale } : {}) });
  return {
    capabilities: [transformCapability],
    entities: {
      ...sceneBase(),
      cam: { Camera3D: { yaw: 0.6, pitch: 0.36, distance: 96, pivotY: 6, fov: 38, pitchMin: 0.1, pitchMax: 1.4 } },
      post: { Post3D: { grade: { exposure: 1.05, saturation: 1.08 }, aa: true } },
      's-smooth': tile(-30, 'plastic', 0xb86b4a), // 对照：无 surface（光面）
      's-bumps': tile(-12, 'plastic', 0xb86b4a, surf('bumps', 5, 1.4, 0.5)),
      's-noise': tile(6, 'rock', 0x9a9d9f, surf('noise', 4, 1.2, 0.6, 1.4)),
      's-scratch': tile(24, 'steel', 0xb9bdc4, surf('scratches', 6, 1.0, 0.4)),
    },
  };
}

// ── ⑪ 点光源 / 聚光灯 Light3D point·spot（TA Phase 2·动态局部光·可移动）：暗场里一盏移动暖点光 + 一盏冷聚光锥，
//      把白盒打出彩色明暗。点光随实体 Transform3D 走（tween 扫动）；聚光有锥角/半影。叠 bloom 让光源发光。
export function pointlight3dBlueprint(tune: Record<string, string> = {}): WorldBlueprint {
  const warm  = pick3d({ dim: 60, mid: 130, bright: 240 }, tune['pl.warm'], 'mid');   // 暖点光强
  const spot  = pick3d({ dim: 70, mid: 160, bright: 280 }, tune['pl.spot'], 'mid');   // 冷聚光强
  const angle = pick3d({ tight: 0.28, mid: 0.5, wide: 0.85 }, tune['pl.angle'], 'mid'); // 聚光锥角
  const pad = (x: number, z: number, h: number): Ent => box(x, h / 2 - 2.5, z, 9, h, 9, 0xe8eaed, 0xf0f2f5);
  return {
    capabilities: [transformCapability, tweenCapability],
    entities: {
      ...sceneBase(),
      sky: { Sky3D: { top: 0x080a14, bottom: 0x161a2a, clouds: false } },
      sun: { Light3D: { kind: 'directional', color: 0x3a4364, intensity: 0.25, castShadow: true } }, // 极弱主光·让点光主导
      fill: { Light3D: { kind: 'ambient', color: 0x141a2c, intensity: 0.5 } },
      post: { Post3D: { bloom: { strength: 0.6, radius: 0.34, threshold: 0.8 }, aa: true } },
      // 白盒阵（白底好显彩色光）。
      'q1': pad(-16, -4, 12), 'q2': pad(0, 6, 16), 'q3': pad(16, -4, 10), 'q4': pad(0, -16, 8),
      // 移动暖点光（挂 Transform3D·tween 横扫）。
      'lamp-warm': {
        Transform3D: { x: -22, y: 14, z: 6 },
        Light3D: { kind: 'point', color: 0xff9a4a, intensity: warm, range: 95, decay: 2 },
        Tween: { target: 'Transform3D.x', from: -22, to: 22, elapsed: 0, duration: 150, easing: 'easeInOut', done: false, loop: 'pingpong' },
      },
      // 冷聚光锥（高处朝下·有锥角半影）。
      'lamp-spot': {
        Transform3D: { x: 6, y: 34, z: -2 },
        Light3D: { kind: 'spot', color: 0x5fc6ff, intensity: spot, range: 120, angle, penumbra: 0.45, dirX: 0, dirY: -1, dirZ: 0.15 },
      },
    },
  };
}

// ── ⑩ 距离雾 Fog3D（TA Phase 4）：一长列尖塔向远处退去、渐隐入雾——盒庭「装在玻璃盒里」的纵深。
// tune=现场调参档（f.den 雾浓度：薄/中/浓 → 改 Fog3D.far 远端全雾距·近处始终清晰）。
export function fog3dBlueprint(tune: Record<string, string> = {}): WorldBlueprint {
  const far = pick3d({ thin: 300, mid: 210, thick: 120 }, tune['f.den'], 'mid');
  const near = pick3d({ far: 70, mid: 40, near: 15 }, tune['f.near'], 'mid'); // 雾起点（近=前排就入雾）
  const ent: Record<string, Ent> = {
    ...sceneBase(),
    cam: { Camera3D: { yaw: 0.0, pitch: 0.28, distance: 130, pivotX: 0, pivotY: 6, pivotZ: -40, fov: 46, pitchMin: 0.08, pitchMax: 1.3 } },
    fog: { Fog3D: { color: 0xcfe9f7, near, far } }, // 雾色取天际·近清晰远全雾（far 越小雾越浓）
    ground: box(0, -2.5, -60, 64, 5, 260, 0x6d4c41, 0x7cb342),
  };
  // 两列尖塔夹道向远处延伸（z 越负越远 → 渐隐入雾）。
  for (let i = 0; i < 9; i++) {
    const z = 10 - i * 26;
    const h = 16 + (i % 3) * 6;
    ent[`pl-L${i}`] = box(-22, h / 2 - 2.5, z, 8, h, 8, 0x9c6b3f, 0x6d4c41);
    ent[`pl-R${i}`] = box(22, h / 2 - 2.5, z, 8, h, 8, 0x8d6e63, 0x5d4037);
  }
  return { capabilities: [transformCapability], entities: ent };
}

// ── ⑭ 圆润图元 Mesh3D.shape（P3D REQ-3D-交互补全批②·box 之外的 4 种 three 内建原语）：一排七图元
//      box / plane / sphere / cylinder / cone / capsule / torus 并列——圆润件走 three 内建几何(单材质单色)、各自缓转 + 头顶名牌。
//      参数口径（render.ts 注）：圆润件 width=直径·height=柱/锥高(球忽略取 width 作正球)·torus tube=管半径占主半径比。
export function primitives3dBlueprint(tune: Record<string, string> = {}, no = 0): WorldBlueprint {
  const spin = pick3d({ slow: 420, mid: 260, fast: 130 }, tune['prm.spin'], 'mid'); // 自转周期（越小越快）
  const camD = pick3d({ near: 96, mid: 122, far: 150 }, tune['prm.cam'], 'mid');    // 相机距离
  const prim = (x: number, shape: Prim, tint: number, name: string, extra: Record<string, unknown> = {}): Ent => ({
    Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    Transform3D: { x, y: 8, z: 0, rotY: 0 },
    Mesh3D: { shape, width: 10, height: 12, frontTint: tint, backTint: tint, edgeTint: tint, ...extra },
    Tween: { target: 'Transform3D.rotY', from: 0, to: TWO_PI, elapsed: 0, duration: spin, easing: 'linear', done: false, loop: 'restart' },
    WorldUI3D: { text: name, offsetY: 13, size: 'sm', glow: true },
  });
  const ents: Record<string, Ent> = {
    ...sceneBase(),
    cam: { Camera3D: { yaw: 0.58, pitch: 0.38, distance: camD, pivotY: 6, fov: 40, pitchMin: 0.1, pitchMax: 1.42 } },
    'p-box': prim(-42, 'box', 0xef5350, 'box', { depth: 10 }),        // box：有厚度·正反面可分色
    'p-plane': prim(-28, 'plane', 0xffa726, 'plane'),                 // plane：双面薄片
    'p-sphere': prim(-14, 'sphere', 0x66bb6a, 'sphere'),              // sphere：正球(忽略 height)
    'p-cyl': prim(0, 'cylinder', 0x42a5f5, 'cylinder'),               // cylinder：柱(width=直径·height=柱高)
    'p-cone': prim(14, 'cone', 0xab47bc, 'cone'),                     // cone：锥
    'p-cap': prim(28, 'capsule', 0x26c6da, 'capsule'),               // capsule：胶囊
    'p-torus': prim(42, 'torus', 0xffca28, 'torus', { tube: 0.42 }), // torus：环(tube=管半径比)
  };
  numberEnts(no, ents, ['p-box', 'p-plane', 'p-sphere', 'p-cyl', 'p-cone', 'p-cap', 'p-torus']);
  return { capabilities: [transformCapability, tweenCapability], entities: ents };
}

// ── ⑮ 世界空间富 UI 面板 WorldUI3D.node（P3D REQ-3D-世界空间UI·#1 面板 + #2 跟随单位）：3D 单位头顶挂**整棵 LayoutNode**
//      （名牌 Panel = Label 名字 + ProgressBar 血条/能量·走引擎 UI 库 mountUI 渲染·UI 铁律）·锚世界物件屏幕投影·随单位每帧跟随。
//      对比 ⑥(text3d 纯飘字)：这里是**富面板**（多控件 + 进度条 + 面板底），证明「世界空间 UI = 富 LayoutNode 锚 3D 物件屏幕投影点」。
export function worldui3dBlueprint(tune: Record<string, string> = {}): WorldBlueprint {
  const camD = pick3d({ near: 70, mid: 92, far: 120 }, tune['wui.cam'], 'mid'); // 相机距离（看名牌投影跟随）
  // 名牌 = 无框内容用 raised 令牌面板（色库令牌·非裸 hex）：标题 Label（发光） + 若干 ProgressBar。
  const plate = (id: string, name: string, big: boolean, bars: LayoutNode[]): LayoutNode => ({
    type: 'Panel', id, props: { bg: 'raised', accent: big }, layout: { gap: 3, padding: 5 },
    children: [
      { type: 'Label', id: `${id}-name`, props: { text: name, size: big ? 'md' : 'sm', glow: true } },
      ...bars,
    ],
  });
  const bar = (id: string, value: number, tone: ProgressTone, label: string): LayoutNode =>
    ({ type: 'ProgressBar', id, props: { value, tone, label, showValue: true } });
  const unit = (x: number, z: number, h: number, front: number, edge: number, node: LayoutNode, moving = false): Ent => ({
    Transform: { x, y: z, rotation: 0, scaleX: 1, scaleY: 1 },
    Transform3D: { x, y: h / 2, z },
    Mesh3D: { shape: 'box', width: 8, height: h, depth: 8, frontTint: front, backTint: front, edgeTint: edge },
    WorldUI3D: { offsetY: h / 2 + 6, node },
    // 移动单位（tween 横扫）：证明富面板**随单位每帧跟随投影**（#2 屏幕锚定跟随）。
    ...(moving ? { Tween: { target: 'Transform3D.x', from: x, to: x + 24, elapsed: 0, duration: 170, easing: 'easeInOut', done: false, loop: 'pingpong' } } : {}),
  });
  return {
    capabilities: [transformCapability, tweenCapability],
    entities: {
      ...sceneBase(),
      cam: { Camera3D: { yaw: 0.66, pitch: 0.5, distance: camD, pivotY: 6, fov: 40, pitchMin: 0.12, pitchMax: 1.45 } },
      // Boss：大名牌（accent 高亮框）+ 血条 + 护盾条。
      boss: unit(0, -2, 18, 0x8e44ad, 0x6c3483,
        plate('boss-plate', '★ 暗影领主 Lv.70', true, [
          bar('boss-hp', 0.82, 'danger', 'HP'),
          bar('boss-sh', 0.45, 'warn', '护盾'),
        ])),
      // 治疗（移动·证明跟随）：血 + 蓝量。
      healer: unit(-24, 10, 11, 0x2980b9, 0x1f618d,
        plate('healer-plate', '艾拉娜 · 治疗', false, [
          bar('healer-hp', 0.68, 'ok', 'HP'),
          bar('healer-mp', 0.91, 'accent', '法力'),
        ]), true),
      // 精英怪：单血条名牌。
      elite: unit(24, 8, 13, 0x27ae60, 0x1e8449,
        plate('elite-plate', '森林守卫', false, [
          bar('elite-hp', 0.55, 'gold', 'HP'),
        ])),
    },
  };
}

// ── ⑯ 卡通描边 toon（P3D·Material3D.shading:'toon' + outline·超休闲平涂招牌观感）：一排图元走分段卡通着色
//      （MeshToonMaterial 阶梯明暗）+ inverted-hull 描边（法线外扩背面壳=一圈实色轮廓）。缓转看轮廓。零美术文件。
export function toon3dBlueprint(tune: Record<string, string> = {}): WorldBlueprint {
  // 色阶数：'mix'（缺省·保各件 2/3/4 对比）或 2/3/4（全体统一·滑一档看全排一起变阶）。
  const stepsRaw = tune['tn.steps'];
  const stepOf = (def: number): number => (stepsRaw && stepsRaw !== 'mix' ? Number(stepsRaw) : def);
  const ow = pick3d({ thin: 0.12, mid: 0.28, bold: 0.5 }, tune['tn.outline'], 'mid'); // 描边粗
  const toon = (x: number, shape: Prim, color: number, steps: number, extra: Record<string, unknown> = {}): Ent => ({
    Transform3D: { x, y: 7, z: 0, rotY: 0.3 },
    Mesh3D: { shape, width: 11, height: 12, frontTint: color, backTint: color, edgeTint: color, ...extra },
    Material3D: { preset: 'plastic', color, shading: 'toon', toonSteps: stepOf(steps), outline: { width: ow, color: 0x1a1a1a } },
    Anim3D: { channels: [{ kind: 'spin', field: 'rotY', rate: 0.5 }] },
  });
  return {
    capabilities: [transformCapability],
    entities: {
      ...sceneBase(),
      cam: { Camera3D: { yaw: 0.58, pitch: 0.4, distance: 122, pivotY: 6, fov: 40, pitchMin: 0.1, pitchMax: 1.42 } },
      // 平涂大亮色 + 黑描边 = 超休闲招牌观感。toonSteps 2/3/4 看明暗阶数差。
      'tn-sphere': toon(-40, 'sphere', 0xff6b6b, 3),
      'tn-box': toon(-24, 'box', 0x4dabf7, 3, { depth: 11 }),
      'tn-cyl': toon(-8, 'cylinder', 0x51cf66, 2),
      'tn-cone': toon(8, 'cone', 0xffd43b, 4),
      'tn-cap': toon(24, 'capsule', 0xda77f2, 3),
      'tn-torus': toon(40, 'torus', 0xff922b, 3, { tube: 0.4 }),
    },
  };
}

// ── ⑰ 世界广告牌 Billboard3D + 地面贴花 Decal3D（P3D·休闲拾取物经典组合）：一圈始终朝相机的发光金币
//      （Billboard3D add 混合·无贴图=纯色 quad）+ Anim3D bob 上下浮 + 脚下 Decal3D blob 软阴影（便宜接触阴影）。
export function billboard3dBlueprint(tune: Record<string, string> = {}): WorldBlueprint {
  const bob    = pick3d({ low: 0.6, mid: 1.6, high: 3.2 }, tune['bb.bob'], 'mid');    // 金币上下浮动幅
  const shadow = pick3d({ faint: 0.15, mid: 0.32, dark: 0.6 }, tune['bb.shadow'], 'mid'); // 脚下软阴影浓
  const size   = pick3d({ small: 4.5, mid: 7, large: 10 }, tune['bb.size'], 'mid');   // 金币大小
  const coin = (x: number, z: number, color: number, phase: number): Ent => ({
    Transform3D: { x, y: 6, z },
    Billboard3D: { size, color, blend: 'alpha', opacity: 1 }, // 实心朝相机金片（add 在亮天空下会洗白）
    Anim3D: { channels: [{ kind: 'bob', field: 'y', amp: bob, freq: 2, phase }] },
    Decal3D: { kind: 'blob', radius: 3.4, opacity: shadow, y: 0.05 }, // 脚下软阴影（贴地·随金币在原地）
  });
  const ring = (x: number, z: number): Ent => ({
    Transform3D: { x, y: 0, z },
    Decal3D: { kind: 'ring', radius: 5.5, color: 0x4dd0e1, opacity: 0.8, y: 0.06 }, // 目标标记环
  });
  return {
    capabilities: [transformCapability],
    entities: {
      ...sceneBase(),
      cam: { Camera3D: { yaw: 0.7, pitch: 0.5, distance: 96, pivotY: 4, fov: 40, pitchMin: 0.12, pitchMax: 1.45 } },
      'coin-1': coin(-22, -6, 0xffd86b, 0), 'coin-2': coin(-8, 8, 0xffe08a, 1.2),
      'coin-3': coin(8, -8, 0xffd86b, 2.4), 'coin-4': coin(22, 6, 0xffe08a, 3.6),
      'coin-5': coin(0, 0, 0xfff0b0, 0.6),
      'mark-1': ring(-15, 14), 'mark-2': ring(15, 14), // 落点/目标标记环（disc/ring 贴花）
      'splat': { Transform3D: { x: 0, y: 0, z: 16 }, Decal3D: { kind: 'disc', radius: 6, color: 0x66bb6a, opacity: 0.55, y: 0.05 } },
    },
  };
}

// ── ⑱ 路径跟随 Path3D（P3D·移动平台/巡逻/轨道/传送带·render-only 沿路径匀速走·帧率无关）：巡逻平台走矩形折线、
//      金币沿平滑闭环绕飞、盒子往复传送。faceDir 让巡逻兵朝运动方向。Path3D 只写 Transform3D，与场景正交。
export function path3dBlueprint(tune: Record<string, string> = {}): WorldBlueprint {
  const spdF = pick3d({ slow: 1.6, mid: 1, fast: 0.5 }, tune['pt.speed'], 'mid'); // 巡行速度倍率（越小 duration→越快）
  const dur = (base: number): number => Math.round(base * spdF * 100) / 100;
  return {
    capabilities: [transformCapability],
    entities: {
      ...sceneBase(),
      cam: { Camera3D: { yaw: 0.66, pitch: 0.62, distance: 108, pivotY: 3, fov: 42, pitchMin: 0.12, pitchMax: 1.45 } },
      // 巡逻平台：矩形折线闭环（linear·移动平台/传送带）。
      'platform': {
        Transform3D: { x: 0, y: 2, z: 0 },
        Mesh3D: { shape: 'box', width: 15, height: 2, depth: 15, frontTint: 0x8d6e63, backTint: 0x8d6e63, edgeTint: 0x5d4037 },
        Path3D: { points: [[-26, 2, -18], [26, 2, -18], [26, 2, 18], [-26, 2, 18]], duration: dur(9), loop: 'loop', mode: 'linear' },
      },
      // 巡逻兵：朝运动方向（faceDir·smooth 平滑绕行）。
      'patroller': {
        Transform3D: { x: 0, y: 5, z: 0 },
        Mesh3D: { shape: 'capsule', width: 5, height: 8, frontTint: 0x26c6da, backTint: 0x26c6da, edgeTint: 0x00838f },
        Path3D: { points: [[-20, 5, 0], [0, 5, -20], [20, 5, 0], [0, 5, 20]], duration: dur(6), loop: 'loop', mode: 'smooth', faceDir: true },
      },
      // 轨道金币：小球沿高空平滑闭环绕飞。
      'orbiter': {
        Transform3D: { x: 0, y: 16, z: 0 },
        Billboard3D: { size: 5, color: 0xffd86b, blend: 'add' },
        Path3D: { points: [[-18, 16, -18], [18, 16, -14], [16, 20, 16], [-16, 14, 14]], duration: dur(5), loop: 'loop', mode: 'smooth' },
      },
    },
  };
}

// ── ⑲ 弹簧动画 Anim3D spring（P3D·spawn 弹入/吸附 juice·解析阻尼弹簧·欠阻尼过冲回弹）：一排盒子进本页时
//      scale 0→1 + 从高处 y 落定，各带不同 damping（0.12 弹久 → 0.55 硬）——看回弹次数差。零缓动代码·只填 damping/freq。
export function spring3dBlueprint(tune: Record<string, string> = {}): WorldBlueprint {
  // 只调 freq（弹频·全体统一倍率）——**不动 damping**：五盒不同 damping 的回弹对比本身是本 demo 的看点。
  const fq = pick3d({ slow: 0.62, mid: 1, fast: 1.56 }, tune['sp.freq'], 'mid');
  const springy = (x: number, damping: number, color: number, edge: number): Ent => ({
    Transform3D: { x, y: 6, z: 0 },
    Mesh3D: { shape: 'box', width: 11, height: 11, depth: 11, frontTint: color, backTint: color, edgeTint: edge },
    Anim3D: { channels: [
      { kind: 'spring', field: 'scale', from: 0, to: 1, damping, freq: 3.2 * fq },   // pop-in 弹入
      { kind: 'spring', field: 'y', from: 26, to: 6, damping, freq: 2.6 * fq },      // 从高处落定带过冲
    ] },
  });
  return {
    capabilities: [transformCapability],
    entities: {
      ...sceneBase(),
      cam: { Camera3D: { yaw: 0.6, pitch: 0.44, distance: 116, pivotY: 6, fov: 40, pitchMin: 0.1, pitchMax: 1.42 } },
      'sp-1': springy(-38, 0.12, 0xff6b6b, 0xc92a2a),  // 弹久
      'sp-2': springy(-19, 0.24, 0xffd43b, 0xe67700),
      'sp-3': springy(0, 0.35, 0x51cf66, 0x2b8a3e),    // 缺省
      'sp-4': springy(19, 0.45, 0x4dabf7, 0x1971c2),
      'sp-5': springy(38, 0.55, 0xda77f2, 0x9c36b5),   // 硬
    },
  };
}

// ── ⑤ 3D 粒子（prefab→Mesh3D·复用 2D 库B 套路·ThreeRenderer 渲染）：定时引爆一圈小盒火花，平面放射 + 寿命自毁；叠泛光发光。
//      说明：粒子走 2D motion-apply（planar）渲成 3D 小盒；体积运动(升空/重力)是 P3D 后续（设计取舍·非缺口）。
export function particle3dBlueprint(tune: Record<string, string> = {}): WorldBlueprint {
  const SPEED = pick3d({ slow: 0.3, mid: 0.55, fast: 0.95 }, tune['pa.speed'], 'mid'); // 火花放射速度
  const RING  = pick3d({ few: 6, mid: 10, many: 18 }, tune['pa.count'], 'mid');         // 每环火花数
  const bloom = pick3d({ low: 0.5, mid: 0.9, high: 1.6 }, tune['pa.bloom'], 'mid');     // 泛光发光强
  const LIFE = 52;
  const burst = (tint: number) => {
    const entities: Record<string, Ent> = {};
    for (let i = 0; i < RING; i++) {
      const a = (i / RING) * TWO_PI;
      entities[`p${i}`] = {
        Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        Velocity: { vx: Math.cos(a) * SPEED, vy: Math.sin(a) * SPEED, angular: 0 },
        Transform3D: { x: 0, y: 5, z: 0 },
        Mesh3D: { shape: 'box', width: 2.2, height: 2.2, depth: 2.2, frontTint: tint, backTint: tint, edgeTint: 0xffffff },
        Timer: { id: 'life', elapsed: 0, duration: LIFE, loop: false },
      };
    }
    return { entities };
  };
  const detonator = (x: number, z: number, template: string, period: number, phase: number): Ent => {
    const sig = `boom_${template}`;
    return {
      Transform: { x, y: z, rotation: 0, scaleX: 1, scaleY: 1 },
      Timer: { id: 'boom', elapsed: phase, duration: period, loop: true },
      EventWhen: { signal: sig, when: { kind: 'timer', id: 'boom', cmp: 'gte', value: period - 1 }, mode: 'edge', armed: false },
      Caster: { onSignal: sig, template, at: 'self' },
    };
  };
  return {
    capabilities: [
      transformCapability, velocityCapability, timerCapability, destroyCapability, tweenCapability,
      eventWhenCapability, casterCapability, prefabCapability, motionApplyCapability, lifetimeCapability,
    ],
    entities: {
      ...sceneBase(),
      post: { Post3D: { bloom: { strength: bloom, radius: 0.55, threshold: 0.6 } } },
      library: { PrefabLibrary: { templates: { 'boom-gold': burst(0xffd86b), 'boom-jade': burst(0x9cf0d0), 'boom-rose': burst(0xff9bb0) }, seq: 0 } },
      'det-l': detonator(-18, 0, 'boom-jade', 40, 0),
      'det-m': detonator(0, -4, 'boom-gold', 40, 13),
      'det-r': detonator(18, 0, 'boom-rose', 40, 26),
    },
  };
}
