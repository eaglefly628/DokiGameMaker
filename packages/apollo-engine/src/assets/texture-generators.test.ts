import { describe, it, expect, afterEach } from 'vitest';
import {
  registerTextureGenerator, hasTextureGenerator, resolveGeneratedSrc, generatorSpecOf,
  unregisterTextureGeneratorForTest,
} from './texture-generators.js';
import { parseAssetIndex, registerAssetIndex } from './asset-index.js';
import { AssetManager } from './asset-manager.js';
import type { AssetDescriptor, LoadedAsset } from './asset-types.js';

// REQ-VECTOR-ART 步3（Lead 2026-07-13 契约）：texture + spec.generator = 程序矢量一等公民。
// 四腿=PST 原单验收：raster/generator 同 key 都渲染、切换零改调用点、生成器确定性、校验负腿。

const svgUri = (fill: string, size: number): string =>
  'data:image/svg+xml;base64,' + Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect fill="${fill}" width="${size}" height="${size}"/></svg>`,
  ).toString('base64');

const GEN = 'test-flat-tile';
afterEach(() => unregisterTextureGeneratorForTest(GEN));

function register(): void {
  registerTextureGenerator(GEN, (p) => svgUri(String(p.fill ?? '#000'), Number(p.size ?? 8)));
}

/** 假 loader：记住每次 load 的 src——「渲染器拿到什么」的观测点。 */
function spyManager(): { mgr: AssetManager; srcs: Map<string, string> } {
  const srcs = new Map<string, string>();
  const mgr = new AssetManager({
    load: async (d: AssetDescriptor): Promise<Pick<LoadedAsset, 'handle' | 'width' | 'height'>> => {
      srcs.set(d.key, (d as { src: string }).src);
      return { handle: d.key, width: 8, height: 8 };
    },
  });
  return { mgr, srcs };
}

describe('texture-generators · 注册表与确定性', () => {
  it('确定性：同 params 永远同 data-URI；不同 params 不同图（双皮=两组 params）', () => {
    register();
    const a1 = resolveGeneratedSrc({ name: GEN, params: { fill: '#e8cd82', size: 8 } });
    const a2 = resolveGeneratedSrc({ name: GEN, params: { fill: '#e8cd82', size: 8 } });
    const b = resolveGeneratedSrc({ name: GEN, params: { fill: '#8fd0ff', size: 8 } });
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    expect(a1.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('重名登记抛错（静默覆盖=悄悄换图）；未登记 resolve 明报', () => {
    register();
    expect(() => register()).toThrow(/重名/);
    expect(() => resolveGeneratedSrc({ name: 'no-such-gen' })).toThrow(/未登记/);
    expect(hasTextureGenerator('no-such-gen')).toBe(false);
  });
});

describe('asset-index × generator · 同 key 双来源（热替换=只改索引）', () => {
  const rasterEntry = { id: 'g.felt', type: 'texture', description: '牌桌呢面', status: 'filled', path: 'tex/felt.png' };
  const vectorEntry = {
    id: 'g.felt', type: 'texture', description: '牌桌呢面', status: 'filled',
    spec: { generator: { name: GEN, params: { fill: '#e8cd82', size: 8 } } },
  };

  it('generator 条目免 path 可 parse；同 id 指 raster 或 generator 都注册成功·消费端同一 key', async () => {
    register();
    // raster 版
    const { mgr: m1, srcs: s1 } = spyManager();
    registerAssetIndex(m1, parseAssetIndex({ version: 1, assets: [rasterEntry] }), 'assets');
    await m1.load('g.felt');
    expect(s1.get('g.felt')).toBe('assets/tex/felt.png');
    // 矢量版（同一 id·只改索引条目——调用点/textureKey 零改）
    const { mgr: m2, srcs: s2 } = spyManager();
    registerAssetIndex(m2, parseAssetIndex({ version: 1, assets: [vectorEntry] }), 'assets');
    await m2.load('g.felt');
    expect(s2.get('g.felt')!.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('registerAssetIndex 期未登记的生成器名=明报早失败', () => {
    const idx = parseAssetIndex({ version: 1, assets: [vectorEntry] });
    expect(() => registerAssetIndex(spyManager().mgr, idx, 'assets')).toThrow(/未登记的生成器/);
  });

  it('校验负腿：generator 形状坏/params 非纯数据 → parse 拒；缺 path 且无 generator 的 filled 仍拒', () => {
    expect(() => parseAssetIndex({ version: 1, assets: [{ ...vectorEntry, spec: { generator: { name: '' } } }] }))
      .toThrow(/generator\.name/);
    expect(() => parseAssetIndex({
      version: 1,
      assets: [{ ...vectorEntry, spec: { generator: { name: GEN, params: { bad: { nested: 1 } } } } }],
    })).toThrow(/number\|string\|boolean/);
    expect(() => parseAssetIndex({ version: 1, assets: [{ id: 'x', type: 'texture', description: 'x', status: 'filled' }] }))
      .toThrow(/缺 path/);
  });
});
