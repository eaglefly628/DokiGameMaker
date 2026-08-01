import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { InputQueue, PlayedHand, Flag, Card } from '@engine/protocol/components.js';
import { findByComponentId } from '@engine/core/query.js';

// ═══════════════════════════════════════════════════════════════
//  card-play —— 卡牌游戏的「出牌」确定性输入接缝（REQ-016/017 的唯一引擎缺口）。
//
//  问题：要 lockstep 联机，"某玩家这拍出哪几张牌"必须经**确定性命令流**注入，而非 UI 直接写 PlayedHand。
//  现有输入层（applyRawActions）把命令的 actions 落进单例 InputQueue.actions（{source,key,values?}）。
//  card-play 读它，把每个 `{key:'play', source, values}` 路由到 owner===source 的牌桌 PlayedHand。
//
//  分工（严守 manifesto：只补"输入路由"这一确定性接缝，不碰算分/回合）：
//    - 牌码编码 = 纯数据：`values:[suit*100+rank,…]`（弱 LLM 可产；如 ♦K=2*100+13=213）。
//    - 出牌后算分 = poker-eval/card-scoring/effect（现成）；回合流程 = State+condition（装配层）。
//  reset-then-apply（仿 applyMovement 清速度）：每 tick 先把所有带 owner 的 PlayedHand 清空、对应
//  scoring Flag 置否；再按本 tick 的 play 动作填 → 没出牌的玩家自然 cards=[]、flag=false（1 拍脉冲）。
//  确定性：纯整数解码 + 按 owner 路由，无浮点、无遍历序依赖（各 PlayedHand 独立写自己 owner 的输入）。
//
//  多人即"加一组带 owner 的牌桌实体 + 第二路命令"：同一 card-play 系统按 owner 各填各的，互不干扰。
// ═══════════════════════════════════════════════════════════════

const PLAY_KEY = 'play';

// 牌码 → 引擎牌：suit*100+rank（rank 2..14，suit 0..3）。
export function decodeCard(code: number): Card {
  return { suit: Math.floor(code / 100), rank: code % 100 };
}
// 引擎牌 → 牌码（装配/输入侧编码用）。
export function encodeCard(c: Card): number {
  return c.suit * 100 + c.rank;
}

export const cardPlayCapability = defineCapability({
  id: 't2-card-play',
  version: '1.0.0',

  describe: {
    name: 'card-play',
    summary: '把命令流里的「出牌」输入（InputQueue 的 {key:"play",source,values}）按 owner 路由进各玩家牌桌的 PlayedHand + 置 scoring Flag。卡牌游戏的确定性/可 lockstep 出牌接缝。',
    semantic: ['tier2', 'input', 'cards', 'multiplayer'],
    whenToUse:
      '卡牌游戏要把"出哪几张牌"经确定性命令流注入（单人统一输入 / 多人 lockstep）时。给每个玩家牌桌挂 PlayedHand{owner:"p1"} + 一个 Flag{id:"p1"}（scoring 脉冲）；输入侧发 Command.actions=[{source:"p1",key:"play",values:[牌码…]}]。',
    examples: [
      'p1 出同花♥(2,5,7,9,J)：Command.actions=[{source:"p1",key:"play",values:[102,105,107,109,111]}] → PlayedHand(owner:p1).cards 填好 + Flag(p1)=true',
      '本拍 p1 没出牌：无该 source 的 play 动作 → PlayedHand(owner:p1).cards=[]、Flag(p1)=false（reset-then-apply）',
      '多人：两个牌桌 PlayedHand{owner:p1}/{owner:p2}，两路命令 → 同一 card-play 各填各的，lockstep 双端同 hash',
    ],
  },

  components: {
    provides: {},
    reads: ['InputQueue', 'PlayedHand', 'Flag'],
    writes: ['PlayedHand', 'Flag'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      // 早于 poker-eval（同 Update；card-play 写 PlayedHand、poker-eval 读 → 拓扑本就排前，显式 runsBefore 加固）。
      id: 'card-play-input',
      phase: SystemPhase.Update,
      runsBefore: ['poker-eval', 'card-score-pass'],
      reads: ['InputQueue', 'PlayedHand', 'Flag'],
      writes: ['PlayedHand', 'Flag'],
      consumes: [],
      execute(world: IWorld) {
        // 本 tick 各 source 的出牌牌码（key==='play'）。
        const plays = new Map<string, readonly number[]>();
        for (const [qid] of world.query('InputQueue')) {
          const q = world.getComponent<InputQueue>(qid, 'InputQueue');
          if (!q) continue;
          for (const a of q.actions) if (a.key === PLAY_KEY) plays.set(a.source, a.values ?? []);
        }
        // reset-then-apply：每个带 owner 的牌桌按本 tick 自己 owner 的输入填；没输入 → 清空 + flag 灭。
        for (const [eid] of world.query('PlayedHand')) {
          const ph = world.getComponent<PlayedHand>(eid, 'PlayedHand');
          if (!ph || !ph.owner) continue; // 无 owner = 单人/装配层直填，card-play 不碰
          const codes = plays.get(ph.owner);
          ph.cards = codes ? codes.map(decodeCard) : [];
          const fe = findByComponentId(world, 'Flag', 'id', ph.owner);
          if (fe) {
            const f = world.getComponent<Flag>(fe, 'Flag');
            if (f) f.active = codes !== undefined;
          }
        }
      },
    },
  ],
});
