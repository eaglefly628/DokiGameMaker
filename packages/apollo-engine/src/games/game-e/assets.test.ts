import { describe, it, expect } from 'vitest';
import {
  JOKER_ART_FILES,
  JOKER_ART_MISSING,
  JOKER_ART_MANIFEST,
  jokerArtKey,
} from './assets.js';

// 资产清单是纯数据 → 测试只验「数据自洽」，不碰 sim/hash，也不碰 node 内置（项目约定）。
// src 文件真身存在性由生成脚本对真实目录核验过；此处保证清单结构与 id 派生稳定。

describe('game-e joker art manifest', () => {
  it('覆盖 109/150 官方小丑，缺图 41 张，无重叠', () => {
    expect(JOKER_ART_FILES.length).toBe(109);
    expect(JOKER_ART_MISSING.length).toBe(41);
    expect(JOKER_ART_FILES.length + JOKER_ART_MISSING.length).toBe(150);
    const hitIds = new Set(JOKER_ART_FILES.map((f) => f.id));
    for (const id of JOKER_ART_MISSING) expect(hitIds.has(id)).toBe(false);
  });

  it('id 与 key 唯一', () => {
    const ids = JOKER_ART_FILES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = JOKER_ART_MANIFEST.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('每条描述符是 texture、key 由 id 派生、src 落在卡牌目录', () => {
    expect(JOKER_ART_MANIFEST.length).toBe(JOKER_ART_FILES.length);
    for (let i = 0; i < JOKER_ART_MANIFEST.length; i++) {
      const d = JOKER_ART_MANIFEST[i];
      expect(d.kind).toBe('texture');
      expect(d.key).toBe(jokerArtKey(JOKER_ART_FILES[i].id));
      expect(d.src.startsWith('assets/FreeArtLib/cardgame/card/')).toBe(true);
      expect(d.src.endsWith('.webp')).toBe(true);
    }
  });
});
