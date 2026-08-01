import * as THREE from 'three';
import type { Mesh3D, Sky3D, Camera3D, VoxelTex } from '@engine/protocol/components.js';
import type { Renderable } from '../renderable.js';
import {
  renderablePose, flipEuler, mesh3dDepth, transform3dPose, groundPose, type Pose3D,
} from '../three-projection.js';

// ═══════════════════════════════════════════════════════════════
//  three/geometry —— ThreeRenderer 的几何/材质/位姿**无状态工厂**（不持渲染器实例态）。
//  几何与「易错处理」抽这：盒/薄片几何、逐面色烤 vertexColors、天空盒纹理、位姿合成、资源释放。
// ═══════════════════════════════════════════════════════════════

// Mesh3D 实体位姿（纯计算）：① Transform3D 真三维 / 盒庭模式 2D 实体落地面；② 否则 2D 投影 + flip 翻面角。
// 翻面把欧拉折进 rx/ry/rotZ，便于 applyPose 统一施加（实例化与 fallback 同一份位姿）。
export function mesh3dPose(r: Renderable, m: Mesh3D, cam3d: Camera3D | null, zStep: number): Pose3D {
  if (r.transform3d || cam3d) return r.transform3d ? transform3dPose(r.transform3d) : groundPose(r, m.height);
  const p = renderablePose(r, zStep);
  const fe = flipEuler(r.rotation, m.flipAxis);
  return { x: p.x, y: p.y, z: p.z, rx: fe.x, ry: fe.y, rotZ: 0, sx: p.sx, sy: p.sy, sz: 1 };
}

// 把 Pose3D 施加到一个 Object3D（fallback mesh 或实例化 dummy）。quat 在场（物理翻滚）→ 用四元数（无万向锁）。
export function applyPose(o: THREE.Object3D, p: Pose3D): void {
  o.position.set(p.x, p.y, p.z);
  if (p.quat) o.quaternion.set(p.quat[0], p.quat[1], p.quat[2], p.quat[3]);
  else o.rotation.set(p.rx ?? 0, p.ry ?? 0, p.rotZ);
  o.scale.set(p.sx, p.sy, p.sz ?? 1);
}

// 圆润单材质图元几何（render-only·three 内建直映射·可选参数+合理默认）：sphere/cylinder/cone/capsule/torus。
// 都不分面着色（单色/单材质·同 sphere 先例）。width=直径→半径 r；height=柱/锥高。box/plane 返 null（各自专路）。
// 三处几何工厂（fallback / 实例化 / PBR）共用它 → 加一种图元只改这一处。
export function roundGeo(m: Mesh3D): THREE.BufferGeometry | null {
  const r = Math.max(0.0001, m.width / 2);
  const h = Math.max(0.0001, m.height);
  switch (m.shape) {
    case 'sphere': return new THREE.SphereGeometry(r, 40, 20);
    case 'cylinder': return new THREE.CylinderGeometry(r, r, h, 28);
    case 'cone': return new THREE.ConeGeometry(r, h, 28);
    case 'capsule': return new THREE.CapsuleGeometry(r, Math.max(0.0001, h - m.width), 8, 20); // 柱段长=height−直径（两端半球）
    case 'torus': return new THREE.TorusGeometry(r, r * (m.tube ?? 0.35), 16, 36); // 管半径=主半径×tube（默认 0.35）
    default: return null; // box / plane
  }
}

// 单 mesh 版 Mesh3D（透明 fallback 用）：box=有厚度盒（面序 px,nx,py,ny,pz=正,nz=反，四边共用一材质）；plane=双面薄片。
// 哑光质感（roughness 高·metalness 0）= 盒庭圆润不反光的可爱面（Captain Toad 风）。颜色每帧由 paintMesh3D 设。
export function buildMesh3D(m: Mesh3D): THREE.Mesh {
  const matte = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.92, metalness: 0 });
  if (m.shape === 'plane') {
    const mat = matte();
    mat.side = THREE.DoubleSide;
    return new THREE.Mesh(new THREE.PlaneGeometry(m.width, m.height), mat);
  }
  const rg = roundGeo(m); // 圆润单材质图元（sphere/cylinder/cone/capsule/torus）
  if (rg) return new THREE.Mesh(rg, matte());
  const depth = mesh3dDepth(m.shape, m.width, m.height, m.depth);
  const edge = matte();
  const front = matte();
  const back = matte();
  return new THREE.Mesh(new THREE.BoxGeometry(m.width, m.height, depth), [edge, edge, edge, edge, front, back]);
}

