// @vitest-environment happy-dom
// 创作台 v1 · M3/M4 组件无头测试：设置面板（打码回显/千问第一/测试连接）+ 体检浮层（五轴分）。
// fetch 全部 vi.stubGlobal mock，不依赖真 apollo.py 服务。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SettingsPanel, type SettingsView } from './SettingsPanel.js';
import { BenchOverlay } from './DataCartridgeRunner.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 路由式 fetch mock：按 [method+urlSubstr] 命中，返回 {ok, json}。记录调用供断言。
function mockFetch(routes: Array<[string, unknown]>) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fn = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body });
    return {
      ok: true,
      json: async () => {
        for (const [k, v] of routes) {
          const [m, sub] = k.includes(' ') ? k.split(' ') : ['', k];
          if ((!m || m === method) && url.includes(sub)) return typeof v === 'function' ? (v as () => unknown)() : v;
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

const VIEW: SettingsView = {
  providers: [
    { id: 'qwen', name: 'Qwen (Alibaba DashScope)', models: ['qwen-max', 'qwen-plus'], model: 'qwen-max', isLocal: false, envKey: 'DASHSCOPE_API_KEY', apiKeyMasked: '', hasConfigKey: false, keyAvailable: false },
    { id: 'anthropic', name: 'Claude (Anthropic)', models: ['claude-sonnet-4-20250514'], model: 'claude-sonnet-4-20250514', isLocal: false, envKey: 'ANTHROPIC_API_KEY', apiKeyMasked: 'sk-***cdef', hasConfigKey: true, keyAvailable: true },
    { id: 'local', name: 'Local (Ollama)', models: ['llama3'], model: 'llama3', isLocal: true, envKey: '', apiKeyMasked: '', hasConfigKey: false, keyAvailable: true },
    { id: 'mock', name: 'Mock (测试)', models: ['mock'], model: 'mock', isLocal: false, envKey: '', apiKeyMasked: '', hasConfigKey: false, keyAvailable: false },
  ],
  default: 'anthropic',
};

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('SettingsPanel · BYO key 设置面板', () => {
  it('拉设置：千问排第一，已配置项显示打码 key，local 标免 key', async () => {
    mockFetch([['GET /api/settings', VIEW]]);
    await act(async () => { root.render(<SettingsPanel api="" onClose={() => {}} />); });
    await flush();
    const rows = Array.from(container.querySelectorAll('.apollo-settings-row'));
    expect(rows[0].getAttribute('data-provider')).toBe('qwen'); // 千问第一
    // anthropic 行有打码占位（绝不显明文）
    const anth = container.querySelector('.apollo-settings-row[data-provider="anthropic"]')!;
    const keyInput = anth.querySelector('input[type="password"]') as HTMLInputElement;
    expect(keyInput.placeholder).toContain('sk-***cdef');
    // local 行免 key（无 key 输入框）+ 徽标
    const local = container.querySelector('.apollo-settings-row[data-provider="local"]')!;
    expect(local.querySelector('input[type="password"]')).toBeNull();
    expect(local.textContent).toContain('本地 · 免 key');
  });

  it('Seedream 模型下拉：渲在 ARK key 行下方·3 档·改选随 PUT 送 genOptions（owner 2026-07-21）', async () => {
    const view: SettingsView = {
      ...VIEW,
      genKeys: [{ envKey: 'ARK_API_KEY', apiKeyMasked: '', hasConfigKey: false, keyAvailable: false }],
      genOptions: [{
        envKey: 'ARK_SEEDREAM_MODEL', label: 'Seedream 模型版本', forKey: 'ARK_API_KEY',
        default: 'doubao-seedream-4-0-250828', value: 'doubao-seedream-4-0-250828',
        choices: [
          { value: 'doubao-seedream-4-0-250828', label: 'Seedream 4.0（1K/2K/4K·稳定）' },
          { value: 'doubao-seedream-4-5-251128', label: 'Seedream 4.5（2K/4K）' },
          { value: 'doubao-seedream-5-0-260128', label: 'Seedream 5.0（2K/3K·最新）' },
        ],
      }],
    };
    const { calls } = mockFetch([['GET /api/settings', view], ['PUT /api/settings', { success: true, ...view }]]);
    await act(async () => { root.render(<SettingsPanel api="" onClose={() => {}} />); });
    await flush();
    const sel = container.querySelector('select[aria-label="Seedream 模型版本"]') as HTMLSelectElement;
    expect(sel).toBeTruthy();
    expect(sel.querySelectorAll('option').length).toBe(3); // 4.0/4.5/5.0
    expect(sel.value).toBe('doubao-seedream-4-0-250828'); // 默认生效值
    // 改选 5.0 → 保存 → PUT 载荷带 genOptions
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(sel, 'doubao-seedream-5-0-260128'); sel.dispatchEvent(new Event('change', { bubbles: true })); });
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('保存设置'))!;
    await act(async () => { saveBtn.click(); });
    await flush();
    const put = calls.find((c) => c.method === 'PUT');
    expect(put).toBeTruthy();
    expect(JSON.parse(put!.body!).genOptions).toEqual({ ARK_SEEDREAM_MODEL: 'doubao-seedream-5-0-260128' });
  });

  it('填 key → 测试连接：先 PUT 落盘（仅 dirty 项送 apiKey）再 POST test，显示结果', async () => {
    const { calls } = mockFetch([
      ['GET /api/settings', VIEW],
      ['PUT /api/settings', { success: true, ...VIEW }],
      ['POST /api/settings/test', { ok: true }],
    ]);
    await act(async () => { root.render(<SettingsPanel api="" onClose={() => {}} />); });
    await flush();
    // 在 qwen 行填 key
    const qwen = container.querySelector('.apollo-settings-row[data-provider="qwen"]')!;
    const input = qwen.querySelector('input[type="password"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, 'my-new-qwen-key');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // 点该行「测试连接」
    const testBtn = Array.from(qwen.querySelectorAll('button')).find((b) => b.textContent?.includes('测试连接'))!;
    await act(async () => { testBtn.click(); });
    await flush();
    // PUT 载荷只含 dirty 的 qwen.apiKey（anthropic 未改 → 不送 apiKey）
    const put = calls.find((c) => c.method === 'PUT');
    expect(put).toBeTruthy();
    const payload = JSON.parse(put!.body!);
    expect(payload.providers.qwen.apiKey).toBe('my-new-qwen-key');
    expect(payload.providers.anthropic?.apiKey).toBeUndefined(); // 未改动不覆盖
    // POST test 发出 + 成功提示
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('/settings/test'))).toBe(true);
    expect(qwen.textContent).toContain('连接成功');
  });
});

