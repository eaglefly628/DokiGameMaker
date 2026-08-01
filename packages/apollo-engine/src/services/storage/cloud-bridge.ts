// SteamCloudBridge —— Steam 云存储（Remote Storage）桥契约。真实现：preload 经 contextBridge
// 暴露 window.__APOLLO_STEAM_CLOUD__（主进程 steamworks.js client.cloud），异步文件读写。
// 渲染进程不直接碰原生模块。无壳/未开假 → 工厂退回 LocalStorage/Memory。
// 假后端 createMockSteamCloudBridge()：内存 + localStorage 持久化，无真账号也能验云存档全链路。

export interface SteamCloudBridge {
  available: boolean;
  readFile(name: string): Promise<string | null>;
  writeFile(name: string, content: string): Promise<boolean>;
  deleteFile(name: string): Promise<boolean>;
  listFiles(): Promise<string[]>;
}

const LS_KEY = 'apollo:steam:cloud:files';

function load(persist: boolean): Record<string, string> {
  if (!persist) return {};
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function save(persist: boolean, files: Record<string, string>): void {
  if (!persist) return;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, JSON.stringify(files)); } catch { /* ignore */ }
}

export interface MockCloudOptions { persist?: boolean; log?: boolean; }

/** 假 Steam 云：与真桥同契约的本地实现（内存 + 可选 localStorage 持久化）。 */
export function createMockSteamCloudBridge(opts: MockCloudOptions = {}): SteamCloudBridge {
  const persist = opts.persist ?? true;
  const log = opts.log ?? false;
  const files = load(persist);
  const note = (op: string, name: string) => { if (log) console.log('[steam:cloud:mock]', op, name); };
  return {
    available: true,
    async readFile(name) { return Object.prototype.hasOwnProperty.call(files, name) ? files[name] : null; },
    async writeFile(name, content) { files[name] = content; save(persist, files); note('write', name); return true; },
    async deleteFile(name) { const had = delete files[name]; save(persist, files); note('delete', name); return had; },
    async listFiles() { return Object.keys(files); },
  };
}

/** 抹掉持久化的假云（开发/测试复位）。 */
export function resetMockSteamCloud(): void {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}
