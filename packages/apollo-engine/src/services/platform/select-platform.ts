import type { PlatformPort } from './platform-port.js';
import { NullPlatformPort } from './null-platform.js';
import { SteamworksPlatformPort, type SteamBridge } from './steamworks-platform.js';
import { createMockSteamBridge } from './mock-steam.js';

// 是否启用「假 Steam」后端（无真账号时全程开发验证用）。开关（任一为真即启用）：
//   globalThis.__APOLLO_STEAM_MOCK__ === true  ｜  localStorage['apollo:steam:mock'] === '1'
// 默认关闭 → web 生产仍是 NullPlatformPort，不会误开假成就。
export function isMockSteamEnabled(): boolean {
  const g = globalThis as { __APOLLO_STEAM_MOCK__?: boolean };
  if (g.__APOLLO_STEAM_MOCK__ === true) return true;
  try {
    // URL ?steammock=1 一次性开启并记到 localStorage（built cartridge 里无需开控制台）。
    if (typeof location !== 'undefined' && /[?&]steammock=1\b/.test(location.search)) {
      try { localStorage.setItem('apollo:steam:mock', '1'); } catch { /* ignore */ }
      return true;
    }
    return typeof localStorage !== 'undefined' && localStorage.getItem('apollo:steam:mock') === '1';
  } catch { return false; }
}

// createPlatformPort —— 平台端口工厂。游戏/壳层调一次拿到对的实现，**不写 if Steam 分支**。
// 优先级：① 原生壳真桥(available) → SteamworksPlatformPort；② 开了假 Steam → 同适配器包假桥
// （真假走同一代码路径）；③ 否则 NullPlatformPort 静默降级（web/dev/headless/测试）。
// bridge / opts.mock 可注入（测试用）；默认读 globalThis.__APOLLO_STEAM__ 与 isMockSteamEnabled()。
export function createPlatformPort(
  bridge: SteamBridge | undefined = (globalThis as { __APOLLO_STEAM__?: SteamBridge }).__APOLLO_STEAM__,
  opts: { mock?: boolean } = {},
): PlatformPort {
  if (bridge && bridge.available) return new SteamworksPlatformPort(bridge);
  const mock = opts.mock ?? isMockSteamEnabled();
  if (mock) return new SteamworksPlatformPort(createMockSteamBridge());
  return new NullPlatformPort();
}
