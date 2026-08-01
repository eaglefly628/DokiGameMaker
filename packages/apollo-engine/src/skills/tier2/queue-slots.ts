import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { QueueSlots, QueueMember, Tag, Transform, Clickable } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  queue-slots —— 压实队列（REQ-POOL-ADVANCE 缺口；排队叫号/传送带补位/回收站队列通用原语）。
//
//  与 t2-tray 的关键区别（Lead 已裁：这是真缺口，不是 tray 能重组表达的）：
//    - tray：成员落**最小空槽**，队首成员被移走后老成员**不前移**（槽间可留空洞，TFT 换位语义）。
//    - queue-slots：每 tick 把当前存活成员**整体压实**成连续 0..N-1（队首/中间空出 → 全体前移，
//      槽间不留空隙）——排队场景要的是"消费队首→后排递补"而非"占坑制"。
//
//  成员判据：Tag 含齐 QueueSlots.memberTag 且带 Transform（同 tray 要求成员已有 Transform 才纳管）。
//  每拍：
//    ① 收集成员 + 稳定排序：按既有 QueueMember.index（无则排末尾，新成员）、再按实体 id 升序 tie-break——
//       全程不依赖 Array.sort 的引擎稳定性假设，比较器自身已保证确定性。
//    ② 压实重排：排好序后依次赋 index 0..N-1（写回 QueueMember；无则新增）——这一步就是"消费队首后
//       全体前移"的全部实现：被消费的成员已从 world 消失，不再出现在候选集里，排序结果自然紧凑。
//    ③ 钉位：Transform = originX/Y + index*gap（按 axis 展开），瞬时钉死（同 tray ④ 钉座）。
//       平滑上浮由游戏层 Tween 另外叠加，本能力只给"最终该在哪"的整数答案。
//    ④ 头部可点：index < headCount → 确保挂 Clickable{action}（无则加）；index >= headCount → 摘
//       Clickable（有则摘）——同 tray 增删 TraySeat 的先例，非破坏性（不动其余字段）。
//
//  定序：phase=Update；写 Transform 与 grid-move/motion-apply/tween 互为 RMW（本系统既读又写
//  Transform 定位其对象、它们也读写 Transform）→ runsBefore 显式删反向边，同 tray 纪律（成员一般
//  不挂 HexPos/Velocity，实际操作集不相交，纯粹为打破组件拓扑的伪环）。未声明 runsAfter drag-place——
//  queue-slots 不消费 Draggable/HexPos 语义，不像 tray 依赖"拖拽先落点、本拍收口"的顺序；队列成员的
//  产生/移除由游戏层数据链路另行接线（如 Signal 消费触发 DestroyRequest），与本系统解耦。
//  确定性：稳定排序（比较器自带 tie-break）+ 整数 index 运算，无随机无墙钟；capacity 当前版本
//  非强制上限（同 tray 已知豁口：真正的入队闸门在别处，本能力只管已在场成员怎么摆）。
// ═══════════════════════════════════════════════════════════════

function slotPos(q: QueueSlots, index: number): { x: number; y: number } {
  return q.axis === 'y'
    ? { x: q.originX, y: q.originY + index * q.gap }
    : { x: q.originX + index * q.gap, y: q.originY };
}

