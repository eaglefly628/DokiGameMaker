// REQ-PA-3D公用货架：共享货架（assets/index.json）应备齐公用 3D 基础素材——
// 材质(数据型)/基础 mesh(glb)/程序化贴图/天空盒。守护 gen-shelf-3d.mjs 产物长期在册且合法。
// 游戏不直引这些货架条目 → 用 scripts/vendor-asset.mjs copy 进本地 art/ 再引（见 game-z/vendor.test.ts）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseAssetIndex, buildMaterialCatalog } from './asset-index.js';

describe('REQ-PA-3D公用货架 · 共享货架公用 3D 素材', () => {
  const idx = parseAssetIndex(JSON.parse(readFileSync('assets/index.json', 'utf8')));
  const byId = new Map(idx.assets.map((a) => [a.id, a]));

  it('公用材质在册（数据型·无 path·进 buildMaterialCatalog）', () => {
    const catalog = buildMaterialCatalog(idx);
    for (const p of ['matte', 'steel', 'gold', 'glass', 'wood', 'emissive']) {
      const e = byId.get(`mat/${p}`);
      expect(e?.type).toBe('material');
      expect(e?.path).toBeUndefined();
      expect(catalog.get(`mat/${p}`)).toMatchObject({ preset: p });
    }
  });

  it('基础 mesh 在册（glb 文件·spec scale/genCollision）', () => {
    for (const [name, gc] of [['plane', 'none'], ['cube', 'box'], ['sphere', 'hull']] as const) {
      const e = byId.get(`mesh/${name}`);
      expect(e?.type).toBe('mesh');
      expect(e?.path).toBe(`meshes/${name}.glb`);
      expect(e?.spec).toMatchObject({ scale: 1, genCollision: gc });
    }
  });

  it('程序化贴图 + 天空盒在册（usage 闭集·法线线性）', () => {
    expect(byId.get('tex/plank_albedo')?.spec).toMatchObject({ usage: 'albedo' });
    expect(byId.get('tex/plank_normal')?.spec).toMatchObject({ usage: 'normal' }); // 法线→colorSpace 自动 linear
    expect(byId.get('env/sky-gradient')?.type).toBe('texture');
    expect(byId.get('env/sky-gradient')?.category).toBe('skybox');
  });

  it('程序化 PBR 材质库：各品类材质引 albedo/normal/roughness 贴图 key（catalog 传递）', () => {
    const catalog = buildMaterialCatalog(idx);
    for (const cat of ['brick', 'cobblestone', 'grass', 'sand', 'concrete', 'metal', 'fabric', 'tile', 'gravel']) {
      const m = catalog.get(`mat/${cat}`);
      expect(m?.map).toBe(`tex/pbr/${cat}_albedo`);
      expect(m?.normalMap).toBe(`tex/pbr/${cat}_normal`);
      expect(m?.roughnessMap).toBe(`tex/pbr/${cat}_rough`);
      // 每张引用的贴图都真在册（无悬空 key）
      for (const suffix of ['albedo', 'normal', 'rough']) expect(byId.has(`tex/pbr/${cat}_${suffix}`)).toBe(true);
    }
    expect(catalog.get('mat/metal')?.metalness).toBe(1); // 金属类金属度=1
    expect(byId.get('tex/pbr/grass_normal')?.spec).toMatchObject({ usage: 'normal' }); // 法线线性
  });
});
