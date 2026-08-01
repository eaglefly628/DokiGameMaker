import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Sound } from '@engine/protocol/components.js';
import { NullAudioPort } from './null-audio.js';
import { AudioSync } from './audio-sync.js';

function addSound(w: World, eid: string, clipId: string, loop = false): void {
  w.createEntity(eid);
  w.addComponent(eid, { type: 'Sound', clipId, volume: 1, loop } as Sound);
}

describe('AudioSync — 消费 Sound 驱动 AudioPort', () => {
  it('新出现的 Sound → play；移除 → stop（diff 协调）', () => {
    const port = new NullAudioPort();
    const sync = new AudioSync(port);
    const w = new World();

    addSound(w, 'bgm', 'daily', true);
    sync.sync(w);
    expect(port.playing.has('daily')).toBe(true);

    // 再 sync 一次：同实体已在放 → 不重复 play
    sync.sync(w);
    expect(port.log.filter((l) => l.op === 'play' && l.clipId === 'daily')).toHaveLength(1);

    // 移除 Sound → stop
    w.destroyEntity('bgm');
    sync.sync(w);
    expect(port.playing.has('daily')).toBe(false);
  });

  it('多个 Sound 各自播放', () => {
    const port = new NullAudioPort();
    const sync = new AudioSync(port);
    const w = new World();
    addSound(w, 'a', 'bgm');
    addSound(w, 'b', 'sfx');
    sync.sync(w);
    expect(port.playing).toEqual(new Set(['bgm', 'sfx']));
  });

  it('切歌（组件原位改 clipId）：实体不销毁但 clipId 变 → 停旧播新', () => {
    const port = new NullAudioPort();
    const sync = new AudioSync(port);
    const w = new World();
    addSound(w, 'bgm', 'forest', true);
    sync.sync(w);
    expect(port.playing.has('forest')).toBe(true);

    // 走到 Boss 区：逻辑原位改 clipId（实体不销毁）。
    w.getComponent<Sound>('bgm', 'Sound')!.clipId = 'boss';
    sync.sync(w);
    expect(port.playing.has('forest')).toBe(false); // 旧的停了
    expect(port.playing.has('boss')).toBe(true); // 新的响了
  });

  it('金币问题（Q4）：同 clip 多实例按 EntityId 独立追踪；引用计数归零才 stop', () => {
    const port = new NullAudioPort();
    const sync = new AudioSync(port);
    const w = new World();
    addSound(w, 'coin1', 'coin');
    addSound(w, 'coin2', 'coin');
    sync.sync(w); // 两个实例 → play 两次
    expect(port.log.filter((l) => l.op === 'play' && l.clipId === 'coin')).toHaveLength(2);

    // 销毁一个 → 仍有一个在放，不该 stop
    w.destroyEntity('coin1');
    sync.sync(w);
    expect(port.log.filter((l) => l.op === 'stop' && l.clipId === 'coin')).toHaveLength(0);

    // 销毁最后一个 → 引用计数归零 → stop
    w.destroyEntity('coin2');
    sync.sync(w);
    expect(port.log.filter((l) => l.op === 'stop' && l.clipId === 'coin')).toHaveLength(1);
  });
});
