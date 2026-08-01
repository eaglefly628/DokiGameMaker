import { describe, it, expect } from 'vitest';
import {
  assetStyle,
  styleGroup,
  artlibTokens,
  STYLE_TAXONOMY,
  type ArtAsset,
  type ArtLibIndex,
} from './artlib.js';
import { artlibRecords, projectRecords, queryLibrary } from './library.js';
import { parseAssetIndex, type AssetIndex } from './asset-index.js';

const RAT: ArtAsset = {
  id: 'monster/rat',
  cat: 'monster',
  sub: '',
  subject: 'rat',
  slot: 'sprite.character',
  transparent: true,
  variants: 1,
  sample: 'rat.png',
};

function artIndex(assets: ArtAsset[]): ArtLibIndex {
  return {
    version: 1,
    source: 'DCSS — opengameart',
    license: 'CC0 (public domain)',
    root: 'assets/FreeArtLib',
    basePixel: 32,
    fileCount: assets.length,
    assetCount: assets.length,
    cats: {},
    slots: {},
    assets,
  };
}

describe('assetStyle / styleGroup', () => {
  it('缺省画风 → pixel（DCSS 货架）', () => {
    expect(assetStyle(RAT)).toBe('pixel');
  });
  it('显式画风原样返回', () => {
    expect(assetStyle({ ...RAT, style: 'cartoon.ink' })).toBe('cartoon.ink');
  });
  it('styleGroup：cartoon.* → cartoon，其余 → pixel', () => {
    expect(styleGroup('pixel')).toBe('pixel');
    expect(styleGroup('cartoon.ink')).toBe('cartoon');
    expect(styleGroup('cartoon.flat')).toBe('cartoon');
  });
});

describe('artlibTokens 纳入风格词', () => {
  it('缺省含 pixel', () => {
    expect(artlibTokens(RAT)).toContain('pixel');
  });
  it('cartoon.ink → 含 cartoon 与 ink', () => {
    const t = artlibTokens({ ...RAT, style: 'cartoon.ink' });
    expect(t).toContain('cartoon');
    expect(t).toContain('ink');
  });
});

describe('适配器透出 style', () => {
  it('artlibRecords 缺省 → pixel', () => {
    expect(artlibRecords(artIndex([RAT]))[0].style).toBe('pixel');
  });
  it('artlibRecords 尊重显式画风', () => {
    expect(artlibRecords(artIndex([{ ...RAT, style: 'cartoon.western' }]))[0].style).toBe('cartoon.western');
  });
  it('projectRecords 读 AssetIndexEntry.style', () => {
    const ai: AssetIndex = {
      version: 1,
      assets: [{ id: 'bg.x', type: 'texture', description: '', status: 'tbf', style: 'cartoon.ink' }],
    };
    expect(projectRecords(ai)[0].style).toBe('cartoon.ink');
  });
});

describe('queryLibrary 按风格过滤', () => {
  const recs = [
    ...artlibRecords(artIndex([RAT])), // pixel
    ...projectRecords({
      version: 1,
      assets: [
        { id: 'ink.dragon', type: 'texture', description: '', status: 'filled', path: 'x.png', style: 'cartoon.ink' },
        { id: 'flat.coin', type: 'texture', description: '', status: 'filled', path: 'y.png', style: 'cartoon.flat' },
      ],
    }),
  ];
  it('精确 style', () => {
    expect(queryLibrary(recs, { style: 'cartoon.ink' }).map((r) => r.id)).toEqual(['ink.dragon']);
  });
  it('styleGroup cartoon → 全部 cartoon.*', () => {
    expect(queryLibrary(recs, { styleGroup: 'cartoon' }).map((r) => r.id).sort()).toEqual(['flat.coin', 'ink.dragon']);
  });
  it('styleGroup pixel → 只货架', () => {
    expect(queryLibrary(recs, { styleGroup: 'pixel' }).map((r) => r.id)).toEqual(['monster/rat']);
  });
  it('无风格过滤 → 全量', () => {
    expect(queryLibrary(recs, {})).toHaveLength(3);
  });
});

describe('parseAssetIndex 往返 style', () => {
  it('保留并校验 style 字段', () => {
    const parsed = parseAssetIndex({
      version: 1,
      assets: [{ id: 'a', type: 'texture', description: 'd', status: 'tbf', style: 'cartoon.flat' }],
    });
    expect(parsed.assets[0].style).toBe('cartoon.flat');
  });
  it('非字符串 style 被拒', () => {
    expect(() =>
      parseAssetIndex({ version: 1, assets: [{ id: 'a', type: 'texture', description: 'd', status: 'tbf', style: 7 }] }),
    ).toThrow();
  });
});

describe('STYLE_TAXONOMY 约定', () => {
  it('id 唯一、group 合法、cartoon.* 前缀一致', () => {
    const ids = STYLE_TAXONOMY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of STYLE_TAXONOMY) {
      expect(['pixel', 'cartoon']).toContain(s.group);
      if (s.group === 'cartoon') expect(s.id.startsWith('cartoon.')).toBe(true);
    }
  });
  it('只收 pixel + cartoon 两组（写实暂不收）', () => {
    expect(new Set(STYLE_TAXONOMY.map((s) => s.group))).toEqual(new Set(['pixel', 'cartoon']));
  });
});