// W1-A 实例化批几何：逐面色烤进 `vertexColors`（实例共享一个材质，色靠几何携带）。
// box 面序 px,nx,py,ny,pz(正),nz(反)：四边=edgeTint、正面=frontTint、反面=backTint；plane 单面=frontTint。
export function buildInstancedMesh3DGeometry(m: Mesh3D): THREE.BufferGeometry {
  if (m.shape === 'plane') {
    const geo = new THREE.PlaneGeometry(m.width, m.height);
    bakeFaceColors(geo, [m.frontTint]);
    return geo;
  }
  const rg = roundGeo(m); // 圆润单色图元（sphere/cylinder/cone/capsule/torus）→ 整体单色
  if (rg) {
    bakeFaceColors(rg, [m.frontTint]);
    return rg;
  }
  const depth = mesh3dDepth('box', m.width, m.height, m.depth);
  const edge = m.edgeTint ?? 0x1f2937;
  const geo = new THREE.BoxGeometry(m.width, m.height, depth);
  bakeFaceColors(geo, [edge, edge, edge, edge, m.frontTint, m.backTint ?? m.frontTint]);
  return geo;
}

// 把每面一个色写进几何 color 属性（每面 4 顶点）。Color.setHex 线性·与 material.color.setHex 同空间→看相一致。
function bakeFaceColors(geo: THREE.BufferGeometry, faceTints: readonly number[]): void {
  const count = geo.attributes['position']!.count;
  const vertsPerFace = count / faceTints.length;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let f = 0; f < faceTints.length; f++) {
    c.setHex(faceTints[f]! & 0xffffff);
    for (let v = 0; v < vertsPerFace; v++) {
      const i = (f * vertsPerFace + v) * 3;
      colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// 2D 渲染模式几何：shape→对应平面几何；sprite/text/placeholder→单位面（贴图/占位）。
export function buildGeometry(r: Renderable, mode: string): THREE.BufferGeometry {
  if (mode === 'shape' && r.shape) {
    const s = r.shape;
    if (s.kind === 'circle') return new THREE.CircleGeometry(s.radius ?? 4, 24);
    if (s.kind === 'polygon' && s.vertices && s.vertices.length >= 6) {
      const shape = new THREE.Shape();
      shape.moveTo(s.vertices[0]!, -s.vertices[1]!); // 同 pose 的 y 翻转
      for (let i = 2; i + 1 < s.vertices.length; i += 2) shape.lineTo(s.vertices[i]!, -s.vertices[i + 1]!);
      return new THREE.ShapeGeometry(shape);
    }
    return new THREE.PlaneGeometry(s.width ?? 8, s.height ?? 8); // box
  }
  if (mode === 'text') return new THREE.PlaneGeometry(64, 32);
  return new THREE.PlaneGeometry(16, 16); // sprite / placeholder
}

// Sky3D → 画布纹理：天顶→地平线竖直渐变 + 可选程序化云团（固定位置·可复现·无图片资产）。
// ── 3D 命运骰（render-only·复刻美术设计案原型 dieFaceTex/dieMesh）─────────────────────────────
const dieShade = (n: number, k: number): string => {
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v: number): number => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
};
const DIE_PIPS: Record<number, [number, number][]> = {
  1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.28, .28], [.5, .5], [.72, .72]],
  4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]], 5: [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]],
  6: [[.28, .28], [.28, .5], [.28, .72], [.72, .28], [.72, .5], [.72, .72]],
};
/** 一面骰面贴图：元素色圆角底 + 白点 pip（复刻原型 dieFaceTex）。 */
export function buildDieFaceTexture(color: number, pip: number): THREE.CanvasTexture {
  const s = 256; // 复刻原型 makeDieFaceTexture：256²
  const cv = document.createElement('canvas'); cv.width = cv.height = s;
  const x = cv.getContext('2d')!;
  const rr = (a: number, b: number, w: number, h: number, r: number): void => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
  x.fillStyle = dieShade(color, -0.04); rr(s * .04, s * .04, s * .92, s * .92, s * .18); x.fill();
  const g = x.createLinearGradient(0, 0, s, s); g.addColorStop(0, dieShade(color, .22)); g.addColorStop(1, dieShade(color, -.1));
  x.fillStyle = g; rr(s * .08, s * .08, s * .84, s * .84, s * .14); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = s * .03; rr(s * .1, s * .1, s * .8, s * .8, s * .12); x.stroke();
  const pr = s * .075;
  (DIE_PIPS[Math.max(1, Math.min(6, Math.round(pip)))] ?? DIE_PIPS[1]!).forEach(([px, py]) => {
    const cx = px * s, cy = py * s;
    const rg = x.createRadialGradient(cx - pr * .3, cy - pr * .3, pr * .1, cx, cy, pr);
    rg.addColorStop(0, '#ffffff'); rg.addColorStop(1, '#dde4ec');
    x.fillStyle = rg; x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = s * .04; x.shadowOffsetY = s * .012; // 点数径向高光 + 柔影（复刻原型）
    x.beginPath(); x.arc(cx, cy, pr, 0, 7); x.fill(); x.shadowColor = 'transparent';
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
/** 六面 pip 材质骰子（复刻原型 dieMesh）。面序 = BoxGeometry [右,左,顶,底,前,后]；size 取 width。 */
export function buildDieMesh3D(m: Mesh3D): THREE.Mesh {
  const size = m.width;
  const faces = m.dieFaces ?? [];
  const mats = Array.from({ length: 6 }, (_, i) => {
    const f = faces.length ? (faces[i] ?? faces[i % faces.length]!) : { color: 0xffffff, pip: 1, src: undefined };
    // 手绘面贴图(src) 优先，否则程序化 pip 贴图。
    let map: THREE.Texture;
    if (f.src) { map = new THREE.TextureLoader().load(f.src); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; }
    else map = buildDieFaceTexture(f.color, f.pip);
    // 玻璃骰（透明骰·圆角贴花浮于通透玻璃·可透见**背面其余骰面**·半透半光）：
    //   ⚠️ 修 bug（owner 2026-07-02「透过去别的面是黑的·且有的黑转过来又透明」）：原用 MeshPhysical `transmission`——
    //   three 的 transmission 只把**不透明**物体采进透射缓冲、**排除透明物体**（骰子其余面本身也是玻璃），且本场景无
    //   env 可采样 → 骰面贴图圆角外的透明角透过去采到黑、且随转动透射缓冲内容变 →「有的黑、转过来又透明」。
    //   改用**经典 alpha 混合**：transparent + 贴图 alpha（圆角外透明角=alpha0）+ opacity + DoubleSide + depthWrite:false
    //   → 透明角**直接透见背面骰面色块**（真正"看到别的面"·恒定不随角度黑）；实色区 opacity 半透；emissive 给"半光"辉。
    //   env 反射（Title 设 Sky3D.env）另添高级感（scene.environment 在场即自动上）。
    if (m.dieGlass) {
      const gm = new THREE.MeshPhysicalMaterial({ map, transparent: true, opacity: 0.46, roughness: 0.14, metalness: 0.0, side: THREE.DoubleSide, depthWrite: false });
      gm.emissive.setHex((f.emissive ?? f.color) & 0xffffff); gm.emissiveIntensity = 0.3;
      return gm;
    }
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.42, metalness: 0.18 });
    mat.emissive.setHex((f.emissive ?? f.color) & 0xffffff);
    mat.emissiveIntensity = f.emissive !== undefined ? 0.22 : (f.src ? 0.1 : 0.16);
    return mat;
  });
  return new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mats);
}
/** 骰子 mesh 缓存签名（面色/点数/尺寸/玻璃变才重建）。 */
export function dieMode(m: Mesh3D): string {
  return `die|${m.width}|${m.dieGlass ? 'g' : ''}|${(m.dieFaces ?? []).map((f) => `${f.color}:${f.pip}:${f.emissive ?? ''}:${f.src ?? ''}`).join(',')}`;
}

