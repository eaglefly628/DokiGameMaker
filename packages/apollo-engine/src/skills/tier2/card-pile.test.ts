import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { CardPile, PlayedHand, Flag, InputQueue, RawInputData } from '@engine/protocol/components.js';
import { cardPileCapability } from './card-pile.js';
import { keybindCapability, clickableCapability, eventWhenCapability } from './index.js';

// 牌码：suit*100+rank（这里多用 suit0 → 码=rank，便读）。
const w0 = (deck: number[], handSize: number, actions: RawInputData[] = []): World => {
  const w = new World();
  for (const s of cardPileCapability.systems) w.addSystem(s);
  w.createEntity('table');
  w.addComponent('table', { type: 'CardPile', owner: 'p1', deck: [...deck], hand: [], handSize } as CardPile);
  w.addComponent('table', { type: 'PlayedHand', owner: 'p1', cards: [] } as PlayedHand);
  w.createEntity('flag');
  w.addComponent('flag', { type: 'Flag', id: 'p1', active: false } as Flag);
  w.createEntity('global-input');
  w.addComponent('global-input', { type: 'InputQueue', actions } as InputQueue);
  return w;
};
const pile = (w: World) => w.getComponent<CardPile>('table', 'CardPile')!;
const played = (w: World) => w.getComponent<PlayedHand>('table', 'PlayedHand')!.cards;
const flag = (w: World) => w.getComponent<Flag>('flag', 'Flag')!.active;
const setInput = (w: World, actions: RawInputData[]) => { w.getComponent<InputQueue>('global-input', 'InputQueue')!.actions = actions; };

describe('card-pile · 发牌补手', () => {
  it('首 tick 抽牌补到 handSize；deck 相应减少', () => {
    const w = w0([2, 5, 7, 9, 11, 13, 3, 4], 3);
    w.tick();
    expect(pile(w).hand).toEqual([2, 5, 7]); // deck front 3 张
    expect(pile(w).deck).toEqual([9, 11, 13, 3, 4]);
  });
  it('deck 不足 handSize → 抽到空为止', () => {
    const w = w0([2, 5], 5);
    w.tick();
    expect(pile(w).hand).toEqual([2, 5]);
    expect(pile(w).deck).toEqual([]);
  });
});

describe('card-pile · 按下标出牌', () => {
  it('play 下标 → 选中牌进 PlayedHand + 从 hand 移除 + 补牌 + scoring Flag', () => {
    const w = w0([2, 5, 7, 9, 11, 13, 3, 4], 5); // tick1 hand=[2,5,7,9,11]
    w.tick();
    expect(pile(w).hand).toEqual([2, 5, 7, 9, 11]);
    setInput(w, [{ source: 'p1', key: 'play', values: [0, 2, 4] }]); // 出第 0/2/4 张 = 2,7,11
    w.tick();
    expect(played(w)).toEqual([{ suit: 0, rank: 2 }, { suit: 0, rank: 7 }, { suit: 0, rank: 11 }]);
    expect(flag(w)).toBe(true);
    // hand 移除 0/2/4 → 剩 [5,9]，再从 deck([13,3,4]) 补到 5 → [5,9,13,3,4]
    expect(pile(w).hand).toEqual([5, 9, 13, 3, 4]);
  });
  it('下标乱序/重复/越界都安全（升序去重过滤）', () => {
    const w = w0([2, 5, 7, 9, 11], 5);
    w.tick();
    setInput(w, [{ source: 'p1', key: 'play', values: [4, 0, 0, 99] }]); // 99 越界忽略，0 去重
    w.tick();
    expect(played(w)).toEqual([{ suit: 0, rank: 2 }, { suit: 0, rank: 11 }]); // 下标 0,4 升序
  });
});