describe('BenchOverlay · 五轴体检浮层', () => {
  it('POST bench → 显示总分 + 及格线 70 + 五轴分', async () => {
    mockFetch([['POST /api/library/mini/bench', {
      success: true, score: 85, pass: true, threshold: 70,
      axes: [
        { name: 'Structure', score: 20, max: 20, notes: [] },
        { name: 'Load', score: 15, max: 15, notes: [] },
        { name: 'Determinism', score: 20, max: 20, notes: [] },
        { name: 'Numeric', score: 20, max: 20, notes: [] },
        { name: 'Visual', score: 10, max: 25, notes: ['没有任何渲染项落在视口内'] },
      ],
    }]]);
    await act(async () => { root.render(<BenchOverlay api="" slug="mini" title="Mini" onClose={() => {}} />); });
    await flush();
    expect(container.textContent).toContain('85');       // 总分
    expect(container.textContent).toContain('及格线 70'); // 及格线
    expect(container.textContent).toContain('通过');       // pass
    // 五轴名（中文注解含轴关键词）
    for (const axis of ['结构', '装载', '确定性', '数值', '可见']) {
      expect(container.textContent).toContain(axis);
    }
    expect(container.textContent).toContain('没有任何渲染项落在视口内'); // 轴 notes
  });

  it('bench 失败 → 错误态（不白屏）', async () => {
    mockFetch([['POST /api/library/bad/bench', { success: false, error: 'manifest 读取失败' }]]);
    await act(async () => { root.render(<BenchOverlay api="" slug="bad" title="Bad" onClose={() => {}} />); });
    await flush();
    expect(container.textContent).toContain('体检没跑成');
    expect(container.textContent).toContain('manifest 读取失败');
  });
});
