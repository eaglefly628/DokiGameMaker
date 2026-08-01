import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { PlayedHand, Flag, InputQueue, RawInputData } from '@engine/protocol/components.js';
import { cardPlayCapability, decodeCard, encodeCard } from './card-play.js';

// 牌码：suit*100+rank。
const code = (suit: number, rank: number) => suit * 100 + rank;

describe('card-play · 牌码编解码', () => {
  it('roundtrip：编码→解码不变', () => {
    expect(decodeCard(encodeCard({ suit: 2, rank: 13 }))).toEqual({ suit: 2, rank: 13 });
    expect(encodeCard({ suit: 1, rank: 2 })).toBe(102);
    expect(decodeCard(213)).toEqual({ suit: 2, rank: 13 });
  });
});

// 搭一个双玩家牌桌世界（仅 card-play 系统）。
function loadCoop(actions: RawInputData[]): World {
  const w = new World();
  for (const s of cardPlayCapability.systems) w.addSystem(s);
  for (const p of ['p1', 'p2']) {
    w.createEntity(`table_${p}`);
    w.addComponent(`table_${p}`, { type: 'PlayedHand', owner: p, cards: [] } as PlayedHand);
    w.createEntity(`flag_${p}`);
    w.addComponent(`flag_${p}`, { type: 'Flag', id: p, active: false } as Flag);
  }
  w.createEntity('global-input');
  w.addComponent('global-input', { type: 'InputQueue', actions } as InputQueue);
  return w;
}
const hand = (w: World, p: string) => w.getComponent<PlayedHand>(`table_${p}`, 'PlayedHand')!.cards;
const flag = (w: World, p: string) => w.getComponent<Flag>(`flag_${p}`, 'Flag')!.active;

describe('card-play · 按 owner 路由出牌', () => {
  it('p1 出牌 → 只填 p1 的 PlayedHand + 置 p1 scoring flag；p2 不受影响', () => {
    const w = loadCoop([{ source: 'p1', key: 'play', values: [code(1, 2), code(1, 5)] }]);
    w.tick();
    expect(hand(w, 'p1')).toEqual([{ suit: 1, rank: 2 }, { suit: 1, rank: 5 }]);
    expect(flag(w, 'p1')).toBe(true);
    expect(hand(w, 'p2')).toEqual([]);
    expect(flag(w, 'p2')).toBe(false);
  });

  it('两玩家各出各的（多人核心：互不干扰）', () => {
    const w = loadCoop([
      { source: 'p1', key: 'play', values: [code(0, 14)] },
      { source: 'p2', key: 'play', values: [code(3, 7), code(3, 8)] },
    ]);
    w.tick();
    expect(hand(w, 'p1')).toEqual([{ suit: 0, rank: 14 }]);
    expect(hand(w, 'p2')).toEqual([{ suit: 3, rank: 7 }, { suit: 3, rank: 8 }]);
    expect(flag(w, 'p1')).toBe(true);
    expect(flag(w, 'p2')).toBe(true);
  });

  it('reset-then-apply：上拍出过、本拍没出 → 清空 cards + flag 灭（1 拍脉冲）', () => {
    const w = loadCoop([{ source: 'p1', key: 'play', values: [code(1, 2)] }]);
    w.tick();
    expect(flag(w, 'p1')).toBe(true);
    // 下一拍无 play 动作（覆写 InputQueue 为空）。
    w.getComponent<InputQueue>('global-input', 'InputQueue')!.actions = [];
    w.tick();
    expect(hand(w, 'p1')).toEqual([]);
    expect(flag(w, 'p1')).toBe(false);
  });

  it('非 play 动作不影响出牌路由', () => {
    const w = loadCoop([{ source: 'p1', key: 'click', x: 10, y: 20 }]);
    w.tick();
    expect(hand(w, 'p1')).toEqual([]);
    expect(flag(w, 'p1')).toBe(false);
  });
});
