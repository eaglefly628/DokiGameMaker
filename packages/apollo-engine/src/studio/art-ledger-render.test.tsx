// @vitest-environment happy-dom
// ArtLedgerPanel 可辨认性回归（owner 现场痛点：台账「看不出什么是什么·没占位图」）。
// 客户端渲染（跑 useEffect + mock fetch 注入台账行）→ 断言卡面显示 query 描述 + 未生成行画 SVG 色块占位图。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { ArtLedgerPanel, type LedgerRow } from './ArtLedgerPanel.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 两条 needs-art 行：enemy=皮肤槽回退 circle·#ff5c7a；track-seg=纯色块 box·#1c3a5c。
const LEDGER = {
  success: true, mode: 'requirements', game: 'game-q', count: 2,
  rows: [
    { no: 'art-12', kind: 'sprite', slot: { entity: 'prefab:enemy_basic:body', component: 'Sprite', field: 'textureKey' }, query: 'enemy basic body', skinKey: 'q/enemy-basic', prompt: 'top-down neon drone, pink #ff5c7a', placeholder: { current: '皮肤槽 q/enemy-basic（未填时回退 2D 色块 circle·#ff5c7a）', source: 'procedural', count: 1 }, spec: { w: 24, h: 24, transparent: true }, context: '美术需求：「enemy basic body」', status: 'needs-art', gen: null, provenance: null },
    { no: 'art-38', kind: 'sprite', slot: { entity: 'track-seg-0', component: 'Shape', field: 'art' }, query: 'track seg', placeholder: { current: '2D 色块（box·#1c3a5c）', source: 'procedural', count: 5 }, spec: { w: 210, h: 26, transparent: true }, context: '美术需求：「track seg」', status: 'needs-art', gen: null, provenance: null },
  ],
};
function mockFetch(): void {
  const fn = vi.fn(async (url: string) => {
    if (url.includes('/api/art/ledger')) return { ok: true, json: async () => LEDGER };
    if (url.includes('/api/art/style-packs')) return { ok: true, json: async () => ({ packs: [{ packId: 'neon-synthwave', name: '霓虹合成波' }] }) };
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fn);
}
async function flush(): Promise<void> {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

let container: HTMLElement; let root: Root;
beforeEach(() => { mockFetch(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('ArtLedgerPanel · 需求可辨认（卡面描述 + 占位色块图）', () => {
  it('卡面显示 query 人读描述 + 未生成行画 SVG 色块占位图（形状+色正确）', async () => {
    await act(async () => { root.render(<ArtLedgerPanel slug="game-q" onBack={() => {}} />); });
    await flush();
    const html = container.innerHTML;
    // C：卡面有人读描述（不再只有 art-NN → 一眼分得清）
    expect(html).toContain('enemy basic body');
    expect(html).toContain('track seg');
    // B：未生成行有 SVG 色块占位图（data-uri + 解析出的形状/色）
    expect(html).toContain('data:image/svg+xml');
    expect(html).toContain('circle');          // enemy=circle 色块
    expect(html).toContain('rect');            // track-seg=box→rect 色块
    expect(html).toContain('%23ff5c7a');       // encoded #ff5c7a（enemy 色被读进色块）
    expect(html).toContain('%231c3a5c');       // encoded #1c3a5c（track 色）
  });
});

// ═══ REQ-ARTLIB·fileless placeholder 行不空白（平台侧程序占位签 + onError 兜底）═══
// authored-inventory 台账（game-c 式·用 ref 非 slot）允许合法无文件行；素材屏对这些行必须渲占位签而非空白/破图。
function stubLedger(rows: LedgerRow[]): void {
  const L = { success: true, mode: 'requirements', game: 'game-c', count: rows.length, rows };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/api/art/ledger')) return { ok: true, json: async () => L };
    if (url.includes('/api/art/style-packs')) return { ok: true, json: async () => ({ packs: [{ packId: 'p', name: 'P' }] }) };
    return { ok: true, json: async () => ({}) };
  }));
}
// ref-shaped（无 slot·game-c authored-inventory 真实形状）
const PH_NO_FILE: LedgerRow = {
  no: 'art-001', kind: 'texture', desc: '夜景背幕（落地窗+城市夜景）',
  ref: { mechanism: 'url', component: 'ThreeRenderer', field: 'setBackgroundTexture', servedPath: '/games/game-c/art/scene/backdrop.svg' },
  query: 'floor-to-ceiling window over a nocturnal city skyline',
  placeholder: { current: '素坯：声明式 SVG 夜景', source: 'procedural-placeholder', count: 1 },
  status: 'placeholder', gen: null, provenance: null,
};
const PH_WITH_FILE: LedgerRow = {
  no: 'art-002', kind: 'sprite', desc: '牌面精灵',
  ref: { component: 'Sprite', field: 'textureKey', servedPath: '/games/game-c/art/card.svg' },
  query: 'card face sprite',
  placeholder: { current: '素坯', count: 1 },
  status: 'placeholder',
  gen: { provider: 'procedural', model: 'x', servedPath: '/games/game-c/art/card.svg', localId: 'game-c/card' },
  provenance: null,
};

describe('ArtLedgerPanel · REQ-ARTLIB fileless placeholder 不空白', () => {
  it('无真图的 placeholder 行（gen=null·ref 形状无 slot）直渲程序占位签（desc+status·不空白·不崩溃）', async () => {
    stubLedger([PH_NO_FILE]);
    await act(async () => { root.render(<ArtLedgerPanel slug="game-c" onBack={() => {}} />); });
    await flush();
    const html = container.innerHTML;
    expect(html).toContain('data-placeholder-sign'); // 占位签存在（非空白/破图）
    expect(html).toContain('夜景背幕（落地窗+城市夜景）'); // desc 文案
    expect(html).toContain('占位·待产'); // status 标签
    // 该行无真图渲染：没有指向 backdrop.svg 的 <img>（本该空白的那格现在是签）
    expect(container.querySelector('img[src*="backdrop.svg"]')).toBeNull();
  });

  it('placeholder 行有 servedPath 时先渲真图；img 404 → onError 落占位签（免 fs 探测）', async () => {
    stubLedger([PH_WITH_FILE]);
    await act(async () => { root.render(<ArtLedgerPanel slug="game-c" onBack={() => {}} />); });
    await flush();
    // 初始：渲真图（保留 game-c 自救 SVG·不被占位签盖掉），尚无占位签
    const img = container.querySelector('img[src*="card.svg"]') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(container.innerHTML).not.toContain('data-placeholder-sign');
    // 触发 404 → onError
    await act(async () => { img!.dispatchEvent(new Event('error')); });
    await flush();
    const html = container.innerHTML;
    expect(html).toContain('data-placeholder-sign'); // 破图 → 占位签兜底
    expect(html).toContain('缺图·占位'); // 404 专属标签
    expect(container.querySelector('img[src*="card.svg"]')).toBeNull(); // 破图已撤
  });

  it('game-c 真台账（ref 形状·authored-inventory）整屏渲染不崩溃 + 描述可辨认', async () => {
    const real = JSON.parse(readFileSync('public/games/game-c/art/art-ledger.json', 'utf-8'));
    stubLedger(real.rows as LedgerRow[]);
    await act(async () => { root.render(<ArtLedgerPanel slug="game-c" onBack={() => {}} />); });
    await flush();
    const html = container.innerHTML;
    expect(html).toContain('art-001'); // 编号墙渲出（旧代码在此崩于 r.slot.entity）
    expect(html).toContain('筹码'); // 人读 desc 可辨认（用**最稳定**关键词=筹码·免 game-c 场景/桌面文案反复演进误伤 studio 渲染回归）
    // 真台账非空即验渲染路径（**不硬编游戏侧行数**·免 game-c 台账演进——如扑克牌移出——误伤 studio 渲染回归）。
    expect(real.rows.length).toBeGreaterThan(0);
  });
});
