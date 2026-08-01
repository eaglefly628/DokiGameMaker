import { describe, it, expect } from 'vitest';
import { SteamworksPlatformPort, createPlatformPort, NullPlatformPort } from './index.js';
import type { SteamBridge } from './index.js';

// 假桥：记录调用，模拟 preload 注入的 __APOLLO_STEAM__（无真 Steam，确定性可测）。
function fakeBridge(over: Partial<SteamBridge> = {}): { bridge: SteamBridge; calls: string[] } {
  const calls: string[] = [];
  const bridge: SteamBridge = {
    available: true, name: 'TESTER', appId: 480,
    unlockAchievement: (id) => calls.push(`unlock:${id}`),
    clearAchievement: (id) => calls.push(`clear:${id}`),
    setStat: (id, v) => calls.push(`setStat:${id}=${v}`),
    getStat: (id) => (id === 'wins' ? 7 : 0),
    uploadLeaderboard: (b, s) => calls.push(`lb:${b}=${s}`),
    setRichPresence: (k, v) => calls.push(`rp:${k}=${v}`),
    store: () => calls.push('store'),
    ...over,
  };
  return { bridge, calls };
}

describe('platform · SteamworksPlatformPort（渲染进程→桥委派）', () => {
  it('每个方法都委派到桥；getStat 取回桥的值', () => {
    const { bridge, calls } = fakeBridge();
    const p = new SteamworksPlatformPort(bridge);
    expect(p.isAvailable()).toBe(true);
    expect(p.getStat('wins')).toBe(7);
    p.unlockAchievement('ACH_X'); p.clearAchievement('ACH_X');
    p.setStat('wins', 3); p.uploadLeaderboard('lb1', 99);
    p.setRichPresence('stage', '第3关'); p.store();
    expect(calls).toEqual([
      'unlock:ACH_X', 'clear:ACH_X', 'setStat:wins=3', 'lb:lb1=99', 'rp:stage=第3关', 'store',
    ]);
  });

  it('桥方法缺失 → 静默降级不抛；getStat 缺失回 0', () => {
    const p = new SteamworksPlatformPort({ available: true, name: null, appId: 480 });
    expect(p.getStat('wins')).toBe(0);
    expect(() => { p.unlockAchievement('a'); p.setStat('s', 1); p.store(); }).not.toThrow();
  });
});

describe('platform · createPlatformPort 工厂（零分支选实现）', () => {
  it('有可用桥 → SteamworksPlatformPort', () => {
    const { bridge } = fakeBridge();
    expect(createPlatformPort(bridge)).toBeInstanceOf(SteamworksPlatformPort);
  });
  it('桥不可用（available=false）→ NullPlatformPort', () => {
    const { bridge } = fakeBridge({ available: false });
    expect(createPlatformPort(bridge)).toBeInstanceOf(NullPlatformPort);
  });
  it('无桥（web/dev/headless）→ NullPlatformPort', () => {
    expect(createPlatformPort(undefined)).toBeInstanceOf(NullPlatformPort);
  });
});