describe('card-pile · 弃牌 / reset', () => {
  it('discard 下标 → 移除手牌 + 补牌；不出牌不计分（Flag 灭）', () => {
    const w = w0([2, 5, 7, 9, 11, 13], 5);
    w.tick(); // hand=[2,5,7,9,11], deck=[13]
    setInput(w, [{ source: 'p1', key: 'discard', values: [1] }]); // 弃第 1 张=5
    w.tick();
    expect(pile(w).hand).toEqual([2, 7, 9, 11, 13]); // 移除 5 → 补 13
    expect(played(w)).toEqual([]);
    expect(flag(w)).toBe(false);
  });
  it('reset-then-apply：出牌后下一拍无输入 → PlayedHand 清空 + Flag 灭', () => {
    const w = w0([2, 5, 7, 9, 11], 5);
    w.tick();
    setInput(w, [{ source: 'p1', key: 'play', values: [0] }]);
    w.tick();
    expect(flag(w)).toBe(true);
    setInput(w, []);
    w.tick();
    expect(played(w)).toEqual([]);
    expect(flag(w)).toBe(false);
  });
});

describe('card-pile · 确定性', () => {
  it('同 deck 同输入 → 同 hand/PlayedHand（lockstep 安全）', () => {
    const mk = () => {
      const w = w0([2, 5, 7, 9, 11, 13, 3, 4], 5);
      w.tick();
      setInput(w, [{ source: 'p1', key: 'play', values: [1, 3] }]);
      w.tick();
      return w;
    };
    const a = mk(), b = mk();
    expect(pile(a).hand).toEqual(pile(b).hand);
    expect(played(a)).toEqual(played(b));
  });
});

// ── REQ-F-040：商店三件套的引擎缺口 —— A1 牌码产物化 + A2 可负担门 ──
import type { Resource } from '@engine/protocol/components.js';
describe('card-pile · REQ-F-040 据码分发 + 可负担门', () => {
  const wShop = (deck: number[], gold: number): World => {
    const w = w0(deck, 1); // 商店语义：一次一张
    const p = w.getComponent<CardPile>('table', 'CardPile')!;
    p.playedCodeResource = 'bought_code';
    p.playCosts = [{ id: 'gold', amount: 3 }];
    w.createEntity('r_code');
    w.addComponent('r_code', { type: 'Resource', id: 'bought_code', current: 0, min: 0, max: 9999 } as Resource);
    w.createEntity('r_gold');
    w.addComponent('r_gold', { type: 'Resource', id: 'gold', current: gold, min: 0, max: 999 } as Resource);
    return w;
  };
  const rget = (w: World, e: string) => w.getComponent<Resource>(e, 'Resource')!.current;

  it('A1+A2 成交：扣金 + 牌码写进 Resource + 出牌区/补牌照常', () => {
    const w = wShop([207, 105, 313], 10);
    w.tick(); // hand=[207]
    setInput(w, [{ source: 'p1', key: 'play', values: [0] }]);
    w.tick();
    expect(rget(w, 'r_gold')).toBe(7); // 扣 3
    expect(rget(w, 'r_code')).toBe(207); // 码产物化 → banded EventWhen 可分发
    expect(flag(w)).toBe(true); // 成交脉冲
    expect(pile(w).hand).toEqual([105]); // 补牌
  });

  it('A2 拒单：付不起 → 牌不丢、不扣金、不写码、Flag 不脉冲（修"买不起也丢牌"时序硬伤）', () => {
    const w = wShop([207, 105], 2); // gold 2 < 3
    w.tick();
    setInput(w, [{ source: 'p1', key: 'play', values: [0] }]);
    w.tick();
    expect(pile(w).hand).toEqual([207]); // 牌还在
    expect(rget(w, 'r_gold')).toBe(2); // 分文未扣
    expect(rget(w, 'r_code')).toBe(0); // 码未写
    expect(flag(w)).toBe(false); // 不脉冲
    expect(played(w)).toEqual([]); // 出牌区空
  });

  it('零迁移：不设两字段 → 行为与旧 card-pile 完全一致（无 Resource 也不抛）', () => {
    const w = w0([2, 5, 7], 2);
    w.tick();
    setInput(w, [{ source: 'p1', key: 'play', values: [0] }]);
    expect(() => w.tick()).not.toThrow();
    expect(flag(w)).toBe(true);
  });

  it('定序守护：card-pile(RMW Resource/Flag) + flow/zone/group/self-rule/resource-apply 同场不抛（含潜伏 flow↔card-pile Flag 互锁）', async () => {
    const { flowCapability } = await import('../tier3/flow.js');
    const { zoneOccupancyCapability } = await import('./zone-occupancy.js');
    const { groupCountCapability } = await import('./group-count.js');
    const { selfRuleCapability } = await import('./self-rule.js');
    const { resourceCapability } = await import('@atom-skills/resource/index.js');
    const w = wShop([207], 10);
    for (const cap of [flowCapability, zoneOccupancyCapability, groupCountCapability, selfRuleCapability, resourceCapability]) {
      for (const s of cap.systems) w.addSystem(s as never);
    }
    expect(() => { for (let i = 0; i < 3; i++) w.tick(); }).not.toThrow(); // 修复前互 RMW 抛环
  });
});

