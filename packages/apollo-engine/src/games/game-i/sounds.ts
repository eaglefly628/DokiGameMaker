// Game I · 声音测试 —— 数据目录 + Web Audio 音频引擎（自包含·无需音频文件）。
//
// 红线：SOUNDS / BGM 是「数据」（频率/波形/音序，弱模型能填）；makeSoundPlayer 是
// 「宿主运行时胶水」（Web Audio：主增益·静音·混音·StereoPanner 立体声·Convolver 混响·BGM 循环）。
// 游戏层只填数据 + 发信号；无 AudioContext（测试/SSR）时全部静默 no-op。

export interface SoundDef {
  id: string; label: string;
  type: OscillatorType; freq: number; freq2?: number; dur: number;
}

export const SOUNDS: SoundDef[] = [
  { id: 'click',   label: '🔘 点击', type: 'square',   freq: 800,  dur: 0.05 },
  { id: 'tick',    label: '⏱ 滴答',  type: 'sine',     freq: 1200, dur: 0.04 },
  { id: 'blip',    label: '💧 气泡', type: 'sine',     freq: 600,  dur: 0.07 },
  { id: 'success', label: '✅ 成功', type: 'sine',     freq: 523,  freq2: 784,  dur: 0.18 },
  { id: 'coin',    label: '🪙 金币', type: 'square',   freq: 988,  freq2: 1319, dur: 0.12 },
  { id: 'powerup', label: '⬆ 升级',  type: 'square',   freq: 392,  freq2: 1047, dur: 0.30 },
  { id: 'error',   label: '❌ 错误', type: 'sawtooth', freq: 220,  freq2: 130,  dur: 0.22 },
  { id: 'alert',   label: '🚨 警报', type: 'triangle', freq: 880,  freq2: 587,  dur: 0.40 },
];

export interface BgmDef { id: string; label: string; type: OscillatorType; tempo: number; notes: number[]; }
export const BGM: BgmDef[] = [
  // 0 = 休止符。tempo=BPM，按八分音符循环。
  { id: 'calm',  label: '🎵 舒缓', type: 'sine',   tempo: 92,  notes: [523, 659, 784, 659, 523, 440, 392, 0] },
  { id: 'march', label: '🥁 进行曲', type: 'square', tempo: 124, notes: [392, 392, 523, 392, 330, 392, 0, 294] },
];

/** 三和弦/混音预设（同时发声·演示多声道混合）。 */
export const CHORDS: Record<string, string[]> = {
  major: ['success', 'coin', 'powerup'],      // 三音齐发
  all: SOUNDS.map((s) => s.id),               // 八音齐发
};

type PlayOpts = { volume?: number; pan?: number };

/** 宿主音频引擎（Web Audio）。无 AudioContext 时全部静默。 */
export function makeSoundPlayer() {
  type AC = AudioContext;
  const Ctor: typeof AudioContext | undefined =
    typeof AudioContext !== 'undefined' ? AudioContext
    : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  let ctx: AC | null = null;
  let master: GainNode | null = null;
  let dry: GainNode | null = null;
  let wet: GainNode | null = null;     // 混响湿信号增益（0=关）
  let reverb: ConvolverNode | null = null;
  let bgmTimer: ReturnType<typeof setInterval> | null = null;

  // 确定性噪声（不用 Math.random·LCG）做混响脉冲响应。
  function makeImpulse(ac: AC, dur: number, decay: number): AudioBuffer {
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    let seed = 22222;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = rnd() * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function ensure(): AC | null {
    if (ctx) return ctx;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    dry = ctx.createGain(); dry.gain.value = 1; dry.connect(master);
    wet = ctx.createGain(); wet.gain.value = 0; wet.connect(master);
    reverb = ctx.createConvolver(); reverb.buffer = makeImpulse(ctx, 1.8, 2.2); reverb.connect(wet);
    return ctx;
  }

  function voice(def: SoundDef, opts: PlayOpts = {}): void {
    const ac = ensure();
    if (!ac || !dry || !reverb) return;
    if (ac.state === 'suspended') void ac.resume();
    try {
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    const panner = ac.createStereoPanner();
    osc.type = def.type;
    osc.frequency.setValueAtTime(def.freq, now);
    if (def.freq2 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, def.freq2), now + def.dur);
    panner.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0));
    const vol = Math.max(0.0001, Math.min(1, opts.volume ?? 0.7));
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + def.dur);
    osc.connect(g).connect(panner);
    panner.connect(dry);     // 干信号
    panner.connect(reverb);  // 混响发送（湿增益控制响度）
    osc.start(now);
    osc.stop(now + def.dur + 0.05);
    } catch { /* 单次发声异常不影响后续播放 */ }
  }

  return {
    play(id: string, opts?: PlayOpts): void { const d = SOUNDS.find((s) => s.id === id); if (d) voice(d, opts); },
    /** 混音：多个音同时发声（Web Audio 天然在 destination 混合）。 */
    playChord(ids: string[], opts?: PlayOpts): void { for (const id of ids) { const d = SOUNDS.find((s) => s.id === id); if (d) voice(d, opts); } },
    /** 主增益静音/恢复。 */
    setMuted(m: boolean): void { const ac = ensure(); if (ac && master) master.gain.value = m ? 0 : 1; },
    /** 混响湿信号开/关。 */
    setReverb(on: boolean): void { const ac = ensure(); if (ac && wet) wet.gain.value = on ? 0.6 : 0; },
    /** 背景乐：按音序循环（八分音符）。 */
    startBgm(id: string): void {
      this.stopBgm();
      const ac = ensure(); if (!ac) return;
      const track = BGM.find((b) => b.id === id); if (!track) return;
      const beatMs = (60 / track.tempo) * 1000 / 2;
      let i = 0;
      const step = (): void => {
        const f = track.notes[i % track.notes.length] ?? 0;
        if (f > 0) voice({ id: 'bgm', label: '', type: track.type, freq: f, dur: (beatMs / 1000) * 0.9 }, { volume: 0.22 });
        i++;
      };
      step();
      bgmTimer = setInterval(step, beatMs);
    },
    stopBgm(): void { if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; } },
    close(): void { this.stopBgm(); if (ctx) { void ctx.close(); ctx = null; } },
  };
}
