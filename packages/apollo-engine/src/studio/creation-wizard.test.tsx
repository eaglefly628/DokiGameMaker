// @vitest-environment happy-dom
// 创作台 v1 · M2 创作向导无头集成测试：create（新建）与 revise（继续创作）全链路——
// 填词 → 生成（mock /api/generate）→ 预览 canvas → 保存（create+PUT / PUT）→ onSaved。
// 以及失败态（人话提示 + 原始错误可折叠）与 autofix 提示（attempts>1）。
// fetch 全 vi.stubGlobal mock（method+url 路由），不依赖真 apollo.py。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationWizard } from './CreationWizard.js';
import type { ProviderInfo } from './library-model.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PROVIDERS: ProviderInfo[] = [{ id: 'mock', name: 'Mock (test)', models: ['mock'], available: true }];
const MANIFEST = { capabilities: ['a1-transform'], entities: { e: { Transform: { x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 } } } };

// method+url 感知的 fetch mock：routes = [[method, urlSubstr, responseJson], ...]，顺序=优先级。
function mockFetch(routes: Array<[string, string, unknown]>) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: { method?: string; body?: string }) => {
    const method = (opts?.method ?? 'GET').toUpperCase();
    calls.push({ method, url: String(url), body: opts?.body ? JSON.parse(opts.body) : undefined });
    return {
      ok: true,
      json: async () => {
        for (const [m, k, v] of routes) if (m === method && String(url).includes(k)) return v;
        return {};
      },
    };
  }));
  return calls;
}

async function flush(times = 3) {
  for (let i = 0; i < times; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

function findButton(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
}
function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

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

describe('CreationWizard · create 新建', () => {
  it('填名+创意 → 生成 → 预览 canvas → 保存入库 → create+PUT 落盘 + onSaved(slug)', async () => {
    const calls = mockFetch([
      ['POST', '/api/generate', { success: true, manifest: MANIFEST, attempts: 1, fixed_errors: [] }],
      ['POST', '/api/library/create', { success: true, slug: 'my-game' }],
      ['PUT', '/manifest', { success: true }],
    ]);
    let saved: string | null = null;
    await act(async () => {
      root.render(
        <CreationWizard api="" mode="create" providers={PROVIDERS} catalog="CAT"
          onClose={() => {}} onSaved={(s) => { saved = s; }} />,
      );
    });
    // provider 展示
    expect(container.textContent).toContain('Mock (test)');
    // 填词
    const name = container.querySelector('input') as HTMLInputElement;
    const idea = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => { typeInto(name, '我的游戏'); typeInto(idea, '小球弹跳'); });
    // 生成
    await act(async () => { findButton(container, '开始生成')!.click(); });
    await flush();
    // 预览 canvas 就位 + 保存/弃掉
    expect(container.querySelector('canvas')).toBeTruthy();
    expect(findButton(container, '保存入库')).toBeTruthy();
    expect(findButton(container, '弃掉重来')).toBeTruthy();
    // 生成请求带了 autofix + catalog
    const gen = calls.find((c) => c.url.includes('/api/generate'));
    expect((gen!.body as { autofix: boolean }).autofix).toBe(true);
    expect((gen!.body as { catalog: string }).catalog).toBe('CAT');
    // 保存
    await act(async () => { findButton(container, '保存入库')!.click(); });
    await flush();
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('/api/library/create'))).toBe(true);
    const put = calls.find((c) => c.method === 'PUT' && c.url.includes('/my-game/manifest'));
    expect(put).toBeTruthy();
    expect((put!.body as { note: string }).note).toBe('初版生成');
    expect(saved).toBe('my-game');
  });

  it('默认「从模板改」→ 生成请求 mode:template-edit + 预览标注模板；切「自由生成」→ 无 mode（从零）', async () => {
    const calls = mockFetch([
      ['POST', '/api/generate', { success: true, manifest: MANIFEST, attempts: 1, fixed_errors: [], template: 'dice' }],
    ]);
    await act(async () => {
      root.render(<CreationWizard api="" mode="create" providers={PROVIDERS} catalog="CAT" onClose={() => {}} onSaved={() => {}} />);
    });
    // 默认生成方式 = 从模板改（推荐）
    expect(container.textContent).toContain('从模板改');
    expect(container.textContent).toContain('自由生成');
    const name = container.querySelector('input') as HTMLInputElement;
    const idea = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => { typeInto(name, '骰子游戏'); typeInto(idea, '两人投骰子比大小'); });
    await act(async () => { findButton(container, '开始生成')!.click(); });
    await flush();
    const gen1 = calls.find((c) => c.url.includes('/api/generate'));
    expect((gen1!.body as { mode?: string }).mode).toBe('template-edit');
    expect((gen1!.body as { prompt: string }).prompt).toBe('两人投骰子比大小');
    // 预览态标注了模板来源
    expect(container.textContent).toContain('模板修改');

    // 回输入态 → 切「自由生成」→ 再生成：无 mode（从零自由生成）
    await act(async () => { findButton(container, '弃掉重来')!.click(); });
    await act(async () => { findButton(container, '自由生成')!.click(); });
    await act(async () => { findButton(container, '开始生成')!.click(); });
    await flush();
    const gens = calls.filter((c) => c.url.includes('/api/generate'));
    expect((gens[gens.length - 1].body as { mode?: string }).mode).toBeUndefined();
    expect((gens[gens.length - 1].body as { prompt: string }).prompt).toBe('两人投骰子比大小');
  });

  it('生成失败 → 人话提示 + 原始校验错误可折叠 + 可换说法重试', async () => {
    mockFetch([
      ['POST', '/api/generate', { success: false, error: '自动修正 3 次后仍未通过校验，换个说法再试试。', fixed_errors: ['manifest: bad', 'manifest: still bad'] }],
    ]);
    await act(async () => {
      root.render(<CreationWizard api="" mode="create" providers={PROVIDERS} catalog="C" onClose={() => {}} onSaved={() => {}} />);
    });
    const name = container.querySelector('input') as HTMLInputElement;
    const idea = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => { typeInto(name, 'G'); typeInto(idea, 'x'); });
    await act(async () => { findButton(container, '开始生成')!.click(); });
    await flush();
    expect(container.textContent).toContain('没能造出来');
    expect(container.textContent).toContain('换个说法');
    expect(container.textContent).toContain('查看原始校验错误');
    expect(findButton(container, '换个说法再生成')).toBeTruthy();
  });

  it('autofix 生效（attempts>1）→ 预览标注「自动修正了 N 次」', async () => {
    mockFetch([
      ['POST', '/api/generate', { success: true, manifest: MANIFEST, attempts: 3, fixed_errors: ['a', 'b'] }],
    ]);
    await act(async () => {
      root.render(<CreationWizard api="" mode="create" providers={PROVIDERS} catalog="C" onClose={() => {}} onSaved={() => {}} />);
    });
    const name = container.querySelector('input') as HTMLInputElement;
    const idea = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => { typeInto(name, 'G'); typeInto(idea, 'x'); });
    await act(async () => { findButton(container, '开始生成')!.click(); });
    await flush();
    expect(container.textContent).toContain('自动修正了 2 次');
  });
});

