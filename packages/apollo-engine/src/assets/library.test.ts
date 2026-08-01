import { describe, it, expect } from 'vitest';
import {
  projectRecords,
  artlibRecords,
  manifestRecords,
  queryLibrary,
  rankRecords,
  libraryCounts,
  inferCategory,
  expandAliases,
  LIBRARY_TAXONOMY,
  categoryLabel,
  type AliasMap,
} from './library.js';
import { parseAssetIndex } from './asset-index.js';
import type { ArtLibIndex } from './artlib.js';
import type { AssetManifest } from './asset-types.js';
import realAliases from '../../assets/curated/search-aliases.json';

const projIndex = parseAssetIndex({
  version: 1,
  assets: [
    { id: 'bg.office', type: 'texture', description: '办公室', status: 'tbf', spec: { width: 1280, height: 720 } },
    { id: 'hero.idle', type: 'texture', description: '英雄', status: 'filled', path: 'texture/hero.png', category: 'sprite.character', tags: ['hero'], license: 'CC0' },
    { id: 'bgm.daily', type: 'sound', description: '日常BGM', status: 'tbf' },
  ],
});

const artIndex: ArtLibIndex = {
  version: 1,
  source: 'DCSS — opengameart.org',
  license: 'CC0 (public domain)',
  root: 'assets/FreeArtLib',
  basePixel: 32,
  fileCount: 3,
  assetCount: 2,
  cats: { monster: 1, item: 1 },
  slots: { 'sprite.character': 1, 'icon.item': 1 },
  assets: [
    { id: 'monster/undead/skeleton', cat: 'monster', sub: 'undead', subject: 'skeleton', slot: 'sprite.character', transparent: true, variants: 2, sample: 'skeleton_1.png' },
    { id: 'item/weapon/axe', cat: 'item', sub: 'weapon', subject: 'axe', slot: 'icon.item', transparent: true, variants: 1, sample: 'axe.png' },
  ],
};

const gameManifest: AssetManifest = [
  { kind: 'texture', key: 'f.hero.guan_yu', src: 'assets/FreeArtLib/monster/death_knight.png', width: 32, height: 32 },
  { kind: 'texture', key: 'f.fx.strike', src: 'data:image/svg+xml,<svg/>', width: 24, height: 24 },
  { kind: 'sprite-sheet', key: 'd.hero.sheet', src: 'data:image/svg+xml,<svg/>', frameWidth: 24, frameHeight: 24, columns: 4, count: 8 },
];

describe('library — 三来源适配', () => {
  it('projectRecords：显式 category 优先，缺省按 id 推断；filled 贴图才有 thumb', () => {
    const rs = projectRecords(projIndex);
    expect(rs.find((r) => r.id === 'bg.office')).toMatchObject({ category: 'background', status: 'tbf', thumb: undefined, source: 'project' });
    expect(rs.find((r) => r.id === 'hero.idle')).toMatchObject({ category: 'sprite.character', thumb: '/assets/texture/hero.png', license: 'CC0' });
    expect(rs.find((r) => r.id === 'bgm.daily')).toMatchObject({ type: 'sound', category: 'bgm' });
  });

  it('artlibRecords：slot 即分类，CC0，缩略图为 sample 路径', () => {
    const rs = artlibRecords(artIndex);
    expect(rs[0]).toMatchObject({
      id: 'monster/undead/skeleton',
      category: 'sprite.character',
      license: 'CC0',
      status: 'filled',
      thumb: '/assets/FreeArtLib/monster/undead/skeleton_1.png',
      variants: 2,
    });
    expect(rs[0].tags).toContain('undead');
  });

  it('manifestRecords：data: 内联 → placeholder；文件引用 → filled；sheet 归精灵表类', () => {
    const rs = manifestRecords('game-f', gameManifest);
    expect(rs[0]).toMatchObject({ status: 'filled', thumb: '/assets/FreeArtLib/monster/death_knight.png', sourceLabel: 'game-f' });
    expect(rs[1]).toMatchObject({ status: 'placeholder', category: 'misc' });
    expect(rs[2]).toMatchObject({ category: 'sheet', variants: 8 });
  });
});

describe('library — 查询/计数', () => {
  const all = [...projectRecords(projIndex), ...artlibRecords(artIndex), ...manifestRecords('game-f', gameManifest)];

  it('文本分词全命中', () => {
    expect(queryLibrary(all, { text: 'undead skeleton' })).toHaveLength(1);
    expect(queryLibrary(all, { text: 'undead dragon' })).toHaveLength(0);
  });

  it('维度过滤：type/category/status/source/tags 叠加', () => {
    expect(queryLibrary(all, { type: 'sound' })).toHaveLength(1);
    expect(queryLibrary(all, { type: 'texture', category: 'sprite.character' })).toHaveLength(2);
    expect(queryLibrary(all, { status: 'placeholder' })).toHaveLength(2);
    expect(queryLibrary(all, { sources: ['artlib'] })).toHaveLength(2);
    expect(queryLibrary(all, { tags: ['undead'] })).toHaveLength(1);
  });

  it('排序：variants 降序', () => {
    const rs = queryLibrary(all, { type: 'texture', sort: 'variants' });
    expect(rs[0].variants ?? 0).toBeGreaterThanOrEqual(rs[1].variants ?? 0);
  });

  it('libraryCounts：type 与 type/category 双层计数', () => {
    const c = libraryCounts(all);
    expect(c.get('texture')).toBe(7);
    expect(c.get('sound')).toBe(1);
    expect(c.get('texture/sprite.character')).toBe(2);
  });
});

