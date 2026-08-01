import type { AudioCtxLike } from './synth-audio.js';
export type { AudioCtxLike };

// SynthMusicPort —— 程序化「循环音序」后端（基础设施·sim 外，与 SynthAudioPort 同哲学）。
// 动机：SynthAudioPort 只放一次性 SFX；BGM 需要长循环、多音符的旋律。仓库零音频资产 → 仍用 Web Audio
// 振荡器实时合成，按一张**纯数据**音序(MusicTrack)循环演奏。track=数据（音符的拍点/时值/频率/波形），
// 引擎只是把这份数据循环解释成声音的固定调度器。无 AudioContext（headless/test）→ 全程静默 no-op。

// ── 音序数据（游戏层编写·一张音符表）──
export interface MusicNote {
  beat: number; // 起始拍（0 起；可小数）
  dur: number; // 时值（拍）
  freq: number; // 频率 Hz
  gain?: number; // 峰值音量 0~1（缺省 0.06·轻柔）
  wave?: 'sine' | 'square' | 'sawtooth' | 'triangle'; // 波形（缺省 triangle）
}
export interface MusicTrack {
  bpm: number; // 速度
  loopBeats: number; // 整段循环多少拍（到点无缝接下一圈）
  notes: MusicNote[]; // 音符序列
  gain?: number; // 整曲总音量系数（缺省 1）
}

const FLOOR = 0.0001;

export interface MusicOptions { ctx?: AudioCtxLike; volume?: number }

export class SynthMusicPort {
  private ctx: AudioCtxLike | null;
  private disabled = false;
  private volume: number;
  private track: MusicTrack | null = null;
  private bus: ReturnType<AudioCtxLike['createGain']> | null = null;
  private timer = 0; // 续圈调度计时器
  private nextLoopAt = 0; // 下一圈起始的 AudioContext 时间（秒）
  private gen = 0; // 代际：stop/play 自增，作废旧计时器回调

  constructor(opts: MusicOptions = {}) { this.ctx = opts.ctx ?? null; this.volume = opts.volume ?? 0.35; }

  private context(): AudioCtxLike | null {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume?.(); return this.ctx; }
    if (this.disabled) return null;
    const AC = (globalThis as { AudioContext?: new () => AudioCtxLike; webkitAudioContext?: new () => AudioCtxLike }).AudioContext
      ?? (globalThis as { webkitAudioContext?: new () => AudioCtxLike }).webkitAudioContext;
    if (!AC) { this.disabled = true; return null; }
    try { this.ctx = new AC(); } catch { this.disabled = true; return null; }
    return this.ctx;
  }

  get current(): MusicTrack | null { return this.track; }

  play(track: MusicTrack): void {
    const ctx = this.context();
    this.track = track;
    if (!ctx) return;
    this.stopVoices();
    const gen = ++this.gen;
    const bus = ctx.createGain();
    bus.gain.value = this.volume * (track.gain ?? 1);
    bus.connect(ctx.destination);
    this.bus = bus;
    const loopSec = (track.loopBeats / track.bpm) * 60;
    const base = ctx.currentTime + 0.08;
    // 预排两圈（抗计时器抖动·恒留 ≥1 圈缓冲）；其后每圈续排一圈。
    this.scheduleLoop(ctx, track, base);
    this.scheduleLoop(ctx, track, base + loopSec);
    this.nextLoopAt = base + 2 * loopSec;
    const tick = (): void => {
      if (gen !== this.gen || !this.ctx) return;
      this.scheduleLoop(this.ctx, track, this.nextLoopAt);
      this.nextLoopAt += loopSec;
    };
    const iv = (globalThis as { setInterval?: (fn: () => void, ms: number) => number }).setInterval;
    if (iv) this.timer = iv(tick, loopSec * 1000);
  }

  // 把一圈音符调度到 startSec 起（每音 osc→包络增益→bus）。
  private scheduleLoop(ctx: AudioCtxLike, track: MusicTrack, startSec: number): void {
    const spb = 60 / track.bpm; // 秒/拍
    for (const n of track.notes) {
      const t0 = startSec + n.beat * spb;
      const dur = Math.max(0.04, n.dur * spb);
      const peak = Math.max(FLOOR, (n.gain ?? 0.06) * (track.gain ?? 1));
      const g = ctx.createGain();
      const atk = Math.min(0.06, dur * 0.3), rel = Math.min(0.5, dur * 0.6);
      g.gain.setValueAtTime(FLOOR, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + atk);
      g.gain.setValueAtTime(peak, Math.max(t0 + atk, t0 + dur - rel));
      g.gain.exponentialRampToValueAtTime(FLOOR, t0 + dur);
      if (this.bus) g.connect(this.bus); else g.connect(ctx.destination);
      const o = ctx.createOscillator();
      o.type = n.wave ?? 'triangle';
      o.frequency.setValueAtTime(Math.max(1, n.freq), t0);
      o.connect(g);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    }
  }

  private stopVoices(): void {
    this.gen++; // 作废在飞的续圈回调
    const ci = (globalThis as { clearInterval?: (id: number) => void }).clearInterval;
    if (this.timer && ci) { ci(this.timer); this.timer = 0; }
    if (this.bus) { try { this.bus.disconnect(); } catch { /* 已断 */ } this.bus = null; }
  }

  stop(): void { this.stopVoices(); this.track = null; }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.bus && this.ctx) { const g = this.volume * (this.track?.gain ?? 1); this.bus.gain.setValueAtTime(g, this.ctx.currentTime); }
  }
  getVolume(): number { return this.volume; }
}
