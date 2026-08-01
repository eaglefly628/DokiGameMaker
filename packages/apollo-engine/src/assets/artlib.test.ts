import { describe, it, expect } from 'vitest';
import { artlibTokens, artlibDir, artlibGlob, searchArtlib, type ArtLibIndex } from './artlib.js';

const fixture: ArtLibIndex = {
  version: 1, source: 'x', license: 'CC0', root: 'assets/FreeArtLib', basePixel: 32,
  fileCount: 5, assetCount: 3,
  cats: { item: 1, monster: 1, dungeon: 1 }, slots: {},
  assets: [
    { id: 'item/weapon/axe', cat: 'item', sub: 'weapon', subject: 'axe', slot: 'icon.item', transparent: true, variants: 1 },
    { id: 'monster/undead/skeleton', cat: 'monster', sub: 'undead', subject: 'skeleton_warrior', slot: 'sprite.character', transparent: true, variants: 1 },
    { id: 'dungeon/floor/grass', cat: 'dungeon', sub: 'floor', subject: 'grass', slot: 'tile', transparent: false, variants: 4 },
  ],
};

describe('artlib · 资产目录检索助手', () => {
  it('artlibTokens：cat+sub+subject+slot 派生标签', () => {
    expect(artlibTokens(fixture.assets[1])).toEqual(
      expect.arrayContaining(['monster', 'undead', 'skeleton', 'warrior', 'sprite', 'character']),
    );
  });

  it('artlibDir / artlibGlob：路径与变体 glob', () => {
    const grass = fixture.assets[2];
    expect(artlibDir(fixture, grass)).toBe('assets/FreeArtLib/dungeon/floor');
    expect(artlibGlob(fixture, grass)).toBe('assets/FreeArtLib/dungeon/floor/grass*.png'); // 多变体带 *
    expect(artlibGlob(fixture, fixture.assets[0])).toBe('assets/FreeArtLib/item/weapon/axe.png'); // 单张无 *
  });

  it('searchArtlib：分词全命中 + slot/cat 过滤', () => {
    expect(searchArtlib(fixture, 'undead skeleton').map((a) => a.id)).toEqual(['monster/undead/skeleton']);
    expect(searchArtlib(fixture, 'weapon', { slot: 'icon.item' })).toHaveLength(1);
    expect(searchArtlib(fixture, 'weapon', { slot: 'tile' })).toHaveLength(0); // slot 不符被过滤
    expect(searchArtlib(fixture, '', { cat: 'dungeon' })).toHaveLength(1);
  });
});
