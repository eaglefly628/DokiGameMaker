import { defineCapability } from '@engine/core/define-capability.js';
import type { Sound } from '@engine/protocol/components.js';

export type { Sound };

export const soundCapability = defineCapability({
  id: 'l4-sound',
  version: '1.0.0',

  describe: {
    name: 'sound',
    summary: '播放什么声音？',
    semantic: ['render', 'audio'],
    whenToUse: '需要音效或背景音乐时。clipId 指向音频资源，volume 0~1，loop 是否循环。表现层读取并播放。',
    examples: ['跳跃音效：clipId="jump", loop=false', '背景音乐：clipId="bgm", loop=true', '脚步：volume=0.3'],
  },

  components: {
    provides: {
      Sound: {
        category: 'render',
        describe: '音频播放指令，表现层读取播放。',
        fields: {
          clipId: { type: 'assetKey', assetType: 'sound', describe: '音频资源键（须在资产清单中，加载期硬校验）' },
          volume: { type: 'number', describe: '音量 0~1' },
          loop: { type: 'boolean', describe: '是否循环' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    clipId: { type: 'string', default: '', describe: '音频键', question: '播放哪个音频？', ui: { control: 'input' } },
    volume: { type: 'number', default: 1, describe: '音量', question: '音量（0~1）？', ui: { control: 'slider', min: 0, max: 1, step: 0.01 } },
    loop: { type: 'boolean', default: false, describe: '是否循环', question: '是否循环播放？', ui: { control: 'toggle' } },
  },

  systems: [],
});
