// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACHIEVEMENTS, firstBootAchievement, createPlatformPort, resetMockSteam,
} from './index.js';

beforeEach(() => { resetMockSteam(); localStorage.clear(); });

describe('platform · 成就目录（数据）', () => {
  it('每个游戏目录 id 唯一、含一枚 *_FIRST_BOOT', () => {
    for (const [game, defs] of Object.entries(ACHIEVEMENTS)) {
      const ids = defs.map((d) => d.id);
      expect(new Set(ids).size, `${game} id 应唯一`).toBe(ids.length);
      expect(firstBootAchievement(game), `${game} 应有首启成就`).toBeDefined();
    }
  });
  it('未知游戏 → firstBootAchievement undefined', () => {
    expect(firstBootAchievement('game-zzz')).toBeUndefined();
  });

  it('端到端：开假 Steam → 解锁首启成就 → 记入态并弹 toast（幂等真验·去掉守卫即红）', () => {
    document.body.innerHTML = '';                         // 清 DOM，toast 计数无跨测污染
    const port = createPlatformPort(undefined, { mock: true });
    const boot = firstBootAchievement('game-g')!;
    port.unlockAchievement(boot);
    port.store();
    expect(document.querySelectorAll('.apollo-steam-toast').length).toBe(1);  // 首次解锁 → 恰 1 个 toast
    // 同端口再解锁同一成就 → 幂等：不应再弹新 toast（旧断言只验 isAvailable 常量·从不验幂等）。
    port.unlockAchievement(boot);
    expect(document.querySelectorAll('.apollo-steam-toast').length).toBe(1);  // 仍 1 个 → 同端口幂等
    // 二次造端口（读同一持久化态）：首启成就已在持久态 → 解锁仍幂等，无新 toast。
    const port2 = createPlatformPort(undefined, { mock: true });
    expect(port2.isAvailable()).toBe(true);
    port2.unlockAchievement(boot);
    expect(document.querySelectorAll('.apollo-steam-toast').length).toBe(1);  // 仍 1 个 → 跨持久化幂等
  });
});