// ── REQ-F-041(A)：refreshOnSignal 信号刷新桥（商店刷新/prep 自动换批） ──
import type { Signal } from '@engine/protocol/components.js';
describe('card-pile · REQ-F-041 信号刷新', () => {
  const wRef = (deck: number[]): World => {
    const w = w0(deck, 2);
    w.getComponent<CardPile>('table', 'CardPile')!.refreshOnSignal = 'shop_refresh';
    return w;
  };
  const fire = (w: World) => { w.createEntity('sig'); w.addComponent('sig', { type: 'Signal', name: 'shop_refresh', source: 'sig' } as Signal); };
  const unfire = (w: World) => w.destroyEntity('sig');

  it('信号在场 → 旧手牌回袋底 + 从 deck 补满（换一批；卡池守恒，REQ-F-054）', () => {
    const w = wRef([2, 5, 7, 9]);
    w.tick(); // hand=[2,5]
    expect(pile(w).hand).toEqual([2, 5]);
    fire(w);
    w.tick(); // [2,5] 回袋底 → deck=[7,9,2,5] → 补 [7,9]
    unfire(w);
    expect(pile(w).hand).toEqual([7, 9]);
    expect(pile(w).deck).toEqual([2, 5]); // 守恒：没买走的牌还在池里（旧语义=烧掉 → 连刷即空）
    fire(w);
    w.tick(); // 再刷：[7,9] 回底 → 补 [2,5]——无限轮换，永不枯竭
    unfire(w);
    expect(pile(w).hand).toEqual([2, 5]);
    expect(pile(w).deck).toEqual([7, 9]);
  });

  it('无信号 → 不刷新（缺省零迁移）；同拍 play 撞刷新 → 输入忽略（牌区空、Flag 不脉冲）', () => {
    const w = wRef([2, 5, 7, 9]);
    w.tick();
    w.tick(); // 无信号多拍 → hand 不变
    expect(pile(w).hand).toEqual([2, 5]);
    fire(w);
    setInput(w, [{ source: 'p1', key: 'play', values: [0] }]); // 刷新拍撞出牌
    w.tick();
    unfire(w);
    expect(pile(w).hand).toEqual([7, 9]); // 刷新生效
    expect(played(w)).toEqual([]); // play 被忽略
    expect(flag(w)).toBe(false); // 不脉冲
  });

  it('定序守护：card-pile(读 Signal) + event-when(读 Flag 写 Signal) 同场不抛（互锁已钉）', async () => {
    const { eventWhenCapability } = await import('./event-when.js');
    const w = wRef([2, 5, 7]);
    for (const s of eventWhenCapability.systems) w.addSystem(s as never);
    expect(() => { for (let i = 0; i < 3; i++) w.tick(); }).not.toThrow();
  });
});

