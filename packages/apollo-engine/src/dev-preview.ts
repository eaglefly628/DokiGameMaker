/**
 * dev-preview —— 本地开发预览入口（`pnpm dev:engine`）。
 *
 * 为什么不用上游的 launcher：上游 `src/launcher/game-runner.tsx` 里有一张指向**全部 15 个
 * 游戏**的静态动态-import 表，而本仓只 vendored 了其中少数（见 SYNC.json），整表搬进来会
 * 留一堆解析不到的路径。这里改用一个**只挂已搬入游戏**的最小入口：契约就是各游戏导出的
 * `mount(container) => cleanup`，与上游 game-runner 消费的是同一个契约，不另造机制。
 *
 * 加一个游戏 = 在 GAMES 里加一行（前提是它已经搬进 src/games/ 且导出 mount）。
 */

type MountFn = (container: HTMLElement) => () => void;

interface PreviewGame {
  id: string;
  title: string;
  /** 动态 import，点了才加载——避免开页就把所有游戏的依赖（three 等）全拉起来。 */
  load: () => Promise<{ mount: MountFn }>;
}

/**
 * 可预览的游戏清单。只列**已 vendored 且导出 mount** 的游戏。
 * 注：game-e / game-f 虽已搬入，但它们在上游是由 Studio 消费的数据夹具，
 * 自身不导出 mount（其运行入口在上游未搬运的 `src/game-e.ts` 等文件里），故不在此列。
 */
const GAMES: PreviewGame[] = [
  {
    id: 'game-i',
    title: 'Game I',
    load: () => import('./games/game-i/game-i.js') as Promise<{ mount: MountFn }>,
  },
];

const app = document.getElementById('app');
if (!app) throw new Error('#app not found');

let cleanup: (() => void) | undefined;

function renderPicker(): void {
  cleanup?.();
  cleanup = undefined;
  app!.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.style.cssText =
    'display:flex;flex-direction:column;gap:20px;align-items:center;justify-content:center;height:100%;padding:32px;';

  const h = document.createElement('h1');
  h.textContent = 'ZeroCraft Engine · 本地预览';
  h.style.cssText = 'font-size:22px;font-weight:600;letter-spacing:.5px;';
  wrap.appendChild(h);

  const hint = document.createElement('p');
  hint.textContent = `已搬入 ${GAMES.length} 个可运行游戏；点击启动。`;
  hint.style.cssText = 'font-size:13px;opacity:.65;';
  wrap.appendChild(hint);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center;';
  for (const game of GAMES) {
    const btn = document.createElement('button');
    btn.textContent = `▶ ${game.title}`;
    btn.style.cssText =
      'padding:12px 22px;border-radius:10px;border:1px solid #3b4a72;background:#16203c;' +
      'color:#e8ecf8;font-size:14px;cursor:pointer;';
    btn.onclick = () => void startGame(game);
    row.appendChild(btn);
  }
  wrap.appendChild(row);
  app!.appendChild(wrap);
}

async function startGame(game: PreviewGame): Promise<void> {
  app!.innerHTML = '';

  // 返回按钮：卸载当前游戏、回到选择页(与上游壳层 GameOverlayMenu 同语义,最小实现)。
  const back = document.createElement('button');
  back.textContent = '⟵ 返回';
  back.style.cssText =
    'position:absolute;top:12px;left:12px;z-index:9999;padding:6px 14px;border-radius:8px;' +
    'border:1px solid #3b4a72;background:rgba(10,15,30,.82);color:#e8ecf8;font-size:13px;cursor:pointer;';
  back.onclick = () => renderPicker();
  app!.appendChild(back);

  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;inset:0;';
  app!.appendChild(host);

  try {
    const mod = await game.load();
    cleanup = mod.mount(host);
  } catch (err) {
    host.innerHTML =
      `<div style="padding:32px;font:13px/1.7 monospace;color:#ff9a9a;white-space:pre-wrap">` +
      `启动 ${game.id} 失败：\n${err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err)}</div>`;
  }
}

renderPicker();
