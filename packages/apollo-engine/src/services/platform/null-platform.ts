import type { PlatformPort } from './platform-port.js';

// 空平台端口：web / dev / headless / 测试用，全程 no-op。平台不可用即静默降级——
// 游戏代码无需写"如果有 Steam 才……"的分支。与 NullAudioPort 同位。
// 真实平台跑在原生壳里时换成 SteamworksPlatformPort（未来·壳内 steamworks.js 绑定）。
export class NullPlatformPort implements PlatformPort {
  isAvailable(): boolean { return false; }
  unlockAchievement(_id: string): void { /* no-op */ }
  clearAchievement(_id: string): void { /* no-op */ }
  setStat(_id: string, _value: number): void { /* no-op */ }
  getStat(_id: string): number { return 0; }
  uploadLeaderboard(_boardId: string, _score: number): void { /* no-op */ }
  setRichPresence(_key: string, _value: string): void { /* no-op */ }
  store(): void { /* no-op */ }
}
