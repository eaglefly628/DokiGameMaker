// 贴图 UI sample「入库」自检（owner 2026-07-07）：证明 game-i 的本地贴图皮索引走统一 Asset 路线——
// public/games/game-i/art/index.json 可 parseAssetIndex 校验 + registerAssetIndex 桥接成可加载资产（站点绝对路径 baseUrl ''），
// 且贴图文件真实存在、uiTextureUrl 按 key 解析出正确 URL（喂 Button.skin 的「已解析 URL」）。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { parseAssetIndex, registerAssetIndex, AssetManager, StubAssetLoader } from '@assets/index.js';
import { GAME_I_UI_INDEX, uiTextureUrl, SKIN_METAL, SKIN_WOOD, SKIN_STONE, SKIN_SCROLL } from './ui-assets.js';

describe('game-i 贴图 UI sample · 入库统一 Asset 路线', () => {
  it('本地索引 JSON 合法·UI 贴图部分与 inline 索引同 id 集合（emoji 图渲 vendor 的 emoji/* 另算一类）', () => {
    const raw = JSON.parse(readFileSync('public/games/game-i/art/index.json', 'utf8'));
    const fileIdx = parseAssetIndex(raw); // 闭集校验通过
    // 该本地 index 现同时承载两类资产：① UI 贴图（`tex/*`·inline GAME_I_UI_INDEX 消费）② 文本 emoji 图渲 vendor
    // 进来的 Twemoji（id 前缀 `emoji/`·`scripts/emoji-vendor.mjs game-i --apply` 写入·渲染器按码点直查·不经 inline 索引）。
    // 故只比「非 emoji/ 前缀」子集与 inline 同源（注：inline 里 tex/card-* 恰 category:'emoji' 但 id 是 tex/·按前缀滤才准）。
    const fileUiIds = fileIdx.assets.filter((a) => !a.id.startsWith('emoji/')).map((a) => a.id).sort();
    const inlineIds = GAME_I_UI_INDEX.assets.map((a) => a.id).sort();
    expect(fileUiIds).toEqual(inlineIds); // public/ 贴图真相与 inline 消费索引同源
    expect(fileIdx.assets.some((a) => a.id.startsWith('emoji/'))).toBe(true); // emoji 图渲资产已 vendor 在册
  });

  it('四张贴图皮资产文件真实存在（filled 的 path 落地）', () => {
    for (const a of GAME_I_UI_INDEX.assets) {
      expect(a.status).toBe('filled');
      expect(a.path).toBeTruthy();
      expect(existsSync('public' + a.path)).toBe(true); // path=站点绝对 → public 下的真实文件
    }
  });

  it('registerAssetIndex 桥接进 AssetManager·load 指向本地拷贝', async () => {
    const m = new AssetManager(new StubAssetLoader());
    registerAssetIndex(m, GAME_I_UI_INDEX); // path 已是站点绝对路径 → baseUrl ''
    expect(m.has(SKIN_METAL)).toBe(true);
    const a = await m.load(SKIN_METAL);
    expect(a.descriptor.src).toBe('/games/game-i/art/textures/skin-metal.svg');
  });

  it('uiTextureUrl 按 key 解析出站点绝对 URL（喂 Button.skin）', () => {
    expect(uiTextureUrl(SKIN_METAL)).toBe('/games/game-i/art/textures/skin-metal.svg');
    expect(uiTextureUrl(SKIN_WOOD)).toBe('/games/game-i/art/textures/skin-wood.svg');
    expect(uiTextureUrl(SKIN_STONE)).toBe('/games/game-i/art/textures/skin-stone.svg');
    expect(uiTextureUrl(SKIN_SCROLL)).toBe('/games/game-i/art/textures/skin-scroll.svg');
  });

  it('未登记 key → 空串（fail-soft·不炸加载）', () => {
    expect(uiTextureUrl('tex/does-not-exist')).toBe('');
  });
});
