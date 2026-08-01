import { describe, it, expect } from 'vitest';
import { SynthMusicPort, type AudioCtxLike, type MusicTrack } from './synth-music.js';

function fakeCtx() {
  const log = { osc: 0, gain: 0, started: 0, busVol: [] as number[] };
  const param = (sink?: number[]): { value: number; setValueAtTime: (v: number) => void; linearRampToValueAtTime: () => void; exponentialRampToValueAtTime: () => void } => ({
    value: 0, setValueAtTime: (v: number) => { sink?.push(v); }, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {},
  });
  const node = (): { connect: () => void; disconnect: () => void } => ({ connect: () => {}, disconnect: () => {} });
  const ctx: AudioCtxLike = {
    currentTime: 0, sampleRate: 48000, state: 'running', destination: node(),
    createGain: () => { log.gain++; return { ...node(), gain: log.gain === 1 ? param(log.busVol) : param() }; },
    createOscillator: () => { log.osc++; return { ...node(), type: 'triangle', frequency: param(), start: () => { log.started++; }, stop: () => {}, onended: null }; },
    createBufferSource: () => ({ ...node(), buffer: null, start: () => {}, stop: () => {}, onended: null }),
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
  };
  return { ctx, log };
}

const TRACK: MusicTrack = { bpm: 120, loopBeats: 4, gain: 1, notes: [{ beat: 0, dur: 1, freq: 440 }, { beat: 2, dur: 1, freq: 550 }] };

describe('SynthMusicPort — 数据驱动循环音序后端', () => {
  it('play 预排两圈 → 每音一个振荡器并起播（2 音 × 2 圈 = 4）', () => {
    const { ctx, log } = fakeCtx();
    const p = new SynthMusicPort({ ctx });
    p.play(TRACK);
    expect(log.osc).toBe(4);
    expect(log.started).toBe(4);
    p.stop();
  });

  it('current 反映在放的曲；stop 后清空', () => {
    const { ctx } = fakeCtx();
    const p = new SynthMusicPort({ ctx });
    p.play(TRACK);
    expect(p.current).toBe(TRACK);
    p.stop();
    expect(p.current).toBeNull();
  });

  it('setVolume 改 bus 增益并夹紧 0~1', () => {
    const { ctx, log } = fakeCtx();
    const p = new SynthMusicPort({ ctx, volume: 0.3 });
    p.play(TRACK);
    p.setVolume(0.5);
    expect(p.getVolume()).toBe(0.5);
    expect(log.busVol.at(-1)).toBeCloseTo(0.5, 5);
    p.setVolume(9); expect(p.getVolume()).toBe(1);
    p.setVolume(-1); expect(p.getVolume()).toBe(0);
    p.stop();
  });

  it('换曲：play 新曲先停旧（不残留）', () => {
    const { ctx } = fakeCtx();
    const p = new SynthMusicPort({ ctx });
    p.play(TRACK);
    const t2: MusicTrack = { bpm: 90, loopBeats: 2, notes: [{ beat: 0, dur: 1, freq: 330 }] };
    p.play(t2);
    expect(p.current).toBe(t2);
    p.stop();
  });

  it('无 AudioContext（headless）→ play/stop/setVolume 不抛错', () => {
    const p = new SynthMusicPort();
    expect(() => { p.play(TRACK); p.setVolume(0.4); p.stop(); }).not.toThrow();
    expect(p.current).toBeNull();
  });
});
