import { describe, it, expect } from 'vitest';
import { collectAssetRefs, deriveAssetIndex } from './derive-asset-index.js';
import { spriteCapability, soundCapability } from '@atom-skills/index.js';
import type { EntityBlueprint } from './demo.assembly.js';
import type { AssetIndex } from '@assets/index.js';

const caps = [spriteCapability, soundCapability];
const ent = (c: Record<string, Record<string, unknown>>): Record<string, EntityBlueprint> => c as unknown as Record<string, EntityBlueprint>;

const GAME = ent({
  hero: { Sprite: { textureKey: 'hero_idle', anchorX: 0.5, anchorY: 0.5, zOrder: 1 } },
  bgm: { Sound: { clipId: 'bgm_daily', volume: 1, loop: true } },
  hero2: { Sprite: { textureKey: 'hero_idle', anchorX: 0.5, anchorY: 0.5, zOrder: 1 } }, // 同 key 复用
});

describe('R9 甲 — 从蓝图自动派生资产清单', () => {
  it('collectAssetRefs 收集被引用 key（去重，按 assetType 归类）', () => {
    const refs = collectAssetRefs(caps, GAME);
    expect(refs).toHaveLength(2); // hero_idle 去重
    const byKey = Object.fromEntries(refs.map((r) => [r.key, r.assetType]));
    expect(byKey).toEqual({ hero_idle: 'texture', bgm_daily: 'sound' });
  });

  it('deriveAssetIndex → tbf 购物单，类型正确，key 与逻辑同源', () => {
    const idx = deriveAssetIndex(caps, GAME);
    expect(idx.assets.map((a) => a.id).sort()).toEqual(['bgm_daily', 'hero_idle']);
    const hero = idx.assets.find((a) => a.id === 'hero_idle')!;
    expect(hero).toMatchObject({ type: 'texture', status: 'tbf' });
    expect(idx.assets.find((a) => a.id === 'bgm_daily')!.type).toBe('sound');
  });

  it('给 existing 时保留已 filled 的真资产，只把缺的列 tbf', () => {
    const existing: AssetIndex = {
      version: 3,
      assets: [{ id: 'hero_idle', type: 'texture', status: 'filled', path: 'texture/hero.png', description: '真图' }],
    };
    const idx = deriveAssetIndex(caps, GAME, { existing });
    expect(idx.version).toBe(3);
    expect(idx.assets.find((a) => a.id === 'hero_idle')).toMatchObject({ status: 'filled', path: 'texture/hero.png' });
    expect(idx.assets.find((a) => a.id === 'bgm_daily')).toMatchObject({ status: 'tbf' }); // 仍缺
  });

  it('无资产引用的蓝图 → 空清单', () => {
    const idx = deriveAssetIndex(caps, ent({ e: { Sprite: { textureKey: '', anchorX: 0, anchorY: 0, zOrder: 0 } } }));
    expect(idx.assets).toHaveLength(0); // 空 key 不计
  });
});
