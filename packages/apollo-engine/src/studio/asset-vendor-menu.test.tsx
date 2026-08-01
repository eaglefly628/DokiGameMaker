// @vitest-environment happy-dom
// 资源库「右键 copy 到游戏」(vendor) 交互测试：右键项目资产 → 弹游戏菜单 → 点游戏 → POST /api/assets/vendor。
// fetch 全 mock，不依赖真 apollo.py。守护「从美术库直达 vendor」这条 owner 需求的接线不回退。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AssetLibrary } from './AssetLibrary.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 一条项目库资产（filled·source 推断为 project）——供网格渲染出可右键的卡片。
const PROJ_INDEX = {
  version: 1,
  assets: [
    { id: 'ai/tripo/chair', type: 'mesh', description: 'a chair', status: 'filled', path: 'ai/tripo/chair.glb', category: 'mesh', tags: ['ai-gen'], source: 'ai:tripo', spec: { scale: 1, genCollision: 'hull' } },
  ],
};

function mockFetch(routes: Array<[string, unknown]>) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fn = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body });
    return {
      ok: true,
      json: async () => {
        for (const [k, v] of routes) {
          const [m, sub] = k.includes(' ') ? k.split(' ') : ['', k];
          if ((!m || m === (init?.method ?? 'GET')) && url.includes(sub)) return v;
        }
        return {};
      },
    };
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}
async function flush() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

let container: HTMLElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('资源库 · 右键 copy 到游戏（vendor）', () => {
  it('右键项目资产 → 弹游戏列表 → 点游戏 → POST /api/assets/vendor 带 {id,game}', async () => {
    const { calls } = mockFetch([
      ['/api/games', { games: [{ id: 'game-d', hasLocalArt: false }, { id: 'game-z', hasLocalArt: true }] }],
      ['/assets/index.json', PROJ_INDEX],
      ['/assets/FreeArtLib/index.json', { assetCount: 0, assets: [] }],
      ['/assets/curated/search-aliases.json', { aliases: {} }],
      ['POST /api/assets/vendor', { success: true, id: 'ai/tripo/chair', game: 'game-z', type: 'mesh' }],
    ]);
    await act(async () => { root.render(<AssetLibrary onBack={() => {}} />); });
    await flush();

    // 网格里那张卡（含资产名）→ 派发 contextmenu
    const cards = Array.from(container.querySelectorAll('div')).filter((d) => d.getAttribute('title')?.includes('ai/tripo/chair'));
    expect(cards.length).toBeGreaterThan(0);
    await act(async () => {
      cards[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));
    });

    // 菜单列出两款游戏
    expect(container.textContent).toContain('copy 到游戏');
    expect(container.textContent).toContain('game-d');
    expect(container.textContent).toContain('game-z');

    // 点 game-z（精确命中 vendor 行）
    const gameZ = container.querySelector('[data-vendor-game="game-z"]');
    expect(gameZ).toBeTruthy();
    await act(async () => { gameZ!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    const vendorCall = calls.find((c) => c.url.includes('/api/assets/vendor') && c.method === 'POST');
    expect(vendorCall).toBeTruthy();
    expect(JSON.parse(vendorCall!.body!)).toMatchObject({ id: 'ai/tripo/chair', game: 'game-z' });
    // 成功轻提示
    expect(container.textContent).toContain('已 copy');
  });
});
