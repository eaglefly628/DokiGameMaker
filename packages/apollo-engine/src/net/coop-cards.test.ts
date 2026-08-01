import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { LockstepSession } from './lockstep.js';
import type { Command } from './commands.js';
import type { Resource, StringVar, Flag, PokerHand, PerCardScore, PlayedHand, Effect, EventWhen } from '@engine/protocol/components.js';
import { resourceCapability, flagCapability, stringVariableCapability } from '@atom-skills/index.js';
import { eventWhenCapability, effectApplyCapability, cardPlayCapability, encodeCard } from '@skills/tier2/index.js';
import { pokerHandCapability, cardScoringCapability } from '@skills/tier3/index.js';

// ═══════════════════════════════════════════════════════════════
//  2 人 lockstep COOP 卡牌 —— 多人架构证明（纯数据装配 + 现成能力，零新玩法 system）。
//
//  证明三件事：
//   ① 卡牌计分链在 lockstep 下**确定性**：两 peer 各跑完整双玩家世界，收同一组命令 → 逐 tick **同 hash**
//      （若 card-scoring/poker-hand 漏进 Math.random/Date 等非确定，两 peer 会分叉 → 本测立刻抓到）。
//   ② **共享 Boss**：两玩家各自出牌伤害汇入同一个 boss_hp 资源（effect 全局按 id 路由）。
//   ③ **跨玩家共鸣 = 重组（REQ-016 结论）**：condition 读两份 handTypeVar(ht_p1/ht_p2) + event-when + effect
//      → "p1 同花 且 p2 顺子 → 额外暴击伤害"，**零新 Beat/Resonance 组件**。
//
//  出牌经 card-play 确定性输入接缝（命令 actions → 按 owner 填各玩家 PlayedHand），即 lockstep 正道。
//  「联机 = 加第二组带 owner 的牌桌实体 + 第二路命令」在此坐实。
// ═══════════════════════════════════════════════════════════════

const BASE_CHIPS: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, '11': 10, '12': 10, '13': 10, '14': 11 };
const RANKING = {
  'high-card': { chips: 5, mult: 1 }, 'pair': { chips: 10, mult: 2 }, 'three-of-a-kind': { chips: 30, mult: 3 },
  'straight': { chips: 30, mult: 4 }, 'flush': { chips: 35, mult: 4 },
};
const PLAYERS = ['p1', 'p2'] as const;
const BOSS_MAX = 10000;

// 一份完整双玩家 coop 世界（每个 peer/client 各跑一份相同的）。
function buildCoopWorld(): World {
  const w = new World();
  for (const cap of [resourceCapability, flagCapability, stringVariableCapability, cardPlayCapability, pokerHandCapability, cardScoringCapability, eventWhenCapability, effectApplyCapability]) {
    for (const s of cap.systems) w.addSystem(s);
  }
  // 共享 Boss 血。
  w.createEntity('boss');
  w.addComponent('boss', { type: 'Resource', id: 'boss_hp', current: BOSS_MAX, min: 0, max: BOSS_MAX } as Resource);

  for (const p of PLAYERS) {
    for (const r of [`chips_${p}`, `mult_${p}`, `dmg_${p}`]) {
      w.createEntity(`res_${r}`);
      w.addComponent(`res_${r}`, { type: 'Resource', id: r, current: 0, min: 0, max: 1_000_000_000 } as Resource);
    }
    w.createEntity(`ht_${p}`);
    w.addComponent(`ht_${p}`, { type: 'StringVar', id: `ht_${p}`, value: '' } as StringVar);
    w.createEntity(`flag_${p}`);
    w.addComponent(`flag_${p}`, { type: 'Flag', id: p, active: false } as Flag); // scoring 脉冲（card-play 置）
    // 牌桌：评估器 + 逐张 + 该玩家出牌区（owner 路由）。
    w.createEntity(`table_${p}`);
    w.addComponent(`table_${p}`, { type: 'PokerHand', rankingTable: RANKING, chipsResource: `chips_${p}`, multResource: `mult_${p}`, handTypeVar: `ht_${p}` } as PokerHand);
    w.addComponent(`table_${p}`, { type: 'PerCardScore', chipsResource: `chips_${p}`, baseChipsByRank: BASE_CHIPS } as PerCardScore);
    w.addComponent(`table_${p}`, { type: 'PlayedHand', owner: p, cards: [] } as PlayedHand);
    // 该玩家出牌 → score_<p> 信号（level，card-play 置 flag 一拍）。
    w.createEntity(`gate_${p}`);
    w.addComponent(`gate_${p}`, { type: 'EventWhen', signal: `score_${p}`, when: { kind: 'flag', id: p }, mode: 'level', armed: false } as unknown as EventWhen);
    // dmg_<p> = chips_<p> × mult_<p>（资源×资源）→ boss_hp -= dmg_<p>（coeff -1）。
    w.createEntity(`eff_dmg_${p}`);
    w.addComponent(`eff_dmg_${p}`, { type: 'Effect', onSignal: `score_${p}`, kind: 'modify-resource', targetId: `dmg_${p}`, op: 'set', valueFrom: { resourceId: `chips_${p}`, timesResourceId: `mult_${p}` }, order: 1000 } as unknown as Effect);
    w.createEntity(`eff_boss_${p}`);
    w.addComponent(`eff_boss_${p}`, { type: 'Effect', onSignal: `score_${p}`, kind: 'modify-resource', targetId: 'boss_hp', op: 'add', valueFrom: { resourceId: `dmg_${p}`, coeff: -1 }, order: 1001 } as unknown as Effect);
  }

  // ── 跨玩家共鸣（REQ-016 重组）：p1 同花 且 p2 顺子 → boss 额外 -500（暴击）──
  w.createEntity('gate_reson');
  w.addComponent('gate_reson', {
    type: 'EventWhen', signal: 'resonance',
    when: { kind: 'and', of: [{ kind: 'string', id: 'ht_p1', equals: 'flush' }, { kind: 'string', id: 'ht_p2', equals: 'straight' }] },
    mode: 'level', armed: false,
  } as unknown as EventWhen);
  w.createEntity('eff_reson');
  w.addComponent('eff_reson', { type: 'Effect', onSignal: 'resonance', kind: 'modify-resource', targetId: 'boss_hp', op: 'add', value: -500, order: 2000 } as unknown as Effect);
  return w;
}

