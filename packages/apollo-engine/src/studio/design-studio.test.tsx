// @vitest-environment happy-dom
// 创作台 · 设计先行流无头集成测试：EntryChoice 双选 / ContinueChoice 双选 /
// DesignStudio 全链路（讨论两轮→ready→分解→目录 4 文件→改一处 revise+PUT→定稿生成原型→预览 canvas→保存 onSaved）。
// fetch 全 vi.stubGlobal mock：/api/generate 按 body.mode 路由，其余按 method+url。不依赖真 apollo.py。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DesignStudio, EntryChoice, ContinueChoice } from './DesignStudio.js';
import type { ProviderInfo } from './library-model.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PROVIDERS: ProviderInfo[] = [{ id: 'mock', name: 'Mock (test)', models: ['mock'], available: true }];
const FILES = {
  'pitch.md': '# 骰子对决\n两人比大小',
  'systems/dice.md': '# 系统\n各投一颗',
  'content.md': '# 内容\n一局',
  'capability-plan.md': '# 能力\n| w1-random | ✅ |',
};
const MANIFEST = { capabilities: ['a1-transform'], entities: { e: { Transform: { x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 } } } };

// /api/generate 按 body.mode 路由；design-chat 第 N 次调用可变 ready。
function mockFetch() {
  const calls: Array<{ method: string; url: string; body: any }> = [];
  let chatTurns = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: { method?: string; body?: string }) => {
    const method = (opts?.method ?? 'GET').toUpperCase();
    const body = opts?.body ? JSON.parse(opts.body) : undefined;
    calls.push({ method, url: String(url), body });
    const u = String(url);
    let res: unknown = {};
    if (u.includes('/api/generate')) {
      const mode = body?.mode;
      if (mode === 'design-chat') { chatTurns += 1; res = { success: true, reply: `回复${chatTurns}`, ready: chatTurns >= 2 }; }
      else if (mode === 'design-breakdown') res = { success: true, slug: 'my-game', files: FILES, attempts: 1 };
      else if (mode === 'design-revise') res = { success: true, file_path: body.file_path, content: '# 改过了\n目标分数 3' };
      else if (mode === 'prototype') res = { success: true, manifest: MANIFEST, attempts: 1 };
    } else if (u.includes('/api/library/create')) res = { success: true, slug: 'my-game' };
    else if (method === 'PUT') res = { success: true };
    else if (u.includes('/design')) res = { files: FILES };
    return { ok: true, json: async () => res };
  }));
  return calls;
}

async function flush(times = 4) {
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
function keydown(el: HTMLElement, key: string, opts: Partial<KeyboardEventInit> = {}) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
}

let container: HTMLElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('EntryChoice · 新建入口双选卡', () => {
  it('渲染两张卡 + 回调分流', async () => {
    let picked = '';
    await act(async () => {
      root.render(<EntryChoice onDesign={() => { picked = 'design'; }} onQuick={() => { picked = 'quick'; }} onClose={() => {}} />);
    });
    expect(container.textContent).toContain('设计一个游戏');
    expect(container.textContent).toContain('快速生成');
    expect(container.textContent).toContain('推荐');
    await act(async () => { findButton(container, '设计一个游戏')!.click(); });
    expect(picked).toBe('design');
  });
});

describe('ContinueChoice · 继续创作双选', () => {
  it('改设计 / 快改数值 两选项', async () => {
    let picked = '';
    await act(async () => {
      root.render(<ContinueChoice name="骰子对决" onEditDesign={() => { picked = 'design'; }} onQuickRevise={() => { picked = 'revise'; }} onClose={() => {}} />);
    });
    expect(container.textContent).toContain('骰子对决');
    expect(container.textContent).toContain('改设计');
    expect(container.textContent).toContain('快改数值');
    await act(async () => { findButton(container, '快改数值')!.click(); });
    expect(picked).toBe('revise');
  });
});