describe('CreationWizard · revise 继续创作', () => {
  it('拉当前 manifest → 输入指令 → 生成 revise → 预览 → 保存这一版（PUT note=指令摘要）', async () => {
    const calls = mockFetch([
      ['GET', '/history', { mode: 'git', entries: [{ rev: 'a', subject: 'create', date: 'd' }, { rev: 'b', subject: 'update', date: 'd' }] }],
      ['GET', '/manifest', MANIFEST],
      ['POST', '/api/generate', { success: true, manifest: MANIFEST, attempts: 1, fixed_errors: [] }],
      ['PUT', '/manifest', { success: true }],
    ]);
    let saved: string | null = null;
    await act(async () => {
      root.render(
        <CreationWizard api="" mode="revise" slug="my-game" initialName="我的游戏"
          providers={PROVIDERS} catalog="C" onClose={() => {}} onSaved={(s) => { saved = s; }} />,
      );
    });
    await flush();
    expect(container.textContent).toContain('我的游戏');
    expect(container.textContent).toContain('当前 2 个版本');
    const instr = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => { typeInto(instr, '把玩家改成红色'); });
    await act(async () => { findButton(container, '应用修改')!.click(); });
    await flush();
    // revise 请求形态
    const gen = calls.find((c) => c.url.includes('/api/generate'));
    expect((gen!.body as { mode: string }).mode).toBe('revise');
    expect((gen!.body as { instruction: string }).instruction).toBe('把玩家改成红色');
    expect((gen!.body as { current_manifest: unknown }).current_manifest).toBeTruthy();
    // 预览 + 保存
    expect(container.querySelector('canvas')).toBeTruthy();
    await act(async () => { findButton(container, '保存这一版')!.click(); });
    await flush();
    const put = calls.filter((c) => c.method === 'PUT' && c.url.includes('/my-game/manifest'));
    expect(put.length).toBeGreaterThanOrEqual(1);
    expect((put[put.length - 1].body as { note: string }).note).toBe('把玩家改成红色');
    expect(saved).toBe('my-game');
  });
});