// ── 体素表面程序化贴图（复刻美术设计案原型 topTex/sideTex/wallTex·「带精美贴图的体素」）─────────────
const rand = (a: number, b: number): number => a + Math.random() * (b - a);
/** 顶面贴图：主色渐变 + 颗粒噪点 + 纹样母题（草/石/晶）+ 深色勾缝（重复平铺 → 网格）。 */
export function buildVoxelTopTexture(v: VoxelTex): THREE.CanvasTexture {
  const s = 128, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const x = cv.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, s, s); g.addColorStop(0, dieShade(v.top, .06)); g.addColorStop(1, dieShade(v.top, -.08));
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 150; i++) { x.fillStyle = Math.random() < .5 && v.top2 !== undefined ? dieShade(v.top2, rand(-.06, .1)) : dieShade(v.top, rand(-.12, .16)); const w = rand(2, 6); x.fillRect(rand(0, s), rand(0, s), w, w * (v.pattern === 'grass' ? 2.2 : 1)); }
  if (v.pattern === 'crystal') { x.strokeStyle = dieShade(v.trim ?? v.top, .1); x.globalAlpha = .5; x.lineWidth = 1.5; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(rand(0, s), rand(0, s)); x.lineTo(rand(0, s), rand(0, s)); x.stroke(); } x.globalAlpha = 1; }
  if (v.pattern === 'stone') { x.strokeStyle = dieShade(v.side, -.1); x.globalAlpha = .4; x.lineWidth = 2; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(rand(0, s), 0); x.lineTo(rand(0, s), s); x.stroke(); } x.globalAlpha = 1; }
  x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = 4; x.strokeRect(2, 2, s - 4, s - 4); // 勾缝
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
/** 侧面贴图：竖向渐变 + 颗粒 + 深色边（重复平铺）。 */
export function buildVoxelSideTexture(v: VoxelTex): THREE.CanvasTexture {
  const s = 128, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const x = cv.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, s); g.addColorStop(0, dieShade(v.side, .08)); g.addColorStop(1, dieShade(v.side, -.14));
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 60; i++) { x.fillStyle = dieShade(v.side2 ?? v.side, rand(-.06, .12)); x.fillRect(rand(0, s), rand(0, s), rand(3, 9), rand(2, 4)); }
  if (v.wall && v.trim !== undefined) { x.fillStyle = dieShade(v.trim, 0); x.globalAlpha = .85; x.fillRect(0, 0, s, 10); x.globalAlpha = 1; } // 墙顶饰条
  x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 3; x.strokeRect(1, 1, s - 2, s - 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
/** 手绘贴图 URL → 平铺纹理（wrapRepeat·sRGB）。 */
function loadTiledTexture(src: string, rx: number, ry: number): THREE.Texture {
  const t = new THREE.TextureLoader().load(src);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.repeat.set(rx, ry);
  return t;
}
/** 体素贴图 box：地台=顶面网格纹 + 四周侧纹；wall=六面侧墙纹。手绘 URL(topSrc/sideSrc) 优先，否则程序化。纹理按尺寸重复出网格。 */
// 体素方块的几何 + 六面材质（供单 mesh 与**实例化批**共用·同 voxelMode 签名的体素共享一份 → 实例化 1 draw call）。
export function buildVoxelGeoMats(m: Mesh3D): { geo: THREE.BoxGeometry; mats: THREE.Material[] } {
  const v = m.voxelTex!;
  const depth = mesh3dDepth(m.shape, m.width, m.height, m.depth);
  const tile = v.tile ?? 2;
  const rxTop = Math.max(1, Math.round(m.width / tile)), ryTop = Math.max(1, Math.round(depth / tile));
  const rxSide = Math.max(1, Math.round(m.width / tile)), rySide = Math.max(1, Math.round(m.height / tile));
  const topT = v.topSrc ? loadTiledTexture(v.topSrc, rxTop, ryTop) : buildVoxelTopTexture(v);
  const sideT = v.sideSrc ? loadTiledTexture(v.sideSrc, rxSide, rySide) : buildVoxelSideTexture(v);
  if (!v.topSrc) topT.repeat.set(rxTop, ryTop);
  if (!v.sideSrc) sideT.repeat.set(rxSide, rySide);
  const topMat = new THREE.MeshStandardMaterial({ map: topT, roughness: .85 });
  const sideMat = new THREE.MeshStandardMaterial({ map: sideT, roughness: .9 });
  // 面序 [px,nx,py,ny,pz,nz] = [右,左,顶,底,前,后]。地台：顶面用 topMat；wall：全用 sideMat。
  const mats = v.wall ? [sideMat, sideMat, sideMat, sideMat, sideMat, sideMat] : [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
  return { geo: new THREE.BoxGeometry(m.width, m.height, depth), mats };
}
export function buildVoxelMesh3D(m: Mesh3D): THREE.Mesh {
  const { geo, mats } = buildVoxelGeoMats(m);
  return new THREE.Mesh(geo, mats);
}
export function voxelMode(m: Mesh3D): string {
  const v = m.voxelTex!;
  return `vox|${m.width}|${m.height}|${m.depth ?? ''}|${v.top}|${v.side}|${v.top2 ?? ''}|${v.trim ?? ''}|${v.pattern ?? ''}|${v.wall ? 1 : 0}|${v.tile ?? ''}|${v.topSrc ?? ''}|${v.sideSrc ?? ''}`;
}

/** 加性辉光精灵的共享径向渐变贴图（白心→透明·复刻原型 glowSprite·全场共用一张、颜色由 SpriteMaterial.color 定）。 */
export function buildGlowTexture(): THREE.CanvasTexture {
  const s = 128, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const x = cv.getContext('2d')!;
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.4, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildSkyTexture(sky: Sky3D): THREE.CanvasTexture {
  const W = 512, H = 256;
  const hexstr = (n: number): string => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
  const rgba = (n: number, a: number): string => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, hexstr(sky.top));
  grad.addColorStop(1, hexstr(sky.bottom));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  if (sky.clouds) {
    const c = sky.cloudTint ?? 0xffffff;
    // 固定云团（x,y,半径）：横跨天顶→近地平线一带，大团叠小团堆出蓬松感。
    const puffs: Array<[number, number, number]> = [
      [70, 96, 52], [120, 78, 40], [165, 110, 46], [40, 124, 38],
      [250, 88, 56], [305, 72, 40], [350, 112, 48], [215, 130, 40],
      [430, 92, 54], [486, 76, 40], [398, 120, 46], [470, 134, 36],
      [150, 150, 34], [330, 152, 36], [60, 60, 30], [420, 56, 28],
    ];
    for (const [x, y, r] of puffs) {
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, rgba(c, 0.95));
      rg.addColorStop(0.55, rgba(c, 0.6));
      rg.addColorStop(1, rgba(c, 0));
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// 释放单 mesh 的几何 + 材质（含程序化 normal/roughness 贴图·这些是逐 mesh 生成·非共享缓存）。
export function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  disposeMeshMat(mesh.material);
  // 子网格（如卡通描边 outline hull·共享父几何 → 只释放其材质·几何随父已 dispose）。
  for (const child of mesh.children) { const cm = child as THREE.Mesh; if (cm.isMesh) disposeMeshMat(cm.material); }
}
function disposeMeshMat(m: THREE.Material | THREE.Material[]): void {
  (Array.isArray(m) ? m : [m]).forEach((x) => {
    const sm = x as THREE.MeshStandardMaterial;
    sm.normalMap?.dispose(); sm.roughnessMap?.dispose(); // 程序化表面贴图（surface-tex 生成·随 mesh 释放）
    x.dispose();
  });
}

// 释放整棵模型树（模板用）：遍历所有 Mesh 释放几何 + 材质。clone 实例不走此函数（几何共享·只释放实例材质）。
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const m = mesh.material;
    (Array.isArray(m) ? m : [m]).forEach((x) => x?.dispose());
  });
}
