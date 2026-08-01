// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockSteamBridge, resetMockSteam, createPlatformPort,
  SteamworksPlatformPort, NullPlatformPort, type MockSteamEvent,
} from './index.js';

beforeEach(() => { resetMockSteam(); localStorage.clear(); });

describe('platform · MockSteamBridge（本地假 Steam·同真桥契约）', () => {
  it('available + 假玩家名 + appId；解锁幂等并发事件', () => {
    const evt: MockSteamEvent[] = [];
    const b = createMockSteamBridge({ toast: false, log: false, onEvent: (e) => evt.push(e) });
    expect(b.available).toBe(true);
    expect(typeof b.name).toBe('string');
    expect(b.appId).toBe(480);
    b.unlockAchievement!('ACH_A');
    b.unlockAchievement!('ACH_A'); // 重复 → 幂等不再发事件
    expect(evt.filter((e) => e.kind === 'unlock')).toEqual([{ kind: 'unlock', id: 'ACH_A' }]);
  });

  it('统计读写 + 排行榜高分在前（真验降序·去掉 mock 排序即红）', () => {
    const evt: MockSteamEvent[] = [];
    const b = createMockSteamBridge({ toast: false, log: false, onEvent: (e) => evt.push(e) });
    b.setStat!('wins', 5);
    expect(b.getStat!('wins')).toBe(5);
    expect(b.getStat!('missing')).toBe(0);
    b.uploadLeaderboard!('lb', 30); b.uploadLeaderboard!('lb', 90); b.uploadLeaderboard!('lb', 60);
    // 经 onEvent 观测最新榜单快照：三个乱序分数上传后必须按高→低排列（被测行为=降序）。
    const boards = evt.filter((e): e is Extract<MockSteamEvent, { kind: 'leaderboard' }> => e.kind === 'leaderboard');
    const board = boards.at(-1)!.board;
    expect(board).toEqual([90, 60, 30]);                          // 高分在前
    for (let i = 1; i < board.length; i++) {                      // 且严格非递增（冗余保险）
      expect(board[i]).toBeLessThanOrEqual(board[i - 1]);
    }
  });

  it('localStorage 持久化：新桥能读回上一桥解锁的成就', () => {
    createMockSteamBridge({ toast: false, log: false }).unlockAchievement!('ACH_PERSIST');
    const evt: MockSteamEvent[] = [];
    const b2 = createMockSteamBridge({ toast: false, log: false, onEvent: (e) => evt.push(e) });
    b2.unlockAchievement!('ACH_PERSIST'); // 已在持久化态里 → 幂等、无事件
    expect(evt).toEqual([]);
  });

  it('解锁弹 Steam 风格 toast 到 document', () => {
    const b = createMockSteamBridge({ log: false }); // toast 默认开
    b.unlockAchievement!('ACH_TOAST');
    expect(document.querySelector('.apollo-steam-toast')).not.toBeNull();
  });
});

describe('platform · 工厂选假 Steam', () => {
  it('opts.mock=true 且无真桥 → SteamworksPlatformPort（包假桥），可用', () => {
    const p = createPlatformPort(undefined, { mock: true });
    expect(p).toBeInstanceOf(SteamworksPlatformPort);
    expect(p.isAvailable()).toBe(true);
  });
  it('localStorage 开关 apollo:steam:mock=1 → 启用假 Steam', () => {
    localStorage.setItem('apollo:steam:mock', '1');
    expect(createPlatformPort(undefined)).toBeInstanceOf(SteamworksPlatformPort);
  });
  it('开关关闭、无桥 → NullPlatformPort', () => {
    expect(createPlatformPort(undefined)).toBeInstanceOf(NullPlatformPort);
  });
});
