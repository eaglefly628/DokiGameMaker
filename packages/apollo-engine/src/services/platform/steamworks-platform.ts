import type { PlatformPort } from './platform-port.js';

// SteamworksPlatformPort —— 真实 Steam 适配器（**渲染进程侧**）。
// steamworks.js 是原生 Node 模块，只能跑在 Electron **主进程**；本类不直接 require 它，
// 而是通过 preload 经 contextBridge 暴露的 `globalThis.__APOLLO_STEAM__` 桥接调用主进程
// （IPC）。web/dev/headless 无此桥 → 工厂 createPlatformPort() 自动退回 NullPlatformPort。
// 所有方法对桥缺失/桥方法缺失静默降级（与 Null 同样不抛），游戏代码零分支。

/** preload 经 contextBridge 注入渲染进程的 Steam 桥契约（主进程 steam.cjs 的镜像）。 */
export interface SteamBridge {
  /** Steam 是否 init 成功（无 Steam 客户端 / 未登录 / 模块缺失 → false）。 */
  available: boolean;
  /** 本地玩家名（自检/调试展示用；不可用为 null）。 */
  name: string | null;
  /** 运行所用 appId（测试期为 480·SpaceWar）。 */
  appId: number;
  unlockAchievement?(id: string): void;
  clearAchievement?(id: string): void;
  setStat?(id: string, value: number): void;
  getStat?(id: string): number;
  uploadLeaderboard?(boardId: string, score: number): void;
  setRichPresence?(key: string, value: string): void;
  store?(): void;
}

export class SteamworksPlatformPort implements PlatformPort {
  constructor(private readonly bridge: SteamBridge) {}

  isAvailable(): boolean { return !!this.bridge.available; }
  unlockAchievement(id: string): void { this.bridge.unlockAchievement?.(id); }
  clearAchievement(id: string): void { this.bridge.clearAchievement?.(id); }
  setStat(id: string, value: number): void { this.bridge.setStat?.(id, value); }
  getStat(id: string): number { return this.bridge.getStat?.(id) ?? 0; }
  uploadLeaderboard(boardId: string, score: number): void { this.bridge.uploadLeaderboard?.(boardId, score); }
  setRichPresence(key: string, value: string): void { this.bridge.setRichPresence?.(key, value); }
  store(): void { this.bridge.store?.(); }
}
