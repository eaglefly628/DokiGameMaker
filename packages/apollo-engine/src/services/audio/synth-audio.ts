import type { AudioPort, PlayOptions } from './audio-port.js';

// SynthAudioPort —— 程序化合成音频后端（基础设施·sim 外，与 WebAudioPort 同实现 AudioPort 契约）。
// 动机：WebAudioPort 放的是「文件 url」，但仓库零音频资产；本后端不依赖任何资产文件，
// 用 Web Audio 振荡器/噪声**实时合成**短音效。每个 clipId 指向一段**纯数据**声音规格(SfxSpec)——
// 「最弱的 LLM 也能写出 {wave,freq,dur,gain}」，引擎只是把这份数据解释成声音的固定确定性解释器。
// 仅一次性 SFX（放牌咔哒、对决撞击、过关号角…）；BGM 长循环仍走 WebAudioPort（文件）。

// ── 声音规格（纯数据·游戏层编写）──
export interface SfxPartial {
  wave?: 'sine' | 'square' | 'sawtooth' | 'triangle'; // 振荡器波形（缺省 sine）
  noise?: boolean; // true → 白噪声源（咔哒/沙沙/破阵），忽略 wave/freq
  freq?: number; // 起始频率 Hz（缺省 440）
  freqTo?: number; // 终止频率 Hz（设了则在 dur 内滑音；>0）
  at?: number; // 相对起播偏移秒（缺省 0）——做琶音/和弦层叠
  dur?: number; // 持续秒（缺省 0.12）
  gain?: number; // 峰值音量 0~1（缺省 0.2）
  attack?: number; // 起音秒（缺省 0.005）
}
export interface SfxSpec {
  partials: SfxPartial[]; // 层叠/序列的多个发声体
  gain?: number; // 整段总音量系数（缺省 1）
}

// ── 解释器只用到的 Web Audio 子集（结构化类型：真 AudioContext 满足之，测试可注入假实现）──
interface ParamLike {
  value: number;
  setValueAtTime(v: number, t: number): void;
  linearRampToValueAtTime(v: number, t: number): void;
  exponentialRampToValueAtTime(v: number, t: number): void;
}
interface NodeLike {
  connect(dest: NodeLike): void;
  disconnect(): void;
}
interface GainLike extends NodeLike {
  gain: ParamLike;
}
interface SourceLike extends NodeLike {
  start(t?: number): void;
  stop(t?: number): void;
  onended: (() => void) | null;
}
interface OscLike extends SourceLike {
  type: string;
  frequency: ParamLike;
}
interface BufSrcLike extends SourceLike {
  buffer: BufferLike | null;
}
interface BufferLike {
  getChannelData(ch: number): Float32Array;
}
export interface AudioCtxLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: NodeLike;
  state: string;
  resume?(): Promise<void> | void;
  createGain(): GainLike;
  createOscillator(): OscLike;
  createBufferSource(): BufSrcLike;
  createBuffer(channels: number, length: number, sampleRate: number): BufferLike;
}

export interface SynthOptions {
  ctx?: AudioCtxLike; // 注入上下文（测试/复用）；缺省时首播懒创建浏览器 AudioContext
  master?: number; // 总音量 0~1（缺省 1）
}

const FLOOR = 0.0001; // 指数包络不能到 0，用极小值收尾

export class SynthAudioPort implements AudioPort {
  private ctx: AudioCtxLike | null;
  private disabled = false; // 无 AudioContext（headless/test）→ 永久静默 no-op
  private master: number;
  private readonly active = new Set<SourceLike>(); // 在响的源，供 stopAll

  constructor(private readonly specs: Readonly<Record<string, SfxSpec>>, opts: SynthOptions = {}) {
    this.ctx = opts.ctx ?? null;
    this.master = opts.master ?? 1;
  }

  // 懒创建/解锁 AudioContext（autoplay 策略：首声必由用户手势触发，故首播即可 resume）。
  private context(): AudioCtxLike | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume?.();
      return this.ctx;
    }
    if (this.disabled) return null;
    const AC = (globalThis as { AudioContext?: new () => AudioCtxLike; webkitAudioContext?: new () => AudioCtxLike }).AudioContext
      ?? (globalThis as { webkitAudioContext?: new () => AudioCtxLike }).webkitAudioContext;
    if (!AC) { this.disabled = true; return null; }
    try { this.ctx = new AC(); } catch { this.disabled = true; return null; }
    return this.ctx;
  }

  play(clipId: string, opts?: PlayOptions): void {
    const spec = this.specs[clipId];
    if (!spec) return; // 未知 clip → 无声（与 WebAudioPort 缺 url 同语义）
    const ctx = this.context();
    if (!ctx) return;
    const vol = (opts?.volume ?? 1) * (spec.gain ?? 1) * this.master;
    if (vol <= 0) return;
    const now = ctx.currentTime;
    for (const p of spec.partials) this.voice(ctx, p, now, vol);
  }

  // 把一个发声体数据解释成「源 → 包络增益 → destination」并调度起停。
  private voice(ctx: AudioCtxLike, p: SfxPartial, now: number, vol: number): void {
    const t0 = now + Math.max(0, p.at ?? 0);
    const dur = Math.max(0.01, p.dur ?? 0.12);
    const peak = Math.max(FLOOR, vol * (p.gain ?? 0.2));
    const attack = Math.min(Math.max(0.001, p.attack ?? 0.005), dur * 0.5);

    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(FLOOR, t0 + dur);
    g.connect(ctx.destination);

    let src: SourceLike;
    if (p.noise) {
      const len = Math.max(1, Math.ceil(dur * ctx.sampleRate));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let s = 0x2545f491; // 确定性 LCG 噪声（可审计·每次同 clip 同波形）
      for (let i = 0; i < data.length; i++) { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; data[i] = (s / 0x40000000) - 1; }
      const ns = ctx.createBufferSource();
      ns.buffer = buf;
      src = ns;
    } else {
      const o = ctx.createOscillator();
      o.type = p.wave ?? 'sine';
      o.frequency.setValueAtTime(Math.max(1, p.freq ?? 440), t0);
      if (p.freqTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, p.freqTo), t0 + dur);
      src = o;
    }
    src.connect(g);
    this.active.add(src);
    src.onended = (): void => { this.active.delete(src); src.disconnect(); g.disconnect(); };
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // 合成 SFX 皆短促一次性、无 clip 级追踪 → stop(单 clip) 无操作；用 stopAll 清场。
  stop(_clipId: string): void { /* one-shot SFX: 无单 clip 停止语义 */ }
  stopAll(): void {
    for (const s of [...this.active]) { try { s.stop(); } catch { /* 已停 */ } this.active.delete(s); }
  }
  setMasterVolume(v: number): void { this.master = Math.max(0, Math.min(1, v)); }
}
