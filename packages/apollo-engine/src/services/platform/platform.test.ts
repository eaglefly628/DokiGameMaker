import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Flag } from '@engine/protocol/components.js';
import { NullPlatformPort, AchievementSync } from './index.js';
import type { PlatformPort } from './index.js';

describe('platform · NullPlatformPort + 数据驱动成就桥 AchievementSync', () => {
  it('NullPlatformPort：不可用、读统计为 0、所有调用静默不抛', () => {
    const p = new NullPlatformPort();
    expect(p.isAvailable()).toBe(false);
    expect(p.getStat('wins')).toBe(0);
    expect(() => {
      p.unlockAchievement('a'); p.clearAchievement('a'); p.setStat('wins', 3);
      p.uploadLeaderboard('lb', 9); p.setRichPresence('k', 'v'); p.store();
    }).not.toThrow();
  });

  it('AchievementSync：Flag 置真 → 解锁对应成就一次（再 sync 不重复）', () => {
    const calls: string[] = [];
    const port: PlatformPort = {
      isAvailable: () => true,
      unlockAchievement: (id) => { calls.push(id); },
      clearAchievement: () => {}, setStat: () => {}, getStat: () => 0,
      uploadLeaderboard: () => {}, setRichPresence: () => {}, store: () => {},
    };
    const w = new World();
    w.createEntity('f'); w.addComponent('f', { type: 'Flag', id: 'first_win', active: false } as Flag);
    const sync = new AchievementSync(port, { first_win: 'ACH_FIRST_WIN' });

    sync.sync(w);
    expect(calls).toEqual([]); // 未达成 → 不解锁
    w.getComponent<Flag>('f', 'Flag')!.active = true;
    sync.sync(w); sync.sync(w); // 达成后多次 sync
    expect(calls).toEqual(['ACH_FIRST_WIN']); // 只解锁一次
  });

  it('AchievementSync：未在映射里的 Flag 不触发', () => {
    const calls: string[] = [];
    const port: PlatformPort = {
      isAvailable: () => true, unlockAchievement: (id) => { calls.push(id); },
      clearAchievement: () => {}, setStat: () => {}, getStat: () => 0,
      uploadLeaderboard: () => {}, setRichPresence: () => {}, store: () => {},
    };
    const w = new World();
    w.createEntity('f'); w.addComponent('f', { type: 'Flag', id: 'unrelated', active: true } as Flag);
    new AchievementSync(port, { first_win: 'ACH_FIRST_WIN' }).sync(w);
    expect(calls).toEqual([]);
  });
});