// ── REQ-F-042：商店可见可点 —— 手牌镜像 + 信号出牌 ──
describe('card-pile · REQ-F-042 手牌镜像 + 信号出牌', () => {
  const wShop42 = (deck: number[]): World => {
    const w = w0(deck, 2);
    const p = w.getComponent<CardPile>('table', 'CardPile')!;
    p.handCodeResources = ['slot_1', 'slot_2'];
    p.playOnSignals = ['buy_slot_1', 'buy_slot_2'];
    for (const id of ['slot_1', 'slot_2']) {
      w.createEntity(`r_${id}`);
      w.addComponent(`r_${id}`, { type: 'Resource', id, current: 0, min: 0, max: 9999 } as Resource);
    }
    return w;
  };
  const slot = (w: World, id: string) => w.getComponent<Resource>(`r_${id}`, 'Resource')!.current;
  const sig42 = (w: World, name: string) => { w.createEntity(`s:${name}`); w.addComponent(`s:${name}`, { type: 'Signal', name, source: `s:${name}` } as Signal); };

  it('A 手牌镜像：补牌后逐槽写码；出牌后镜像同拍更新；空槽写 0', () => {
    const w = wShop42([207, 105, 313]);
    w.tick(); // hand=[207,105]
    expect(slot(w, 'slot_1')).toBe(207);
    expect(slot(w, 'slot_2')).toBe(105);
    setInput(w, [{ source: 'p1', key: 'play', values: [0] }]); // 买走槽 1
    w.tick(); // hand=[105,313]（补牌后）
    setInput(w, []);
    expect(slot(w, 'slot_1')).toBe(105);
    expect(slot(w, 'slot_2')).toBe(313);
    setInput(w, [{ source: 'p1', key: 'play', values: [0, 1] }]); // 清空且 deck 已尽
    w.tick();
    expect(slot(w, 'slot_1')).toBe(0); // 空槽 0
    expect(slot(w, 'slot_2')).toBe(0);
  });

  it('B 信号出牌：buy_slot_2 在场 = play(1)；同拍双槽信号只取最低下标', () => {
    const w = wShop42([207, 105, 313]);
    w.tick();
    sig42(w, 'buy_slot_2');
    w.tick(); // play(1)：买走 105
    w.destroyEntity('s:buy_slot_2');
    expect(played(w).length).toBe(1);
    expect(slot(w, 'slot_1')).toBe(207); // 槽 1 没动
    expect(slot(w, 'slot_2')).toBe(313); // 槽 2 补上新牌
    sig42(w, 'buy_slot_1'); sig42(w, 'buy_slot_2'); // 同拍双击
    w.tick();
    expect(played(w).length).toBe(1); // 只成交一单（最低下标）
  });
});

// ── REQ-F-048②：returnOnSignal 袋归还 ──
describe('card-pile · REQ-F-048② 袋归还', () => {
  it('信号在场 → 码资源插回 deck 底部并清零；码为 0 → 不动', () => {
    const w = w0([2, 5], 1);
    const p = w.getComponent<CardPile>('table', 'CardPile')!;
    p.returnOnSignal = 'card_sold';
    p.returnCodeResource = 'sold_code';
    w.createEntity('r_sold');
    w.addComponent('r_sold', { type: 'Resource', id: 'sold_code', current: 0, min: 0, max: 9999 } as Resource);
    w.tick(); // hand=[2], deck=[5]
    w.createEntity('s1'); w.addComponent('s1', { type: 'Signal', name: 'card_sold', source: 's1' } as Signal);
    w.tick(); // 码=0 → 不动
    expect(pile(w).deck).toEqual([5]);
    w.getComponent<Resource>('r_sold', 'Resource')!.current = 313; // 卖出链写码
    w.tick();
    expect(pile(w).deck).toEqual([5, 313]); // 袋底
    expect(w.getComponent<Resource>('r_sold', 'Resource')!.current).toBe(0); // 清零防重复归还
    w.destroyEntity('s1');
  });
});

describe('card-pile · 定序守护：与 keybind 共存不成环（2026-06-14）', () => {
  it('cardPile + keybind + event-when + clickable 同场拓扑可排序（不抛环）', () => {
    // keybind 是 clickable 的非空间孪生（写 Signal + runsAfter event-when）；card-pile 读其 Signal。
    // 旧 cp.runsBefore 列了 clickable 漏了 keybind → cp↔keybind↔event-when 三元环。补 'keybind' 破环。
    const w = new World();
    for (const c of [eventWhenCapability, clickableCapability, keybindCapability, cardPileCapability]) {
      for (const s of c.systems) w.addSystem(s);
    }
    expect(() => w.tick()).not.toThrow(); // 成环会在拓扑排序时抛 "Circular dependency"
  });
});
