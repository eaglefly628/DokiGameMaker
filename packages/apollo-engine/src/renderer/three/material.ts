import * as THREE from 'three';
import type { Mesh3D, Material3D, SurfaceDetail } from '@engine/protocol/components.js';
import { resolvePbr, type PbrMaterialDef, type MaterialSpec } from '@assets/index.js';
import { buildSurfaceMaps } from './surface-tex.js';
import { roundGeo } from './geometry.js';

// ═══════════════════════════════════════════════════════════════
//  three/material —— PBR 材质（TA Phase 5·render-only）。据 `Material3D` 预设 + 覆盖建物理材质。
//  金属/介电走 MeshStandardMaterial；玻璃(transmission>0)走 MeshPhysicalMaterial（透射/折射）。
//  数据全来自美术库 `assets/pbr-materials` 的闭集预设。
// ═══════════════════════════════════════════════════════════════

// 已解析的真实贴图（REQ-Resource ①·渲染器据 Material3D map key 从 AssetManager 取好、**色彩空间已按用途设**·传入）。
export interface PbrMaps {
  map?: THREE.Texture; // albedo·sRGB
  normalMap?: THREE.Texture; // 线性
  roughnessMap?: THREE.Texture; // 线性
  aoMap?: THREE.Texture; // 线性
  metalnessMap?: THREE.Texture; // 线性（REQ-3D ④）
  emissiveMap?: THREE.Texture; // sRGB（REQ-3D ④）
  ormMap?: THREE.Texture; // 打包图·线性（REQ-3D ④·同图挂 ao/rough/metal 三槽）
}

// REQ-Resource ④：材质数据资产（MaterialSpec）→ 合成有效 Material3D。
// `spec` 作基底（材质资源权威·尤其 preset + 引的 texture key）；inline `mat` 已定义的字段覆盖之（局部微调）。
// spec 缺省（materialRef 未设 / 目录查无）→ 原样返回 mat（向后兼容·纯 inline 路径）。render-only·纯数据合成。
export function applyMaterialRef(mat: Material3D, spec: MaterialSpec | undefined): Material3D {
  if (!spec) return mat;
  return {
    type: 'Material3D',
    preset: spec.preset ?? mat.preset, // 材质资源的 preset 权威；无则用 inline 后备
    color: mat.color ?? spec.color,
    roughness: mat.roughness ?? spec.roughness,
    metalness: mat.metalness ?? spec.metalness,
    emissive: mat.emissive ?? spec.emissive,
    emissiveIntensity: mat.emissiveIntensity,
    surface: mat.surface,
    map: mat.map ?? spec.map,
    normalMap: mat.normalMap ?? spec.normalMap,
    roughnessMap: mat.roughnessMap ?? spec.roughnessMap,
    aoMap: mat.aoMap ?? spec.aoMap,
    metalnessMap: mat.metalnessMap ?? spec.metalnessMap,
    emissiveMap: mat.emissiveMap ?? spec.emissiveMap,
    ormMap: mat.ormMap ?? spec.ormMap,
    tiling: mat.tiling,
    materialRef: mat.materialRef,
  };
}

// 卡通渐变 LUT（gradientMap·N 阶阶梯·NearestFilter → 硬分段明暗）。缓存按阶数复用。
const toonGradients = new Map<number, THREE.DataTexture>();
export function toonGradient(steps = 3): THREE.DataTexture {
  const n = Math.max(2, Math.min(8, Math.round(steps)));
  let tex = toonGradients.get(n);
  if (tex) return tex;
  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.round((i / (n - 1)) * 255);
  tex = new THREE.DataTexture(data, n, 1, THREE.RedFormat);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  toonGradients.set(n, tex);
  return tex;
}

