// game-art-load 契约测试（REQ-SHELL ②）：两形态装载 · 失败静默回退 · 真图信号筛选。
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  gameArtIndexUrl, loadGameArtInto, loadGameArtOverrides, pickArtOverrides, createArtAssets,
} from './game-art-load.js';
import { AssetManager, StubAssetLoader } from './asset-manager.js';

const INDEX = {
  version: 1,
  assets: [
    { id: 'game-q/tower-pulse', type: 'texture', description: '塔皮', status: 'filled', path: '/games/game-q/art/textures/tower.png', source: 'gen:qwen', spec: { usage: 'sprite' } },
    { id: 'game-q/creep', type: 'texture', description: '兵皮', status: 'filled', path: '/games/game-q/art/textures/creep.png', tags: ['skin'], spec: { usage: 'sprite' } },
    { id: 'game-q/vendored-bg', type: 'texture', description: '货架背景', status: 'filled', path: '/games/game-q/art/textures/bg.png', source: 'vendored:kenney', spec: { usage: 'sprite' } },
    { id: 'game-q/pending', type: 'texture', description: '未生成', status: 'tbf', source: 'gen:qwen' },
    { id: 'shelf/plank', type: 'texture', description: '原生货架（无 skinKey 前缀）', status: 'filled', path: '/games/game-q/art/textures/plank.png', source: 'gen:qwen', spec: { usage: 'sprite' } },
    { id: 'game-q/procedural', type: 'texture', description: '程序占位（无正向信号）', status: 'filled', path: '/games/game-q/art/textures/proc.png', source: '手动', spec: { usage: 'sprite' } },
  ],
};

function stubFetch(impl: (url: string, init?: RequestInit) => unknown): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => impl(url, init)));
}
const okJson = (body: unknown) => ({ ok: true, json: async () => body });

describe('game-art-load（游戏本地美术索引装载·REQ-SHELL ②）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('索引 URL 单一真相：/games/<slug>/art/index.json', () => {
    expect(gameArtIndexUrl('game-103')).toBe('/games/game-103/art/index.json');
  });

  it('形态①：拉到索引 → 注册进 AssetManager 并 loadAll（按 key 可解析）', async () => {
    stubFetch(() => okJson(INDEX));
    const mgr = new AssetManager(new StubAssetLoader());
    expect(await loadGameArtInto(mgr, 'game-q')).toBe(true);
    expect(mgr.get('game-q/tower-pulse')).toBeDefined();
    expect(mgr.get('game-q/pending')).toBeUndefined(); // tbf 无 path → 不注册
  });

  it('形态①：默认 cache=no-store（工坊换图刷新即见）', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    stubFetch((url, init) => { calls.push([url, init]); return okJson(INDEX); });
    await loadGameArtInto(new AssetManager(new StubAssetLoader()), 'game-q');
    expect(calls[0][0]).toBe('/games/game-q/art/index.json');
    expect(calls[0][1]).toEqual({ cache: 'no-store' });
  });

  it('形态②：只收真图替换条目（skinKey 前缀 + gen:/vendored/tags:skin 正向信号）', async () => {
    stubFetch(() => okJson(INDEX));
    expect(await loadGameArtOverrides('game-q')).toEqual({
      'game-q/tower-pulse': '/games/game-q/art/textures/tower.png',
      'game-q/creep': '/games/game-q/art/textures/creep.png',
      'game-q/vendored-bg': '/games/game-q/art/textures/bg.png',
    });
  });

  it('形态②纯函数：原生货架（无 slug 前缀）/ 程序占位（无信号）/ 无 path 一律不进 = 观感零变', () => {
    const out = pickArtOverrides(INDEX, 'game-q');
    expect(out['shelf/plank']).toBeUndefined();
    expect(out['game-q/procedural']).toBeUndefined();
    expect(out['game-q/pending']).toBeUndefined();
  });

  it('失败静默回退：非 200 / 坏 JSON / schema 不合法 / 无 fetch —— 一律不抛', async () => {
    stubFetch(() => ({ ok: false, json: async () => ({}) }));
    expect(await loadGameArtOverrides('game-q')).toEqual({});
    expect(await loadGameArtInto(new AssetManager(new StubAssetLoader()), 'game-q')).toBe(false);

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await expect(loadGameArtOverrides('game-q')).resolves.toEqual({});
    await expect(loadGameArtInto(new AssetManager(new StubAssetLoader()), 'game-q')).resolves.toBe(false);

    stubFetch(() => okJson({ 不是: '合法索引' })); // parseAssetIndex 会抛 → 必须被吞掉
    await expect(loadGameArtInto(new AssetManager(new StubAssetLoader()), 'game-q')).resolves.toBe(false);
    expect(pickArtOverrides({ 不是: '合法索引' }, 'game-q')).toEqual({});
    expect(pickArtOverrides(null, 'game-q')).toEqual({});

    vi.stubGlobal('fetch', undefined); // headless（node 测试/服务端）
    await expect(loadGameArtOverrides('game-q')).resolves.toEqual({});
    await expect(loadGameArtInto(new AssetManager(new StubAssetLoader()), 'game-q')).resolves.toBe(false);
  });

  it('createArtAssets：建出空管理器（未装载时按 key 解析不到 → 渲染器回退程序化）', () => {
    expect(createArtAssets().get('game-q/tower-pulse')).toBeUndefined();
  });
});
