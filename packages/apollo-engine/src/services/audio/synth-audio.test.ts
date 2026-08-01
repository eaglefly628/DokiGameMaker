import { describe, it, expect } from 'vitest';
import { SynthAudioPort, type AudioCtxLike, type SfxSpec } from './synth-audio.js';

// ── 假 AudioContext：记录建了哪些节点 / 起停 / 包络目标值，供断言（解释器审计）──
function fakeCtx() {
  const log = { osc: 0, buf: 0, gain: 0, started: 0, stopped: 0, ramps: [] as number[], waves: [] as string[] };
  const param = (): { value: number; setValueAtTime: (v: number) => void; linearRampToValueAtTime: (v: number) => void; exponentialRampToValueAtTime: (v: number) => void } => ({
    value: 0, setValueAtTime: () => {}, linearRampToValueAtTime: (v: number) => { log.ramps.push(v); }, exponentialRampToValueAtTime: () => {},
  });
  const node = (): { connect: () => void; disconnect: () => void } => ({ connect: () => {}, disconnect: () => {} });
  const src = (): { connect: () => void; disconnect: () => void; start: () => void; stop: () => void; onended: (() => void) | null } => ({
    ...node(), start: () => { log.started++; }, stop: () => { log.stopped++; }, onended: null,
  });
  const ctx: AudioCtxLike = {
    currentTime: 0, sampleRate: 48000, state: 'running', destination: node(),
    createGain: () => { log.gain++; return { ...node(), gain: param() }; },
    createOscillator: () => { log.osc++; const o = { ...src(), type: 'sine', frequency: param() }; return Object.defineProperty(o, 'type', { get: () => 'sine', set: (w: string) => { log.waves.push(w); }, configurable: true }) as never; },
    createBufferSource: () => { log.buf++; return { ...src(), buffer: null }; },
    createBuffer: (_c, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
  return { ctx, log };
}

const SPECS: Record<string, SfxSpec> = {
  ding: { partials: [{ freq: 880, dur: 0.1 }, { freq: 1320, at: 0.04, dur: 0.1 }] },
  clack: { partials: [{ noise: true, dur: 0.06 }] },
  saw: { partials: [{ wave: 'sawtooth', freq: 200, freqTo: 60, dur: 0.2, gain: 0.5 }], gain: 0.5 },
};

describe('SynthAudioPort — 数据驱动的程序化音效后端', () => {
  it('实现 AudioPort 契约（play/stop/stopAll/setMasterVolume）', () => {
    const p = new SynthAudioPort(SPECS, { ctx: fakeCtx().ctx });
    for (const m of ['play', 'stop', 'stopAll', 'setMasterVolume'] as const) expect(typeof p[m]).toBe('function');
  });

  it('多发声体 spec → 每个 partial 建一个振荡器 + 增益并起播', () => {
    const { ctx, log } = fakeCtx();
    new SynthAudioPort(SPECS, { ctx }).play('ding');
    expect(log.osc).toBe(2); // 两个频率层
    expect(log.gain).toBe(2);
    expect(log.started).toBe(2);
    expect(log.stopped).toBe(2); // 调度了结束
  });

  it('noise=true → 走 BufferSource（白噪声）而非振荡器', () => {
    const { ctx, log } = fakeCtx();
    new SynthAudioPort(SPECS, { ctx }).play('clack');
    expect(log.buf).toBe(1);
    expect(log.osc).toBe(0);
  });

  it('wave 写入振荡器类型', () => {
    const { ctx, log } = fakeCtx();
    new SynthAudioPort(SPECS, { ctx }).play('saw');
    expect(log.waves).toContain('sawtooth');
  });

  it('未知 clipId → 静默（不建任何节点）', () => {
    const { ctx, log } = fakeCtx();
    new SynthAudioPort(SPECS, { ctx }).play('nope');
    expect(log.osc + log.buf + log.gain).toBe(0);
  });

  it('masterVolume=0 → 完全不发声（提前短路）', () => {
    const { ctx, log } = fakeCtx();
    const p = new SynthAudioPort(SPECS, { ctx, master: 0 });
    p.play('ding');
    expect(log.osc).toBe(0);
  });

  it('总音量缩放峰值包络（master 折半 → 斜坡目标减半）', () => {
    const full = fakeCtx(); new SynthAudioPort({ a: { partials: [{ gain: 0.4 }] } }, { ctx: full.ctx }).play('a');
    const half = fakeCtx(); new SynthAudioPort({ a: { partials: [{ gain: 0.4 }] } }, { ctx: half.ctx, master: 0.5 }).play('a');
    const peakFull = Math.max(...full.log.ramps), peakHalf = Math.max(...half.log.ramps);
    expect(peakHalf).toBeCloseTo(peakFull / 2, 5);
  });

  it('stopAll 停掉在响的源', () => {
    const { ctx, log } = fakeCtx();
    const p = new SynthAudioPort(SPECS, { ctx });
    p.play('ding');
    const before = log.stopped;
    p.stopAll();
    expect(log.stopped).toBeGreaterThan(before);
  });

  it('无 AudioContext（headless）→ play 不抛错、彻底 no-op', () => {
    const p = new SynthAudioPort(SPECS); // 不注入 ctx，node 环境无 AudioContext
    expect(() => { p.play('ding'); p.stop('ding'); p.stopAll(); p.setMasterVolume(0.5); }).not.toThrow();
  });
});
