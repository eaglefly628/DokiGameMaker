// PlatformPort —— 平台服务端口（基础设施·确定性 sim 之外）。把 sim 产出的"达成了什么"
// （成就/统计/排行/富状态）投递给平台。**Steam 为首个目标适配器**；Epic/GOG/主机后续可加同名
// 适配器，契约不变。与 AudioPort/StoragePort 同哲学：sim 只持纯数据(Flag/Resource/State)，
// 本端口把数据"变成"真实平台调用。真实 Steamworks 适配器跑在原生壳(Electron/Tauri)里；
// web/dev/headless 用 NullPlatformPort 静默降级（游戏代码无需分支）。

export interface PlatformPort {
  /** 平台是否可用（无原生壳 / 未登录 → false；游戏据此降级，不报错）。 */
  isAvailable(): boolean;
  /** 解锁成就（幂等：已解锁再调无副作用，由适配器保证）。 */
  unlockAchievement(id: string): void;
  /** 清除成就（仅开发 / 调试用）。 */
  clearAchievement(id: string): void;
  /** 设置数值统计（如累计胜场 / 最高连胜）。 */
  setStat(id: string, value: number): void;
  /** 读统计当前值（不可用时返回 0）。 */
  getStat(id: string): number;
  /** 上传排行榜分数（fire-and-forget，适配器内部异步排队）。 */
  uploadLeaderboard(boardId: string, score: number): void;
  /** 设置富状态（好友列表显示"正在打第 3 关"等）。 */
  setRichPresence(key: string, value: string): void;
  /** 落盘统计 / 成就（批量提交；回合结束或退出时调一次）。 */
  store(): void;
}
