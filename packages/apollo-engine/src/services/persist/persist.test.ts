// @vitest-environment happy-dom
// local-store + leaderboard 契约测试（REQ-SHELL ③）：往返 · 坏档回缺省 · 编解码闭集字节兼容 · 优雅降级。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  localStore, memoryKV, defaultKV, jsonCodec, textCodec, intCodec, flagCodec, insertRanked,
} from './index.js';

describe('localStore（局外小态类型化存储·REQ-SHELL ③）', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('往返：JSON blob 写进去原样读回', () => {
    const stars = localStore<Record<string, number>>('t-progress', () => ({}));
    stars.set({ '1': 3, '2': 2 });
    expect(stars.get()).toEqual({ '1': 3, '2': 2 });
    expect(localStorage.getItem('t-progress')).toBe('{"1":3,"2":2}'); // 真落到 localStorage
  });

  it('无值 → 缺省；remove 后回缺省', () => {
    const s = localStore('missing', 7);
    expect(s.get()).toBe(7);
    s.set(9);
    expect(s.get()).toBe(9);
    s.remove();
    expect(s.get()).toBe(7);
  });

  it('坏档（JSON 炸/形状不合法）→ 缺省，绝不抛', () => {
    localStorage.setItem('bad', '{ 这不是 json');
    const s = localStore<number[]>('bad', () => []);
    expect(() => s.get()).not.toThrow();
    expect(s.get()).toEqual([]);

    localStorage.setItem('shaped', '{"score":"不是数字"}');
    const guarded = localStore(
      'shaped',
      () => ({ score: 0 }),
      jsonCodec<{ score: number }>((raw) => {
        const r = raw as { score?: unknown };
        return r && typeof r.score === 'number' ? { score: r.score } : null;
      }),
    );
    expect(guarded.get()).toEqual({ score: 0 }); // 形状校验不过 = 坏档 → 缺省
  });

  it('对象缺省传工厂 → 每次 get 都是新的一份（调用方改它不污染下次读）', () => {
    const s = localStore<{ n: number }>('obj', () => ({ n: 1 }));
    const a = s.get();
    a.n = 99;
    expect(s.get()).toEqual({ n: 1 });
  });

  it('textCodec：原文枚举串（不裹引号）——与既有 lang 键字节兼容', () => {
    const lang = localStore('gc_lang', 'en', textCodec(['en', 'zh'] as const));
    lang.set('zh');
    expect(localStorage.getItem('gc_lang')).toBe('zh'); // 不是 "\"zh\""
    expect(lang.get()).toBe('zh');
    localStorage.setItem('gc_lang', 'fr'); // 闭集外 = 坏档
    expect(lang.get()).toBe('en');
  });

  it('flagCodec：静音位 1/0——与三家现存静音键字节兼容', () => {
    const muted = localStore('gg_sfx_muted', false, flagCodec);
    muted.set(true);
    expect(localStorage.getItem('gg_sfx_muted')).toBe('1');
    expect(muted.get()).toBe(true);
    localStorage.setItem('gg_sfx_muted', '0');
    expect(muted.get()).toBe(false);
    localStorage.setItem('gg_sfx_muted', 'yes'); // 非 1/0 = 坏档
    expect(muted.get()).toBe(false);
  });

  it('intCodec：原文整数 + 钳边界（人数 2~6）', () => {
    const players = localStore('gc_players', 4, intCodec(2, 6));
    players.set(9);
    expect(localStorage.getItem('gc_players')).toBe('6'); // 写侧也钳
    localStorage.setItem('gc_players', '1');
    expect(players.get()).toBe(2); // 读侧钳
    localStorage.setItem('gc_players', 'abc');
    expect(players.get()).toBe(4); // 非数 = 坏档 → 缺省
  });

  it('注入 memoryKV：无头/测试下可完全脱离浏览器存储', () => {
    const kv = memoryKV({ seeded: '"旧值"' });
    const s = localStore<string>('seeded', '缺省', jsonCodec<string>(), kv);
    expect(s.get()).toBe('旧值');
    s.set('新值');
    expect(kv.getItem('seeded')).toBe('"新值"');
    expect(localStorage.getItem('seeded')).toBeNull(); // 没碰真存储
  });

  it('无 localStorage（SSR/headless）→ 退内存 KV，读写都不抛', () => {
    vi.stubGlobal('localStorage', undefined);
    const s = localStore('headless', 0);
    expect(() => s.set(5)).not.toThrow();
    expect(s.get()).toBe(5); // 同进程内共享内存 KV → 仍自洽
  });

  it('隐私模式：访问 localStorage 即抛 / setItem 抛配额 → 一律静默降级', () => {
    vi.stubGlobal('localStorage', { get length() { throw new Error('SecurityError'); } });
    expect(() => defaultKV()).not.toThrow();
    const quota = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => { throw new Error('nope'); },
    };
    const s = localStore('q', 1, jsonCodec<number>(), quota);
    expect(() => s.set(2)).not.toThrow();
    expect(() => s.remove()).not.toThrow();
    expect(s.get()).toBe(1);
  });
});

describe('insertRanked（本地榜纯算术）', () => {
  const cmp = (a: { score: number; at: number }, b: { score: number; at: number }) =>
    (b.score - a.score) || (b.at - a.at);

  it('并入 → 排序 → 名次（1 基）+ 截断', () => {
    const prev = [{ score: 50, at: 1 }, { score: 10, at: 2 }];
    const r = insertRanked({ score: 30, at: 3 }, prev, cmp, 10);
    expect(r.board.map((e) => e.score)).toEqual([50, 30, 10]);
    expect(r.rank).toBe(2);
  });

  it('掉出榜外 → rank 0 且榜长不超 max；不改入参', () => {
    const prev = [{ score: 9, at: 1 }, { score: 8, at: 2 }];
    const frozen = [...prev];
    const r = insertRanked({ score: 1, at: 3 }, prev, cmp, 2);
    expect(r.board.length).toBe(2);
    expect(r.rank).toBe(0);
    expect(prev).toEqual(frozen);
  });

  it('空榜首条 = 第 1 名', () => {
    expect(insertRanked({ score: 1, at: 1 }, [], cmp, 10).rank).toBe(1);
  });

  it('与 localStore 配对即完整持久榜（load → insert → save）', () => {
    const kv = memoryKV();
    const board = localStore<Array<{ score: number; at: number }>>('board-v1', () => [], jsonCodec(), kv);
    for (const score of [10, 40, 25]) {
      const { board: next } = insertRanked({ score, at: score }, board.get(), cmp, 2);
      board.set(next);
    }
    expect(board.get().map((e) => e.score)).toEqual([40, 25]);
  });
});
