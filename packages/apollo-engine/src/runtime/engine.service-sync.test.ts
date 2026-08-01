import { describe, it, expect } from 'vitest';
import { Engine } from './engine.js';
import { AudioSync } from '@services/audio/index.js';
import type { AudioPort, PlayOptions } from '@services/audio/index.js';
import type { Sound } from '@engine/protocol/components.js';

// 规范运行时把「每帧服务」接进来（attachService）：以 AudioSync 为首个消费者，
// 证明 Sound 数据组件 → 服务 → AudioPort.play 整条接通（音频=数据，sim 外、不进 hash）。
// 这是音频/存档/平台服务层的统一宿主钩子的回归。
describe('Engine · 每帧服务宿主（attachService 把 AudioSync 接进规范运行时）', () => {
  const recPort = (): { port: AudioPort; played: string[]; stopped: string[] } => {
    const played: string[] = [], stopped: string[] = [];
    const port: AudioPort = {
      play: (id: string, _o?: PlayOptions) => { played.push(id); },
      stop: (id: string) => { stopped.push(id); },
      stopAll: () => {}, setMasterVolume: () => {},
    };
    return { port, played, stopped };
  };

  it('attachService(AudioSync) 即时同步：Sound 组件存在 → AudioPort.play 被以 clipId 调用', () => {
    const { port, played } = recPort();
    const eng = new Engine();
    eng.world.createEntity('bgm');
    eng.world.addComponent('bgm', { type: 'Sound', clipId: 'forest', loop: true } as Sound);
    eng.attachService(new AudioSync(port)); // attach 即 sync 一次（与 attachRenderer 同侧行为）
    expect(played).toEqual(['forest']); // 规范运行时托管音频：Sound 即响
  });

  it('移除 Sound 后再同步 → 停；切 clipId → 先停旧再播新（service 读世界 outcome-first）', () => {
    const { port, played, stopped } = recPort();
    const eng = new Engine();
    const audio = new AudioSync(port);
    eng.world.createEntity('bgm');
    eng.world.addComponent('bgm', { type: 'Sound', clipId: 'forest', loop: true } as Sound);
    eng.attachService(audio); // play forest
    // 切歌：原位改 clipId → 再同步
    eng.world.getComponent<Sound>('bgm', 'Sound')!.clipId = 'boss';
    audio.sync(eng.world);
    expect(stopped).toContain('forest');
    expect(played).toEqual(['forest', 'boss']);
    // 移除 Sound → 停 boss
    eng.world.removeComponent('bgm', 'Sound');
    audio.sync(eng.world);
    expect(stopped).toContain('boss');
  });
});
