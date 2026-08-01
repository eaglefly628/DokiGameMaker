import { describe, it, expect } from 'vitest';
import { resolveArtRefs } from './resolve-art-refs.js';
import { artlibRecords, rankRecords } from '@assets/index.js';
import type { ArtLibIndex } from '@assets/artlib.js';

// 小型素材索引：经真实 artlibRecords 适配（语义标签由 artlib-tags.ts 现算合并）。
const index: ArtLibIndex = {
  version: 1,
  source: 'DCSS — test',
  license: 'CC0 (public domain)',
  root: 'assets/FreeArtLib',
  basePixel: 32,
  fileCount: 4,
  assetCount: 4,
  cats: { monster: 2, dungeon: 1, item: 1 },
  slots: { 'sprite.character': 2, tile: 1, 'icon.item': 1 },
  assets: [
    { id: 'monster/undead/skeleton_warrior', cat: 'monster', sub: 'undead', subject: 'skeleton_warrior', slot: 'sprite.character', transparent: true, variants: 1, sample: 'skeleton_warrior.png' },
    { id: 'monster/animals/wolf', cat: 'monster', sub: 'animals', subject: 'wolf', slot: 'sprite.character', transparent: true, variants: 1, sample: 'wolf.png' },
    { id: 'dungeon/floor/grass', cat: 'dungeon', sub: 'floor/grass', subject: 'grass_flowers', slot: 'tile', transparent: false, variants: 4, sample: 'grass_flowers_1.png' },
    { id: 'item/weapon/long_sword', cat: 'item', sub: 'weapon', subject: 'long_sword', slot: 'icon.item', transparent: true, variants: 1, sample: 'long_sword.png' },
  ],
};
const records = artlibRecords(index);

describe('rankRecords — 选材排序（与浏览器同一个排序器）', () => {
  it('名称精确命中压过 tag 命中；AND 不全中即出局', () => {
    const r = rankRecords(records, 'wolf');
    expect(r[0].record.id).toBe('monster/animals/wolf');
    expect(rankRecords(records, 'wolf dragon')).toHaveLength(0);
  });
  it('语义标签可检索（undead 来自 CAT_TAGS 像素扫描层）', () => {
    const r = rankRecords(records, 'undead warrior');
    expect(r[0].record.id).toBe('monster/undead/skeleton_warrior');
  });
  it('确定性：同查询同输入永远同序', () => {
    const a = rankRecords(records, 'monster').map((x) => x.record.id);
    const b = rankRecords(records, 'monster').map((x) => x.record.id);
    expect(a).toEqual(b);
  });
});

describe('resolveArtRefs — manifest 里的 art: 引用', () => {
  const raw = {
    name: 'g',
    capabilities: ['a1-transform'],
    entities: {
      hero: {
        Transform: { x: 1, y: 2 },
        Sprite: { textureKey: 'art:skeleton warrior', anchorX: 0.5 },
      },
      ground: { Sprite: { textureKey: 'art:floor grass' } },
      plain: { Sprite: { textureKey: 'je.joker.dna' } }, // 非 art: 原样
      ghost: { Sprite: { textureKey: 'art:nonexistent_thing_xyz' } }, // 无命中
    },
  };

  it('top-1 替换 + 无命中原样保留 + 留痕可审计', () => {
    const { manifest, resolutions } = resolveArtRefs(raw, records);
    const m = manifest as typeof raw;
    expect(m.entities.hero.Sprite.textureKey).toBe('monster/undead/skeleton_warrior');
    expect(m.entities.ground.Sprite.textureKey).toBe('dungeon/floor/grass');
    expect(m.entities.plain.Sprite.textureKey).toBe('je.joker.dna');
    expect(m.entities.ghost.Sprite.textureKey).toBe('art:nonexistent_thing_xyz');

    expect(resolutions).toHaveLength(3); // hero + ground + ghost（plain 不是 art:）
    const hero = resolutions.find((r) => r.entity === 'hero')!;
    expect(hero).toMatchObject({ component: 'Sprite', field: 'textureKey', query: 'skeleton warrior', id: 'monster/undead/skeleton_warrior' });
    expect(hero.candidates.length).toBeGreaterThan(0);
    expect(resolutions.find((r) => r.entity === 'ghost')!.id).toBeNull();
  });

  it('纯函数：输入不被修改；其它字段原样', () => {
    resolveArtRefs(raw, records);
    expect(raw.entities.hero.Sprite.textureKey).toBe('art:skeleton warrior');
    const { manifest } = resolveArtRefs(raw, records);
    const m = manifest as typeof raw;
    expect(m.name).toBe('g');
    expect(m.entities.hero.Transform).toEqual({ x: 1, y: 2 });
  });

  it('无 entities / 非对象输入 → 原样直通', () => {
    expect(resolveArtRefs(null, records).manifest).toBeNull();
    expect(resolveArtRefs({ name: 'x' }, records).resolutions).toHaveLength(0);
  });
});

describe('prefab 模板内 art: 解析（game-m 换装共性洞·2026-07-09）', () => {
  it('templates.*.entities 里的 art: 同样解析·输入不被污染·路径=prefab:宿主:模板:实体', () => {
    const raw = {
      entities: {
        lib: { PrefabLibrary: { templates: { tpl_d1: { entities: { layer: { Sprite: { textureKey: 'art:skeleton warrior' } } } } } } },
      },
    };
    const before = JSON.stringify(raw);
    const { manifest, resolutions } = resolveArtRefs(raw, records);
    expect(JSON.stringify(raw)).toBe(before); // 纯函数：输入零污染
    const r = resolutions.find((x) => x.entity === 'prefab:lib:tpl_d1:layer');
    expect(r?.id).toBe('monster/undead/skeleton_warrior');
    const m = manifest as typeof raw;
    expect(m.entities.lib.PrefabLibrary.templates.tpl_d1.entities.layer.Sprite.textureKey).toBe('monster/undead/skeleton_warrior');
  });
});
