// PBR 材质消费端（REQ-Resource ①·真实贴图走 texture-key 路线）：map 签名 + 贴图挂载 + 色彩空间/基色处理。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildPbrMaterial, buildShadedMaterial, buildOutline, toonGradient, pbrSig, applyMaterialRef, buildPbrMesh3D, type PbrMaps } from './material.js';
import { resolvePbr, type MaterialSpec } from '@assets/index.js';
import type { Mesh3D, Material3D } from '@engine/protocol/components.js';

const mesh = (): Mesh3D => ({ type: 'Mesh3D', shape: 'box', width: 8, height: 8, depth: 8, frontTint: 0xffffff });

describe('REQ-Resource ① 材质贴图消费端', () => {
  it('pbrSig 纳入 4 个贴图 key（map 变 → 重建 mesh）', () => {
    const base: Material3D = { type: 'Material3D', preset: 'wood' };
    const withMap: Material3D = { type: 'Material3D', preset: 'wood', map: 'tex/a', normalMap: 'tex/n' };
    expect(pbrSig(mesh(), base)).not.toBe(pbrSig(mesh(), withMap));
    // 换 normalMap key → 签名再变
    expect(pbrSig(mesh(), withMap)).not.toBe(pbrSig(mesh(), { ...withMap, normalMap: 'tex/n2' }));
    // 无 map 时两个同预设材质签名一致
    expect(pbrSig(mesh(), base)).toBe(pbrSig(mesh(), { type: 'Material3D', preset: 'wood' }));
  });

  it('buildPbrMaterial 挂 map/normalMap；有 albedo 图 → 基色置白（免二次染色）', () => {
    const def = resolvePbr('wood');
    const maps: PbrMaps = { map: new THREE.Texture(), normalMap: new THREE.Texture() };
    const m = buildPbrMaterial(def, undefined, maps);
    expect(m.map).toBe(maps.map);
    expect(m.normalMap).toBe(maps.normalMap);
    expect(m.color.getHex()).toBe(0xffffff); // albedo 图供色 → 白基
    expect(m.normalScale.x).toBe(1); // 真实法线图 normalScale=1
  });

  it('显式贴图覆盖程序化 surface（真实贴图优先）', () => {
    const def = resolvePbr('rock');
    const surfMap = buildPbrMaterial(def, { pattern: 'noise' }).normalMap; // 程序化法线
    const realNormal = new THREE.Texture();
    const m = buildPbrMaterial(def, { pattern: 'noise' }, { normalMap: realNormal });
    expect(m.normalMap).toBe(realNormal); // 显式覆盖程序化
    expect(m.normalMap).not.toBe(surfMap);
  });

  it('无贴图（仅预设）→ 不设 map·行为不变', () => {
    const m = buildPbrMaterial(resolvePbr('gold'));
    expect(m.map).toBeNull();
    expect(m.metalness).toBe(1);
  });
});

describe('REQ-Resource ④ 材质数据资产（applyMaterialRef）', () => {
  const spec: MaterialSpec = { preset: 'wood', map: 'tex/alb', normalMap: 'tex/nrm', roughness: 0.7 };

  it('materialRef 目录命中 → spec 作基底（preset/贴图 key 来自材质资源）', () => {
    const mat: Material3D = { type: 'Material3D', preset: 'matte', materialRef: 'mat/wood' };
    const eff = applyMaterialRef(mat, spec);
    expect(eff.preset).toBe('wood'); // 材质资源 preset 权威（压过 inline 'matte'）
    expect(eff.map).toBe('tex/alb');
    expect(eff.normalMap).toBe('tex/nrm');
    expect(eff.roughness).toBe(0.7);
    // 有效材质喂 pbrSig → 反映材质资源（与裸 matte 不同）
    expect(pbrSig(mesh(), eff)).not.toBe(pbrSig(mesh(), mat));
  });

  it('inline 字段覆盖材质资源（局部微调）', () => {
    const mat: Material3D = { type: 'Material3D', preset: 'matte', materialRef: 'mat/wood', roughness: 0.2, color: 0xff0000 };
    const eff = applyMaterialRef(mat, spec);
    expect(eff.roughness).toBe(0.2); // inline 覆盖 spec.roughness=0.7
    expect(eff.color).toBe(0xff0000); // spec 无 color → 用 inline
    expect(eff.map).toBe('tex/alb'); // 未 inline 覆盖 → 用 spec
  });

  it('目录查无（spec undefined）→ 原样返回（向后兼容）', () => {
    const mat: Material3D = { type: 'Material3D', preset: 'steel', materialRef: 'mat/missing' };
    expect(applyMaterialRef(mat, undefined)).toBe(mat);
  });

  it('新贴图槽（metalness/emissive/orm）经 spec 合成', () => {
    const s: MaterialSpec = { preset: 'steel', metalnessMap: 'tex/m', emissiveMap: 'tex/e', ormMap: 'tex/orm' };
    const eff = applyMaterialRef({ type: 'Material3D', preset: 'matte', materialRef: 'mat/x' }, s);
    expect(eff.metalnessMap).toBe('tex/m');
    expect(eff.emissiveMap).toBe('tex/e');
    expect(eff.ormMap).toBe('tex/orm');
  });
});

