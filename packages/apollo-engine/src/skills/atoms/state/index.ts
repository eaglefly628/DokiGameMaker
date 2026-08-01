import { defineCapability } from '@engine/core/define-capability.js';
import type { State, StateChanged } from '@engine/protocol/components.js';

export const stateCapability = defineCapability({
  id: 'j1-state',
  version: '1.0.0',

  describe: {
    name: 'state',
    summary: '实体在某个状态机的当前离散状态？',
    semantic: ['state', 'fsm'],
    whenToUse:
      '需要离散状态时：idle/walk/attack、对话/战斗。外部逻辑写 current 切换状态，state-sync 检测变化、发出 StateChanged 并更新 previous。一实体一 State（fsmId 标识），多状态机用多实体。',
    examples: ['行为：State{fsmId:"behavior", current:"idle"}', '动画：State{fsmId:"anim", current:"walk"}', '切到 attack → StateChanged{from:"idle", to:"attack"}'],
  },

  components: {
    provides: {
      State: {
        category: 'config',
        describe: '某状态机的当前/上一离散状态。外部写 current，本 skill 维护 previous 与切换事件。',
        fields: {
          fsmId: { type: 'string', describe: '状态机标识（支持多机并存）' },
          current: { type: 'string', describe: '当前状态名（外部写入以切换）' },
          previous: { type: 'string', describe: '上一状态名（由 state-sync 维护）' },
        },
      },
      StateChanged: {
        category: 'event',
        describe: '状态切换事件，在切换那一 tick 发出，由下游消费。',
        fields: {
          fsmId: { type: 'string', describe: '发生切换的状态机 id' },
          from: { type: 'string', describe: '切换前状态' },
          to: { type: 'string', describe: '切换后状态' },
        },
      },
    },
    reads: ['State'],
    writes: ['State', 'StateChanged'],
    consumes: [],
  },

  config: {
    fsmId: { type: 'string', default: 'default', describe: '状态机标识', question: '这个状态机叫什么？', ui: { control: 'input' } },
    current: { type: 'string', default: 'idle', describe: '初始状态', question: '初始状态是什么？', ui: { control: 'input' } },
  },

  systems: [
    {
      id: 'state-sync',
      reads: ['State'],
      writes: ['State', 'StateChanged'],
      consumes: [],
      execute(world) {
        for (const [entityId] of world.query('State')) {
          const st = world.getComponent<State>(entityId, 'State');
          if (!st) continue;
          if (st.current !== st.previous) {
            const changed: StateChanged = { type: 'StateChanged', fsmId: st.fsmId, from: st.previous, to: st.current };
            world.addComponent(entityId, changed);
            st.previous = st.current;
          }
        }
      },
    },
  ],
});
