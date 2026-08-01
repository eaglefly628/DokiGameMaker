// Game I · 声音测试核心：数据目录完整 + 播放器无 AudioContext 时全 API 静默不抛错。
import { describe, it, expect } from 'vitest';
import { SOUNDS, BGM, CHORDS, makeSoundPlayer } from './sounds.js';

describe('Game I 声音测试', () => {
  it('声音/BGM/和弦目录是纯数据（id 唯一·字段齐全·和弦引用真实音）', () => {
    const ids = SOUNDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SOUNDS) {
      expect(['sine', 'square', 'sawtooth', 'triangle']).toContain(s.type);
      expect(s.freq).toBeGreaterThan(0);
      expect(s.dur).toBeGreaterThan(0);
    }
    expect(BGM.length).toBeGreaterThanOrEqual(2);
    for (const b of BGM) { expect(b.tempo).toBeGreaterThan(0); expect(b.notes.length).toBeGreaterThan(0); }
    // 和弦预设引用的都是真实存在的音 id
    for (const list of Object.values(CHORDS)) for (const id of list) expect(ids).toContain(id);
  });

  it('播放器无 Web Audio（如测试环境）时全 API 静默不抛错', () => {
    const p = makeSoundPlayer();
    expect(() => {
      p.play('click', { volume: 0.7, pan: -0.5 });
      p.play('不存在');
      p.playChord(CHORDS['major']!, { pan: 1 });
      p.setMuted(true); p.setMuted(false);
      p.setReverb(true); p.setReverb(false);
      p.startBgm('calm'); p.stopBgm();
      p.close();
    }).not.toThrow();
  });
});