// 平涂/卡通着色（超休闲缺口 F·render-only）：'flat'=无光 MeshBasicMaterial（纯亮色·完全不受光）；
//   'toon'=MeshToonMaterial（gradientMap 阶梯明暗·cel 观感·支持 normal/ao/emissive 贴图·不吃 metal/rough）。
export function buildShadedMaterial(def: PbrMaterialDef, shading: 'toon' | 'flat', steps?: number, surface?: SurfaceDetail, maps?: PbrMaps): THREE.Material {
  if (shading === 'flat') {
    const m = new THREE.MeshBasicMaterial({ color: def.color & 0xffffff });
    if (maps?.map) { m.map = maps.map; m.color.setHex(0xffffff); } // albedo 图供色 → 基色置白
    return m;
  }
  const m = new THREE.MeshToonMaterial({ color: def.color & 0xffffff, gradientMap: toonGradient(steps ?? 3) });
  if (def.emissive !== undefined) { m.emissive.setHex(def.emissive & 0xffffff); m.emissiveIntensity = def.emissiveIntensity ?? 1; }
  if (surface) { const s = buildSurfaceMaps(surface, def.roughness); m.normalMap = s.normalMap; m.normalScale = new THREE.Vector2(surface.normal ?? 1, surface.normal ?? 1); }
  if (maps) {
    if (maps.map) { m.map = maps.map; m.color.setHex(0xffffff); }
    if (maps.normalMap) { m.normalMap = maps.normalMap; m.normalScale = new THREE.Vector2(1, 1); }
    if (maps.aoMap) m.aoMap = maps.aoMap;
    if (maps.emissiveMap) { m.emissiveMap = maps.emissiveMap; m.emissive.setHex(0xffffff); m.emissiveIntensity = def.emissiveIntensity ?? 1; }
    m.needsUpdate = true;
  }
  return m;
}

// 预设 → three 材质。surface 在场 → 程序化生成 normal/roughness 挂上；**显式 maps 覆盖同通道**（真实贴图优先·render-only）。
export function buildPbrMaterial(def: PbrMaterialDef, surface?: SurfaceDetail, maps?: PbrMaps): THREE.MeshStandardMaterial {
  let m: THREE.MeshStandardMaterial;
  if (def.transmission && def.transmission > 0) {
    m = new THREE.MeshPhysicalMaterial({
      color: def.color & 0xffffff, roughness: def.roughness, metalness: def.metalness,
      transmission: def.transmission, ior: def.ior ?? 1.5,
      transparent: true, opacity: def.opacity ?? 1, thickness: 1,
    });
  } else {
    m = new THREE.MeshStandardMaterial({ color: def.color & 0xffffff, roughness: def.roughness, metalness: def.metalness });
    if (def.emissive !== undefined) { m.emissive.setHex(def.emissive & 0xffffff); m.emissiveIntensity = def.emissiveIntensity ?? 1; }
  }
  if (surface) {
    const s = buildSurfaceMaps(surface, def.roughness);
    m.normalMap = s.normalMap;
    m.normalScale = new THREE.Vector2(surface.normal ?? 1, surface.normal ?? 1);
    m.roughnessMap = s.roughnessMap; // 与 material.roughness 相乘 → 凸光凹哑的起伏
  }
  if (maps) { // 真实贴图覆盖程序化（显式优先）
    if (maps.map) { m.map = maps.map; m.color.setHex(0xffffff); } // albedo 图供色 → 基色置白·免二次染色（PBR 惯例）
    if (maps.normalMap) { m.normalMap = maps.normalMap; m.normalScale = new THREE.Vector2(1, 1); }
    if (maps.ormMap) { m.aoMap = maps.ormMap; m.roughnessMap = maps.ormMap; m.metalnessMap = maps.ormMap; m.roughness = 1; m.metalness = 1; } // 打包图先挂三槽（three 读 R/G/B）·系数置 1 让贴图主导
    if (maps.roughnessMap) m.roughnessMap = maps.roughnessMap; // 显式单图覆盖 ORM 对应通道
    if (maps.metalnessMap) { m.metalnessMap = maps.metalnessMap; m.metalness = 1; }
    if (maps.aoMap) m.aoMap = maps.aoMap;
    if (maps.emissiveMap) { m.emissiveMap = maps.emissiveMap; m.emissive.setHex(0xffffff); m.emissiveIntensity = def.emissiveIntensity ?? 1; } // 自发光贴图需基色非黑才显 → 置白·贴图供色
    m.needsUpdate = true;
  }
  return m;
}

