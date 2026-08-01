// @vitest-environment happy-dom
// AssetGenPanel（新创作台「✨ AI 生成资产」面板）· Seedream 接入 + 模型版本下拉（owner 2026-07-21）。
// 验：① Seedream 在生成器菜单（曾写死 qwen/tripo/meshy·漏 seedream）② 选中 Seedream → 出模型下拉 3 档
//    ③ 改选 → PUT /api/settings 存 genOptions（本地持久化·生成时经 _gen_env 注入）。
// fetch 全 mock·不依赖真 apollo.py。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AssetGenPanel } from './AssetGenPanel.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PROVIDERS = [
  { id: 'seedream', kind: 'texture', license: 'ByteDance Seedream', envKey: 'ARK_API_KEY', keyConfigured: true, apiKeyMasked: 'ark***9f2a' },
  { id: 'qwen', kind: 'texture', license: 'Qwen', envKey: 'DASHSCOPE_API_KEY', keyConfigured: false, apiKeyMasked: '' },
  { id: 'tripo', kind: 'mesh', license: 'Tripo', envKey: 'TRIPO_API_KEY', keyConfigured: false, apiKeyMasked: '' },
  { id: 'meshy', kind: 'mesh', license: 'Meshy', envKey: 'MESHY_API_KEY', keyConfigured: false, apiKeyMasked: '' },
];
const GEN_OPTIONS = [{
  envKey: 'ARK_SEEDREAM_MODEL', label: 'Seedream 模型版本', forKey: 'ARK_API_KEY',
  default: 'doubao-seedream-4-0-250828', value: 'doubao-seedream-4-0-250828',
  choices: [
    { value: 'doubao-seedream-4-0-250828', label: 'Seedream 4.0（1K/2K/4K·稳定）' },
    { value: 'doubao-seedream-4-5-251128', label: 'Seedream 4.5（2K/4K）' },
    { value: 'doubao-seedream-5-0-260128', label: 'Seedream 5.0（2K/3K·最新）' },
  ],
}];

function mockFetch() {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fn = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body });
    let data: unknown = {};
    if (url.includes('/api/assets/generate/providers')) data = { providers: PROVIDERS };
    else if (url.includes('/api/settings')) data = method === 'PUT' ? { success: true, genOptions: GEN_OPTIONS } : { providers: [], genKeys: [], genOptions: GEN_OPTIONS };
    return { ok: true, json: async () => data };
  });
  vi.stubGlobal('fetch', fn);
  return { calls };
}

async function flush() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

let container: HTMLElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('AssetGenPanel · Seedream 接入 + 模型下拉', () => {
  it('生成器菜单含 Seedream（曾漏）', async () => {
    mockFetch();
    await act(async () => { root.render(<AssetGenPanel onClose={() => {}} onCommitted={() => {}} />); });
    await flush();
    expect(container.textContent).toContain('Seedream');
  });

  it('默认选中 Seedream → 渲出模型版本下拉·3 档·默认 4.0', async () => {
    mockFetch();
    await act(async () => { root.render(<AssetGenPanel onClose={() => {}} onCommitted={() => {}} />); });
    await flush();
    const sel = container.querySelector('select[aria-label="Seedream 模型版本"]') as HTMLSelectElement;
    expect(sel).toBeTruthy();
    expect(sel.querySelectorAll('option').length).toBe(3);
    expect(sel.value).toBe('doubao-seedream-4-0-250828');
  });

  it('改选 5.0 → PUT /api/settings 存 genOptions（本地持久化）', async () => {
    const { calls } = mockFetch();
    await act(async () => { root.render(<AssetGenPanel onClose={() => {}} onCommitted={() => {}} />); });
    await flush();
    const sel = container.querySelector('select[aria-label="Seedream 模型版本"]') as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(sel, 'doubao-seedream-5-0-260128'); sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    const put = calls.find((c) => c.method === 'PUT' && c.url.includes('/api/settings'));
    expect(put).toBeTruthy();
    expect(JSON.parse(put!.body!).genOptions).toEqual({ ARK_SEEDREAM_MODEL: 'doubao-seedream-5-0-260128' });
  });
});