describe('超休闲缺口 F 平涂/卡通着色（buildShadedMaterial + shading 进 pbrSig）', () => {
  it("shading:'flat' → 无光 MeshBasicMaterial（纯亮色·map 供色置白基）", () => {
    const m = buildShadedMaterial(resolvePbr('gold'), 'flat');
    expect(m).toBeInstanceOf(THREE.MeshBasicMaterial);
    const withMap = buildShadedMaterial(resolvePbr('gold'), 'flat', undefined, undefined, { map: new THREE.Texture() });
    expect((withMap as THREE.MeshBasicMaterial).color.getHex()).toBe(0xffffff);
  });
  it("shading:'toon' → MeshToonMaterial 带 gradientMap（N 阶 LUT）", () => {
    const m = buildShadedMaterial(resolvePbr('jade'), 'toon', 4) as THREE.MeshToonMaterial;
    expect(m).toBeInstanceOf(THREE.MeshToonMaterial);
    expect(m.gradientMap).not.toBeNull();
  });
  it('toonGradient：阶数 → LUT 宽度（缓存复用同阶）·钳 [2,8]', () => {
    expect(toonGradient(3).image.width).toBe(3);
    expect(toonGradient(3)).toBe(toonGradient(3)); // 同阶缓存复用
    expect(toonGradient(99).image.width).toBe(8);  // 上钳
    expect(toonGradient(1).image.width).toBe(2);   // 下钳
  });
  it('shading/toonSteps 进 pbrSig（改着色模型 → 重建 mesh）', () => {
    const base: Material3D = { type: 'Material3D', preset: 'jade' };
    expect(pbrSig(mesh(), base)).not.toBe(pbrSig(mesh(), { ...base, shading: 'toon' }));
    expect(pbrSig(mesh(), { ...base, shading: 'toon', toonSteps: 3 })).not.toBe(pbrSig(mesh(), { ...base, shading: 'toon', toonSteps: 5 }));
    expect(pbrSig(mesh(), { ...base, shading: 'flat' })).not.toBe(pbrSig(mesh(), { ...base, shading: 'toon' }));
  });
  it('卡通描边 buildOutline：背面外扩壳（BackSide·实色·法线位移 shader）', () => {
    const geo = new THREE.SphereGeometry(1, 8, 8);
    const om = buildOutline(geo, { width: 0.05, color: 0x101010 });
    expect(om).toBeInstanceOf(THREE.Mesh);
    const mat = om.material as THREE.MeshBasicMaterial;
    expect(mat.side).toBe(THREE.BackSide);
    expect(mat.color.getHex()).toBe(0x101010);
    expect(om.geometry).toBe(geo);        // 共享父几何（不复制）
    expect(om.castShadow).toBe(false);
    expect(typeof mat.onBeforeCompile).toBe('function'); // 注入法线外扩顶点位移
  });
  it('outline 进 pbrSig（改描边 → 重建 mesh）', () => {
    const base: Material3D = { type: 'Material3D', preset: 'jade' };
    expect(pbrSig(mesh(), base)).not.toBe(pbrSig(mesh(), { ...base, outline: { width: 0.03 } }));
    expect(pbrSig(mesh(), { ...base, outline: { width: 0.03 } })).not.toBe(pbrSig(mesh(), { ...base, outline: { width: 0.06 } }));
  });
});

describe('REQ-3D ④ 贴图槽补齐 pbrSig（新槽 + tiling 进签名）', () => {
  const base: Material3D = { type: 'Material3D', preset: 'steel' };
  it('metalness/emissive/orm map key 变 → 签名变（重建）', () => {
    expect(pbrSig(mesh(), base)).not.toBe(pbrSig(mesh(), { ...base, metalnessMap: 'tex/m' }));
    expect(pbrSig(mesh(), base)).not.toBe(pbrSig(mesh(), { ...base, emissiveMap: 'tex/e' }));
    expect(pbrSig(mesh(), base)).not.toBe(pbrSig(mesh(), { ...base, ormMap: 'tex/orm' }));
  });
  it('tiling 变 → 签名变（同图不同平铺 → 各自重建）', () => {
    const t1: Material3D = { ...base, map: 'tex/a', tiling: { repeat: 2 } };
    const t2: Material3D = { ...base, map: 'tex/a', tiling: { repeat: 4 } };
    expect(pbrSig(mesh(), t1)).not.toBe(pbrSig(mesh(), t2));
    expect(pbrSig(mesh(), t1)).not.toBe(pbrSig(mesh(), { ...base, map: 'tex/a' })); // 有无 tiling 也不同
  });
});

describe('REQ-3D-MAT-ALPHA 透明贴图路（alphaTest/transparent opt-in）', () => {
  const wood: Material3D = { type: 'Material3D', preset: 'wood' };
  it('缺省不动=不透明（three 默认 alphaTest 0·transparent false）', () => {
    const mat = buildPbrMesh3D(mesh(), wood).material as THREE.Material;
    expect(mat.alphaTest).toBe(0);
    expect(mat.transparent).toBe(false);
  });
  it('alphaTest → material.alphaTest 生效（cutout·透明底 PNG 裁剪）', () => {
    const mat = buildPbrMesh3D(mesh(), { ...wood, alphaTest: 0.5 }).material as THREE.Material;
    expect(mat.alphaTest).toBe(0.5);
  });
  it('transparent → material.transparent 生效（软混合）', () => {
    const mat = buildPbrMesh3D(mesh(), { ...wood, transparent: true }).material as THREE.Material;
    expect(mat.transparent).toBe(true);
  });
  it('pbrSig 纳入 alphaTest/transparent（改 → 重建 mesh）', () => {
    expect(pbrSig(mesh(), wood)).not.toBe(pbrSig(mesh(), { ...wood, alphaTest: 0.5 }));
    expect(pbrSig(mesh(), wood)).not.toBe(pbrSig(mesh(), { ...wood, transparent: true }));
  });
});