describe('library — 语义标签与相关度排序', () => {
  const arts = artlibRecords(artIndex);

  it('artlibRecords 注入 semanticTags（像素扫描层），且全集 tags 包含它们', () => {
    const skel = arts.find((r) => r.id === 'monster/undead/skeleton')!;
    expect(skel.semanticTags).toBeDefined();
    expect(skel.semanticTags).toContain('undead'); // CAT_TAGS['monster/undead']
    for (const t of skel.semanticTags!) expect(skel.tags).toContain(t);
  });

  it('rankRecords：名称精确 > 语义 tag > 子串；AND 全中才入选；确定性同序', () => {
    const r = rankRecords(arts, 'axe');
    expect(r[0].record.id).toBe('item/weapon/axe'); // 名称全等 100
    expect(rankRecords(arts, 'undead')[0].record.id).toBe('monster/undead/skeleton'); // 语义命中
    expect(rankRecords(arts, 'axe undead_nonsense')).toHaveLength(0);
    expect(rankRecords(arts, 'monster').map((x) => x.record.id)).toEqual(rankRecords(arts, 'monster').map((x) => x.record.id));
  });

  it('queryLibrary sort=relevance：按相关度出序，且其余维度过滤仍生效', () => {
    const all = [...arts, ...projectRecords(projIndex)];
    const rs = queryLibrary(all, { text: 'undead', sort: 'relevance' });
    expect(rs[0].id).toBe('monster/undead/skeleton');
    expect(queryLibrary(all, { text: 'undead', sort: 'relevance', sources: ['project'] })).toHaveLength(0);
  });
});

describe('library — 检索别名层（概念/同义词/中文）', () => {
  const aliases: AliasMap = {
    sword: ['blade', 'weapon', '剑', '武器'],
    arrow: ['direction', '箭头'],
  };

  it('expandAliases：命中 token 补同义/中文，去重、字典序、不含原有', () => {
    expect(expandAliases(['sword', 'cross'], aliases)).toEqual(['blade', 'weapon', '剑', '武器']);
    // 原有词不重复补
    expect(expandAliases(['sword', 'weapon'], aliases)).toEqual(['blade', '剑', '武器']);
    // 无命中 → 空
    expect(expandAliases(['cross', 'mdi'], aliases)).toEqual([]);
    // 确定性：同输入同输出
    expect(expandAliases(['sword'], aliases)).toEqual(expandAliases(['sword'], aliases));
  });

  it('projectRecords 带 aliases：把别名并入 tags（不传则行为不变）', () => {
    const idx = parseAssetIndex({
      version: 1,
      assets: [{ id: 'mdi/sword', type: 'texture', description: 'sword · mdi', status: 'filled', path: 'mdi/sword.svg', tags: ['sword', 'mdi'] }],
    });
    const withAlias = projectRecords(idx, '/assets/', aliases);
    expect(withAlias[0].tags).toContain('剑');
    expect(withAlias[0].tags).toContain('weapon');
    // 不传 aliases → tags 原样
    expect(projectRecords(idx)[0].tags).toEqual(['sword', 'mdi']);
  });

  it('真实 search-aliases.json：合法 + 每个值是 string[] + 生效', () => {
    const map = (realAliases as { aliases: AliasMap }).aliases;
    expect(typeof map).toBe('object');
    for (const v of Object.values(map)) {
      expect(Array.isArray(v)).toBe(true);
      expect(v.every((x) => typeof x === 'string' && x.length > 0)).toBe(true);
    }
    expect(expandAliases(['sword'], map)).toContain('剑');
    expect(expandAliases(['coin'], map)).toContain('金币');
  });

  it('端到端：中文/同义词能搜到只按英文名命名的图标', () => {
    const idx = parseAssetIndex({
      version: 1,
      assets: [{ id: 'mdi/sword', type: 'texture', description: 'sword · mdi', status: 'filled', path: 'mdi/sword.svg', tags: ['sword', 'mdi'] }],
    });
    const recs = projectRecords(idx, '/assets/', aliases);
    expect(queryLibrary(recs, { text: '剑' }).map((r) => r.id)).toEqual(['mdi/sword']);
    expect(queryLibrary(recs, { text: 'weapon' }).map((r) => r.id)).toEqual(['mdi/sword']);
    // 别名命中走 tag 精确分（相关度排序也能出）
    expect(queryLibrary(recs, { text: '武器', sort: 'relevance' }).map((r) => r.id)).toEqual(['mdi/sword']);
  });
});

describe('library — 分类法', () => {
  it('七大类型常驻（含空类型也建目录）', () => {
    expect(LIBRARY_TAXONOMY.map((t) => t.type)).toEqual(['texture', 'sound', 'animation', 'video', 'material', 'mesh', 'font']);
  });
  it('分类显示名回退 id', () => {
    expect(categoryLabel('texture', 'icon.item')).toBe('物品图标');
    expect(categoryLabel('texture', 'unknown.cat')).toBe('unknown.cat');
  });
  it('inferCategory：sheet spec → 精灵表类', () => {
    expect(inferCategory({ id: 'x', type: 'texture', description: '', status: 'tbf', spec: { sheet: { frameWidth: 1, frameHeight: 1, columns: 1, count: 1 } } })).toBe('sheet');
  });
});
