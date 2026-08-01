import type { IWorld } from '@engine/core/types.js';
import type { Flag } from '@engine/protocol/components.js';
import type { PlatformPort } from './platform-port.js';

// AchievementSync —— 数据驱动「成就」桥（每帧服务·sim 外·outcome-first，挂 Engine.attachService）。
// 成就规则 = 一份数据：Flag id → 成就 id 的映射。本服务读 sim 产出的 Flag，达成即经 PlatformPort 解锁一次。
// 游戏侧零平台代码：用现成 Condition→Event→Effect 把某 Flag 置真（"首胜"/"满级"/"无伤通关"…），
// 成就自动触发。与 AudioSync 同构（读 outcome → 驱动服务端口，不回灌、不进 hash）。
export class AchievementSync {
  private readonly unlocked = new Set<string>();
  constructor(
    private readonly port: PlatformPort,
    private readonly map: Readonly<Record<string, string>>, // flagId → achievementId
  ) {}

  sync(world: IWorld): void {
    for (const [e] of world.query('Flag')) {
      const f = world.getComponent<Flag>(e, 'Flag');
      if (!f) continue;
      const ach = this.map[f.id];
      if (ach && f.active && !this.unlocked.has(ach)) {
        this.unlocked.add(ach);
        this.port.unlockAchievement(ach); // 幂等 + 本地去重双保险
      }
    }
  }
}