const res = (w: World, id: string): number => {
  for (const [eid] of w.query('Resource')) {
    const r = w.getComponent<Resource>(eid, 'Resource');
    if (r && r.id === id) return r.current;
  }
  return NaN;
};
// 出牌命令：source=玩家，values=牌码。
const play = (playerId: string, cards: [number, number][]): Command => ({
  playerId, tick: 0, move: { dx: 0, dy: 0 },
  actions: [{ source: playerId, key: 'play', values: cards.map(([s, r]) => encodeCard({ suit: s, rank: r })) }],
});

describe('net · 2 人 lockstep coop 卡牌（多人架构证明）', () => {
  it('① 确定性：两 peer 收同一组命令 → 同 hash（inSync）', () => {
    const session = new LockstepSession([{ id: 'A', world: buildCoopWorld() }, { id: 'B', world: buildCoopWorld() }]);
    const flushP1 = play('p1', [[1, 2], [1, 5], [1, 7], [1, 9], [1, 11]]); // ♥ 同花
    const straightP2 = play('p2', [[0, 5], [1, 6], [2, 7], [3, 8], [0, 9]]); // 混花色顺子
    const rep = session.advance([flushP1, straightP2]);
    expect(rep.inSync).toBe(true);
    expect(rep.hash).not.toBeNull();
  });

  it('② 共享 Boss 伤害汇合 + ③ 共鸣暴击涌现（数值）：p1同花272 + p2顺子260 + 共鸣500 → 10000→8968', () => {
    const w = buildCoopWorld();
    const session = new LockstepSession([{ id: 'A', world: w }]);
    session.advance([play('p1', [[1, 2], [1, 5], [1, 7], [1, 9], [1, 11]]), play('p2', [[0, 5], [1, 6], [2, 7], [3, 8], [0, 9]])]);
    expect(res(w, 'dmg_p1')).toBe(272);
    expect(res(w, 'dmg_p2')).toBe(260);
    expect(res(w, 'boss_hp')).toBe(BOSS_MAX - 272 - 260 - 500); // 8968（含共鸣 -500）
  });

  it('共鸣未命中：p1 同花 + p2 对子（非顺子）→ 无 500 暴击', () => {
    const w = buildCoopWorld();
    const session = new LockstepSession([{ id: 'A', world: w }]);
    // p2 对子 K,K + 垫牌（BUG-001：只两张 K 计分）→ (10+20)×2=60。
    session.advance([play('p1', [[1, 2], [1, 5], [1, 7], [1, 9], [1, 11]]), play('p2', [[0, 13], [3, 13], [0, 2], [1, 5], [2, 9]])]);
    expect(res(w, 'dmg_p2')).toBe(60);
    expect(res(w, 'boss_hp')).toBe(BOSS_MAX - 272 - 60); // 无共鸣 -500
  });

  it('两 peer 多拍始终 inSync（确定性持续成立）', () => {
    const session = new LockstepSession([{ id: 'A', world: buildCoopWorld() }, { id: 'B', world: buildCoopWorld() }]);
    const beats: Command[][] = [
      [play('p1', [[1, 2], [1, 5], [1, 7], [1, 9], [1, 11]]), play('p2', [[0, 5], [1, 6], [2, 7], [3, 8], [0, 9]])],
      [play('p1', [[0, 7], [1, 7], [2, 7], [0, 2], [3, 9]])], // p1 三条；p2 本拍不出
      [], // 空拍
    ];
    for (const cmds of beats) expect(session.advance(cmds).inSync).toBe(true);
  });
});