describe('DesignStudio · 设计先行流全链路', () => {
  it('讨论两轮→ready→分解→目录 4 文件→改一处→定稿生成原型→预览→保存', async () => {
    const calls = mockFetch();
    let saved: string | null = null;
    await act(async () => {
      root.render(
        <DesignStudio api="" providers={PROVIDERS} catalog="CAT"
          onClose={() => {}} onSaved={(s) => { saved = s; }} onDirty={() => {}} />,
      );
    });
    expect(container.textContent).toContain('Mock (test)');

    // 填名
    const nameInput = container.querySelector('input') as HTMLInputElement;
    await act(async () => { typeInto(nameInput, '骰子对决'); });

    // 讨论第一轮
    const chatBox = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => { typeInto(chatBox, '我想做个骰子游戏'); });
    await act(async () => { findButton(container, '发送')!.click(); });
    await flush();
    // 分解还不可用（ready=false）
    expect(findButton(container, '分解成设计稿')!.disabled).toBe(true);

    // 讨论第二轮 → ready
    const chatBox2 = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => { typeInto(chatBox2, '先赢两局者胜'); });
    await act(async () => { findButton(container, '发送')!.click(); });
    await flush();
    expect(container.textContent).toContain('可以分解成设计稿了');
    expect(findButton(container, '分解成设计稿')!.disabled).toBe(false);

    // 分解 → 目录 4 文件
    await act(async () => { findButton(container, '分解成设计稿')!.click(); });
    await flush();
    expect(container.textContent).toContain('pitch.md');
    expect(container.textContent).toContain('systems/dice.md');
    expect(container.textContent).toContain('capability-plan.md');
    // breakdown 请求带 slug + messages + catalog
    const bd = calls.find((c) => c.body?.mode === 'design-breakdown');
    expect(bd!.body.slug).toBe('my-game');
    expect(bd!.body.catalog).toBe('CAT');
    // 建库先于分解
    expect(calls.some((c) => c.url.includes('/api/library/create'))).toBe(true);

    // 改一处：选中 pitch.md（默认已选首个）→ 输入指令 → 应用修订 → design-revise + PUT
    const reviseBox = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => { typeInto(reviseBox, '目标分数改 3'); });
    await act(async () => { findButton(container, '应用修订')!.click(); });
    await flush();
    const rev = calls.find((c) => c.body?.mode === 'design-revise');
    expect(rev!.body.instruction).toBe('目标分数改 3');
    const put = calls.find((c) => c.method === 'PUT' && c.url.includes('/design/'));
    expect(put).toBeTruthy();
    expect((put!.body as { content: string }).content).toContain('改过了');
    // 内容变化反映到视图
    expect(container.textContent).toContain('改过了');

    // 定稿 → 生成原型 → 预览 canvas
    await act(async () => { findButton(container, '生成原型')!.click(); });
    await flush();
    expect(calls.some((c) => c.body?.mode === 'prototype')).toBe(true);
    expect(container.querySelector('canvas')).toBeTruthy();

    // 保存入库 → PUT manifest note=原型生成 v1 → onSaved
    await act(async () => { findButton(container, '保存入库')!.click(); });
    await flush();
    const manifestPut = calls.find((c) => c.method === 'PUT' && c.url.includes('/manifest'));
    expect(manifestPut).toBeTruthy();
    expect((manifestPut!.body as { note: string }).note).toBe('原型生成 v1');
    expect(saved).toBe('my-game');
  });

  it('相变纪律：聊天框裸 Enter 不发送、不触发相变（只换行）', async () => {
    const calls = mockFetch();
    await act(async () => {
      root.render(<DesignStudio api="" providers={PROVIDERS} catalog="C" onClose={() => {}} onSaved={() => {}} onDirty={() => {}} />);
    });
    await flush();
    const chatBox = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => { typeInto(chatBox, '我想做个骰子游戏'); });
    // 裸 Enter：不触发 sendChat（无 design-chat 请求）、仍在讨论态
    await act(async () => { keydown(chatBox, 'Enter'); });
    await flush();
    expect(calls.some((c) => c.body?.mode === 'design-chat')).toBe(false);
    expect(container.textContent).toContain('分解成设计稿'); // 仍在 chat 态（讨论态才有此按钮）
    // Ctrl+Enter：才发送
    await act(async () => { keydown(chatBox, 'Enter', { ctrlKey: true }); });
    await flush();
    expect(calls.some((c) => c.body?.mode === 'design-chat')).toBe(true);
  });

  it('失败不降级：provider 失败 → 红条报错 + 线程原样保留', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: { method?: string; body?: string }) => {
      const u = String(url);
      const body = opts?.body ? JSON.parse(opts.body) : undefined;
      let res: unknown = {};
      if (u.includes('/api/generate') && body?.mode === 'design-chat') res = { success: false, error: 'deepseek 返回 502 Bad Gateway' };
      else if (u.endsWith('/api/design-drafts')) res = { drafts: [] };
      return { ok: true, json: async () => res };
    }));
    await act(async () => {
      root.render(<DesignStudio api="" providers={PROVIDERS} catalog="C" onClose={() => {}} onSaved={() => {}} onDirty={() => {}} />);
    });
    await flush();
    const chatBox = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => { typeInto(chatBox, '我要做一个塔防游戏'); });
    await act(async () => { findButton(container, '发送')!.click(); });
    await flush();
    // 红条 + 原文可展开
    expect(container.textContent).toContain('出错了');
    expect(container.textContent).toContain('deepseek 返回 502');
    expect(container.textContent).toContain('查看原始返回');
    // 线程原样保留：用户那条消息还在
    expect(container.textContent).toContain('我要做一个塔防游戏');
  });

  it('草稿持久化：每轮往返后有内容 → 关闭时立即落草稿（PUT /api/design-drafts）', async () => {
    const calls = mockFetch();
    let closed = false;
    await act(async () => {
      root.render(<DesignStudio api="" providers={PROVIDERS} catalog="C" onClose={() => { closed = true; }} onSaved={() => {}} onDirty={() => {}} />);
    });
    await flush();
    const chatBox = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => { typeInto(chatBox, '我想做个骰子游戏'); });
    await act(async () => { findButton(container, '发送')!.click(); });
    await flush();
    // 关闭 → flush 立即落盘
    await act(async () => { (container.querySelector('button[aria-label="关闭"]') as HTMLButtonElement).click(); });
    await flush();
    const draftPut = calls.find((c) => c.method === 'PUT' && c.url.includes('/api/design-drafts/'));
    expect(draftPut).toBeTruthy();
    expect(Array.isArray((draftPut!.body as { messages: unknown[] }).messages)).toBe(true);
    expect((draftPut!.body as { messages: unknown[] }).messages.length).toBeGreaterThanOrEqual(1);
    expect(closed).toBe(true);
  });

  it('草稿恢复：打开设计台列出未完成草稿 → 一键恢复线程回来', async () => {
    const FULL_DRAFT = {
      id: 'draft-1', name: '恢复我', slug: null, phase: 'chat', ready: true,
      messages: [
        { role: 'user', content: '第一句想法内容' },
        { role: 'assistant', content: '追问一句' },
        { role: 'user', content: '第二句补充' },
        { role: 'assistant', content: '好的' },
      ],
      files: {}, manifest: null,
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: { method?: string }) => {
      const u = String(url); const method = (opts?.method ?? 'GET').toUpperCase();
      let res: unknown = {};
      if (u.endsWith('/api/design-drafts') && method === 'GET') {
        res = { drafts: [{ id: 'draft-1', slug: null, name: '恢复我', phase: 'chat', updatedAt: '2026-07-06T09:00:00', turns: 2, messageCount: 4 }] };
      } else if (u.includes('/api/design-drafts/draft-1') && method === 'GET') {
        res = { success: true, draft: FULL_DRAFT };
      }
      return { ok: true, json: async () => res };
    }));
    await act(async () => {
      root.render(<DesignStudio api="" providers={PROVIDERS} catalog="C" onClose={() => {}} onSaved={() => {}} onDirty={() => {}} />);
    });
    await flush();
    // 未完成草稿列表出现
    expect(container.textContent).toContain('未完成的草稿');
    expect(container.textContent).toContain('恢复我');
    // 点「恢复」→ 线程回来
    await act(async () => { findButton(container, '恢复')!.click(); });
    await flush();
    expect(container.textContent).toContain('第一句想法内容');
    expect(container.textContent).toContain('第二句补充');
  });

  it('继续创作已有 design（initialSlug）→ 直接进目录浏览（GET design）', async () => {
    const calls = mockFetch();
    await act(async () => {
      root.render(<DesignStudio api="" providers={PROVIDERS} catalog="C" initialSlug="my-game" initialName="骰子对决" onClose={() => {}} onSaved={() => {}} />);
    });
    await flush();
    // 直接拉了 design 目录
    expect(calls.some((c) => c.method === 'GET' && c.url.includes('/my-game/design'))).toBe(true);
    expect(container.textContent).toContain('pitch.md');
    // 没有讨论态的「发送」按钮（跳过 chat 直接 design）
    expect(container.textContent).toContain('设计定稿');
  });
});