export const queueSlotsCapability = defineCapability({
  id: 't2-queue-slots',
  version: '1.0.0',

  describe: {
    name: 'queue-slots',
    summary: '压实队列：存活成员每 tick 重排成连续 0..N-1（消费队首/中间任意一个即全体前移，槽间不留空）；前 headCount 个自动挂 Clickable。与 tray（占坑制、老成员不前移）互补。',
    semantic: ['tier2', 'layout', 'slots', 'queue'],
    whenToUse:
      '需要「排队等叫号/传送带补位」——消费队首（或队中任意成员消失）后，后面所有成员整体前移补位，而不是留空洞时用。放一个 QueueSlots{originX,originY,gap,headCount,memberTag,action}，成员实体带对应 Tag+Transform；头部成员自动可点，点击产出的信号由游戏层另接销毁/领取逻辑。与 tray 的选择依据：占坑不前移=tray，消费即整体递补=本能力。',
    examples: [
      "叫号队列：QueueSlots{originX:0, originY:120, gap:48, headCount:1, memberTag:TICKET, action:'serve_next'}——只有队首可点，点掉后全体前移",
      "回收站候选池：QueueSlots{originX:-90, originY:200, gap:36, headCount:3, memberTag:CANDIDATE, action:'pick'}——前三个可点选，选走一个后全体前移补位",
    ],
  },

  components: {
    provides: {
      QueueSlots: {
        category: 'config',
        describe: '压实队列声明：槽排几何（originX/originY/gap/axis）+ 成员掩码 memberTag（含齐）+ 前 headCount 个可点 + 点击信号 action。',
        fields: {
          memberTag: { type: 'number', describe: '成员 Tag 掩码（含齐语义，同 Tray.requiredTag）' },
          capacity: { type: 'number', describe: '声明槽数（当前非强制上限；入队闸门在别处）' },
          headCount: { type: 'number', describe: '压实后 index < headCount 的成员挂 Clickable，其余摘' },
          originX: { type: 'number', describe: '0 号槽世界 x' },
          originY: { type: 'number', describe: '0 号槽世界 y' },
          gap: { type: 'number', describe: '槽距 px' },
          axis: { type: 'string', describe: "排布轴向 'x'|'y'（缺省 'x'）" },
          action: { type: 'string', describe: '头部成员 Clickable.action' },
        },
      },
      QueueMember: {
        category: 'marker',
        describe: '运行时压实后的槽下标（系统维护，POD 进 snapshot）。',
        fields: { index: { type: 'number', describe: '槽下标（0 起，每 tick 重算）' } },
      },
    },
    reads: ['QueueSlots', 'QueueMember', 'Tag', 'Transform', 'Clickable'],
    writes: ['QueueMember', 'Transform', 'Clickable'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'queue-slots',
      phase: SystemPhase.Update,
      // 写 Transform 与 grid-move/motion-apply/tween 互为 RMW（同 tray 纪律）→ runsBefore 删反向边。
      runsBefore: ['grid-move', 'motion-apply', 'tween'],
      reads: ['QueueSlots', 'QueueMember', 'Tag', 'Transform', 'Clickable'],
      writes: ['QueueMember', 'Transform', 'Clickable'],
      consumes: [],
      execute(world: IWorld) {
        const queues: QueueSlots[] = [];
        for (const [qid] of world.query('QueueSlots')) {
          const q = world.getComponent<QueueSlots>(qid, 'QueueSlots');
          if (q && q.gap > 0 && q.capacity > 0) queues.push(q);
        }
        if (queues.length === 0) return;

        for (const q of queues) {
          // ① 收集成员（Tag 含齐 memberTag ∧ 已有 Transform）+ 既有 index（新成员=undefined）。
          const members: { eid: string; idx: number | undefined }[] = [];
          for (const [eid] of world.query('Tag')) {
            const tg = world.getComponent<Tag>(eid, 'Tag')!;
            if ((tg.flags & q.memberTag) !== q.memberTag) continue;
            if (!world.getComponent<Transform>(eid, 'Transform')) continue;
            const qm = world.getComponent<QueueMember>(eid, 'QueueMember');
            members.push({ eid, idx: qm?.index });
          }
          if (members.length === 0) continue;

          // 稳定排序：既有 index 优先（保序）、新成员（undefined）排末尾、id 升序 tie-break（确定）。
          members.sort((a, b) => {
            const ai = a.idx ?? Number.POSITIVE_INFINITY;
            const bi = b.idx ?? Number.POSITIVE_INFINITY;
            if (ai !== bi) return ai - bi;
            return a.eid < b.eid ? -1 : a.eid > b.eid ? 1 : 0;
          });

          // ②③④ 压实重排 + 钉位 + 头部可点。
          for (let i = 0; i < members.length; i++) {
            const { eid } = members[i];

            const qm = world.getComponent<QueueMember>(eid, 'QueueMember');
            if (qm) qm.index = i;
            else world.addComponent(eid, { type: 'QueueMember', index: i } as QueueMember);

            const p = slotPos(q, i);
            const tr = world.getComponent<Transform>(eid, 'Transform')!;
            tr.x = p.x;
            tr.y = p.y;

            if (i < q.headCount) {
              if (!world.hasComponent(eid, 'Clickable')) {
                world.addComponent(eid, { type: 'Clickable', action: q.action } as Clickable);
              }
            } else if (world.hasComponent(eid, 'Clickable')) {
              world.removeComponent(eid, 'Clickable');
            }
          }
        }
      },
    },
  ],
});
