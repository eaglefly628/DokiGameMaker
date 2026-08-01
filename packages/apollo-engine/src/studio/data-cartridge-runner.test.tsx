// @vitest-environment happy-dom
// 创作台 v1 · 卡带架组件无头测试：空库欢迎态 + 数据卡带自动运行 + 版本历史浮层回滚。
// fetch 全部 vi.stubGlobal mock，不依赖真 apollo.py 服务。
// launcher 层的整线集成（玩家模式→点开始→canvas）另见 src/launcher.player.test.tsx。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LibraryShelf, DataCartridgeRunner, VersionHistoryOverlay } from './DataCartridgeRunner.js';
import type { GameEntry } from './library-model.js';

// 告知 React 当前处于 act 测试环境（消除 "not configured to support act" 警告，保证 effect 冲刷）。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 按 URL 子串路由的最小 fetch mock（返回 { ok, json }）。routes 顺序=优先级（长的放前）。
function mockFetch(routes: Array<[string, unknown]>) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => {
        for (const [k, v] of routes) if (url.includes(k)) return v;
        return {};
      },
    };
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

async function flush() {
  // 冲刷 fetch 微任务 + 后续 effect（RunOnly 引擎挂载）。
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
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

describe('LibraryShelf · 受控展示', () => {
  it('entries=[] → 渲染欢迎语与「新建游戏」空卡位', async () => {
    await act(async () => {
      root.render(
        <LibraryShelf entries={[]} onNewGame={() => {}} onInstallSample={() => {}} renderCarousel={() => null} />,
      );
    });
    expect(container.textContent).toContain('你的游戏架还是空的');
    expect(container.textContent).toContain('新建游戏');
    expect(container.textContent).toContain('装入官方示例卡带');
  });

  it('entries=null → 加载态；有条目 → renderCarousel', async () => {
    await act(async () => {
      root.render(
        <LibraryShelf entries={null} onNewGame={() => {}} onInstallSample={() => {}} renderCarousel={() => null} />,
      );
    });
    expect(container.textContent).toContain('加载游戏架');
    await act(async () => {
      root.render(
        <LibraryShelf
          entries={[{ slug: 's', meta: { name: 'S' }, valid: true }]}
          onNewGame={() => {}} onInstallSample={() => {}}
          renderCarousel={(es) => <div>轮播:{es.length}</div>}
        />,
      );
    });
    expect(container.textContent).toContain('轮播:1');
  });
});

describe('DataCartridgeRunner · 数据卡带纯运行', () => {
  const entry: GameEntry = {
    id: 'lib:mini', title: 'Mini', subtitle: '测试', description: '',
    color: '#1e3a5f', accentColor: '#38bdf8', icon: '🎮', status: 'playable',
  };

  it('最小合法 manifest → 挂载即自动拉取并运行（canvas 就位 + 返回架上）', async () => {
    mockFetch([['/manifest', { capabilities: [], entities: {} }]]);
    await act(async () => {
      root.render(
        <DataCartridgeRunner slug="mini" entry={entry} api="" onBack={() => {}} />,
      );
    });
    await flush();
    expect(container.querySelector('canvas')).toBeTruthy();
    expect(container.textContent).toContain('返回架上');
  });

  it('非法 manifest → 错误态（不白屏不抛错），仍可返回', async () => {
    mockFetch([['/manifest', { capabilities: ['no-such-capability'], entities: {} }]]);
    await act(async () => {
      root.render(
        <DataCartridgeRunner slug="bad" entry={entry} api="" onBack={() => {}} />,
      );
    });
    await flush();
    expect(container.textContent).toContain('卡带装入失败');
    expect(container.textContent).toContain('返回架上');
  });
});

describe('VersionHistoryOverlay · 版本历史与回滚', () => {
  it('列出 entries；点「回滚」→ POST rollback + 重拉 history + 通知上层', async () => {
    const { calls } = mockFetch([
      ['/history', { mode: 'git', entries: [{ rev: 'abc1234', subject: 'update', date: '2026-07-02' }] }],
      ['/rollback', { success: true }],
    ]);
    let rolled = 0;
    await act(async () => {
      root.render(
        <VersionHistoryOverlay api="" slug="s" onClose={() => {}} onRolledBack={() => { rolled++; }} />,
      );
    });
    await flush();
    expect(container.textContent).toContain('update');
    expect(container.textContent).toContain('2026-07-02');

    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '回滚');
    expect(btn).toBeTruthy();
    await act(async () => { btn!.click(); });
    await flush();

    expect(calls.some((u) => u.includes('/rollback'))).toBe(true);
    expect(calls.filter((u) => u.includes('/history')).length).toBeGreaterThanOrEqual(2); // 初拉 + 回滚后重拉
    expect(rolled).toBe(1);
  });
});
