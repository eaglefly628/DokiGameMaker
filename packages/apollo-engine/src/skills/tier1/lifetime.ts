import { defineCapability } from '@engine/core/define-capability.js';
import type { TimerDone, DestroyRequest } from '@engine/protocol/components.js';

// Tier 1 涌现（直接结算）：名为 "life" 的 Timer 到时 → DestroyRequest。
export const lifetimeCapability = defineCapability({
  id: 't1-lifetime',
  version: '1.0.0',

  describe: {
    name: 'lifetime',
    summary: '计时结束即销毁实体（timerId === "life" 的 TimerDone → DestroyRequest）。',
    semantic: ['tier1', 'lifecycle'],
    whenToUse: '给实体一个 id 为 "life" 的 Timer，到时自动销毁。子弹、特效、临时实体常用。',
    examples: ['子弹存活 N tick 后消失', '爆炸特效播完销毁', '临时拾取物超时消失'],
  },

  components: {
    provides: {},
    // BUG-003：改 reads（不再 consume）——TimerDone 由生产者 timer-advance 每拍自清，多消费者共读不抢占。
    reads: ['TimerDone'],
    writes: ['DestroyRequest'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'lifetime',
      reads: ['TimerDone'],
      writes: ['DestroyRequest'],
      consumes: [],
      execute(world) {
        for (const [id] of world.query('TimerDone')) {
          const done = world.getComponent<TimerDone>(id, 'TimerDone');
          if (!done || done.timerId !== 'life') continue;
          const req: DestroyRequest = { type: 'DestroyRequest', entityId: id };
          world.addComponent(id, req);
        }
      },
    },
  ],
});