// 卡通描边（inverted-hull·render-only）：共享父几何的**背面壳**·顶点沿法线外扩 width → 物体轮廓一圈实色边。
// 背面渲染（BackSide）→ 只有超出主体的边缘可见；主体正面材质盖在上面。凸形/常规道具最干净。
export function buildOutline(geo: THREE.BufferGeometry, o: { width?: number; color?: number }): THREE.Mesh {
  const width = o.width ?? 0.03;
  const mat = new THREE.MeshBasicMaterial({ color: (o.color ?? 0x000000) & 0xffffff, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['outlineWidth'] = { value: width };
    shader.vertexShader = 'uniform float outlineWidth;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n transformed += normalize(normal) * outlineWidth;', // 沿法线外扩
    );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false; mesh.receiveShadow = false; // 描边不投影/不受影
  return mesh;
}

// Material3D + Mesh3D → 单 mesh（特征物件·不进哑光实例化批）。maps=渲染器已解析的真实贴图（色彩空间已设）。
export function buildPbrMesh3D(m: Mesh3D, mat: Material3D, maps?: PbrMaps): THREE.Mesh {
  const def = resolvePbr(mat.preset, mat);
  const rg = roundGeo(m); // 圆润单材质图元（sphere/cylinder/cone/capsule/torus）·三处几何工厂共用
  const geo = rg ?? (m.shape === 'plane'
    ? new THREE.PlaneGeometry(m.width, m.height)
    : new THREE.BoxGeometry(m.width, m.height, m.depth ?? m.width));
  if ((maps?.aoMap || maps?.ormMap) && geo.attributes['uv'] && !geo.attributes['uv2']) {
    geo.setAttribute('uv2', geo.attributes['uv']!); // aoMap/ORM 的 AO 通道走第二套 UV·盒/球无 uv2 → 复用 uv
  }
  const material = mat.shading
    ? buildShadedMaterial(def, mat.shading, mat.toonSteps, mat.surface, maps) // 平涂/卡通着色（超休闲）
    : buildPbrMaterial(def, mat.surface, maps); // PBR 物理（缺省）
  // 透明贴图路（REQ-3D-MAT-ALPHA·opt-in·缺省不动=现行不透明）：让 map 的 alpha 通道生效（透明底 PNG 不渲成黑）。
  if (mat.alphaTest !== undefined || mat.transparent) {
    if (mat.alphaTest !== undefined) material.alphaTest = mat.alphaTest; // cutout·硬边·无排序坑
    if (mat.transparent) material.transparent = true; // 软混合
    material.needsUpdate = true;
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = mat.shading !== 'flat'; // 无光平涂不吃阴影（MeshBasicMaterial 不响应光）
  if (mat.outline) mesh.add(buildOutline(geo, mat.outline)); // 卡通描边：共享几何的背面外扩壳（子网格·随父变换）
  return mesh;
}

// 材质签名（preset + 覆盖 + 形状尺寸 + 表面细节 + **真实贴图 key** 变 → 重建 mesh）。贴图就绪态由渲染器另加进 mode。
export function pbrSig(m: Mesh3D, mat: Material3D): string {
  const s = mat.surface;
  const ss = s ? `${s.pattern}.${s.tiles ?? ''}.${s.normal ?? ''}.${s.rough ?? ''}.${s.scale ?? ''}` : '';
  const mk = `${mat.map ?? ''}.${mat.normalMap ?? ''}.${mat.roughnessMap ?? ''}.${mat.aoMap ?? ''}.${mat.metalnessMap ?? ''}.${mat.emissiveMap ?? ''}.${mat.ormMap ?? ''}`;
  const tl = mat.tiling ? `${mat.tiling.repeat ?? ''}.${mat.tiling.offset?.[0] ?? ''}.${mat.tiling.offset?.[1] ?? ''}` : '';
  const ol = mat.outline ? `${mat.outline.width ?? ''}.${mat.outline.color ?? ''}` : '';
  return `pbr|${mat.preset}|${mat.shading ?? ''}|${mat.toonSteps ?? ''}|${ol}|${mat.color ?? ''}|${mat.roughness ?? ''}|${mat.metalness ?? ''}|${mat.emissive ?? ''}|${m.shape}|${m.width}|${m.height}|${m.depth ?? ''}|${ss}|${mk}|${tl}|${mat.alphaTest ?? ''}|${mat.transparent ? 't' : ''}`;
}
