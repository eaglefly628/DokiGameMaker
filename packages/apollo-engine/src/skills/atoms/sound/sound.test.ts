import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { soundCapability } from './index.js';
import type { Sound } from '@engine/protocol/components.js';

describe('sound atom', () => {
  it('is a pure-data atom with no systems', () => {
    expect(soundCapability.systems).toHaveLength(0);
  });

  it('provides Sound with clipId/volume/loop', () => {
    const f = soundCapability.components.provides.Sound.fields;
    expect(f.clipId.type).toBe('assetKey'); // R9 增益 A：声明为资产 key，加载期对清单硬校验
    expect(f.volume.type).toBe('number');
    expect(f.loop.type).toBe('boolean');
  });

  it('stores and reads back', () => {
    const w = new World();
    w.createEntity('e');
    const s: Sound = { type: 'Sound', clipId: 'bgm', volume: 0.8, loop: true };
    w.addComponent('e', s);
    const got = w.getComponent<Sound>('e', 'Sound')!;
    expect(got.clipId).toBe('bgm');
    expect(got.loop).toBe(true);
  });

  it('defaults: full volume, no loop', () => {
    expect(soundCapability.config.volume.default).toBe(1);
    expect(soundCapability.config.loop.default).toBe(false);
  });
});
