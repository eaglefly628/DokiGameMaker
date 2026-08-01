import type { VoiceEvent, VoiceParams, VoicePort } from './voice-port.js';

// TtsVoicePort —— 档① TTS 即时（v1 默认·零资产零 key）。
// 浏览器 speechSynthesis 选 ja-JP 音色朗读日文台词；per-char 参数 {lang,voiceHint,rate,pitch,volume} 差异化。
// 降级：无 speechSynthesis（headless/SSR）→ 永久静默 no-op（speak return false·不抛，同 SynthAudioPort 哲学）；
//       有 speechSynthesis 但暂无音色（getVoices 异步未就绪）→ **本次 return false 让调用方走兜底③**，
//       **不永久标记「无 ja 音色」**——每次 speak 重查 getVoices()，音色就绪后自动回升（裁决 ②·运行时惰性）；
//       音色就绪但确无匹配语言音色 → return false（真无 ja·回落③）。
// 同 char 新事件顶掉旧朗读（barge-in）：speak 时若仍在发声先 cancel() 再说新的（Web Speech 无 per-utterance cancel）。

// ── 解释器只用到的 Web Speech 子集（结构化类型：真 speechSynthesis / SpeechSynthesisUtterance 满足之·测试注入假实现）──
export interface SpeechVoiceLike {
  readonly name: string;
  readonly lang: string;
  readonly default?: boolean;
}
export interface SpeechUtteranceLike {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  voice: SpeechVoiceLike | null;
  onend: (() => void) | null;
  onerror: ((e?: unknown) => void) | null;
}
export interface SpeechSynthesisLike {
  speak(u: SpeechUtteranceLike): void;
  cancel(): void;
  getVoices(): ReadonlyArray<SpeechVoiceLike>;
  addEventListener?(type: 'voiceschanged', listener: () => void): void;
  removeEventListener?(type: 'voiceschanged', listener: () => void): void;
}

export interface TtsVoiceOptions {
  synth?: SpeechSynthesisLike; // 注入合成器（测试/复用）；缺省解析 globalThis.speechSynthesis
  makeUtterance?: (text: string) => SpeechUtteranceLike | null; // 注入 utterance 工厂；缺省 new SpeechSynthesisUtterance
  voices?: Readonly<Record<string, VoiceParams>>; // per-char 参数表（charId → 参数）；消费方一次登记（如三姨太）
  defaults?: VoiceParams; // 全局缺省参数（缺省 {lang:'ja-JP',rate:1,pitch:1,volume:1}）
}

// 合并优先级：defaults < perChar[charId] < evt.params（后者覆盖前者）。
function resolveParams(
  defaults: VoiceParams,
  perChar: VoiceParams | undefined,
  evtParams: VoiceParams | undefined,
): VoiceParams {
  return { ...defaults, ...(perChar ?? {}), ...(evtParams ?? {}) };
}

// 选音色：先 voiceHint 名称子串匹配，再按语言主子标签（ja-JP → 'ja'）匹配；都无 → null（回落兜底）。
function pickVoice(
  voices: ReadonlyArray<SpeechVoiceLike>,
  lang: string,
  hint: string | undefined,
): SpeechVoiceLike | null {
  if (hint) {
    const h = hint.toLowerCase();
    const byHint = voices.find((v) => v.name.toLowerCase().includes(h));
    if (byHint) return byHint;
  }
  const primary = (lang.split('-')[0] ?? lang).toLowerCase();
  const byLang = voices.find((v) => v.lang.toLowerCase().startsWith(primary));
  return byLang ?? null;
}

const DEFAULTS: VoiceParams = { lang: 'ja-JP', rate: 1, pitch: 1, volume: 1 };

export class TtsVoicePort implements VoicePort {
  private synth: SpeechSynthesisLike | null;
  private disabled = false; // 无 speechSynthesis（headless）→ 永久 no-op
  private readonly injectedMake: ((text: string) => SpeechUtteranceLike | null) | null;
  private readonly perChar: Readonly<Record<string, VoiceParams>>;
  private readonly defaults: VoiceParams;
  private active: SpeechUtteranceLike | null = null; // 在朗读的 utterance（供 barge-in）

  constructor(opts: TtsVoiceOptions = {}) {
    this.synth = opts.synth ?? null;
    this.injectedMake = opts.makeUtterance ?? null;
    this.perChar = opts.voices ?? {};
    this.defaults = opts.defaults ?? DEFAULTS;
  }

  // 惰性解析 speechSynthesis（headless 环境无 → 永久 disabled）。
  private resolveSynth(): SpeechSynthesisLike | null {
    if (this.synth) return this.synth;
    if (this.disabled) return null;
    const s = (globalThis as { speechSynthesis?: SpeechSynthesisLike }).speechSynthesis;
    if (!s) { this.disabled = true; return null; }
    this.synth = s;
    return s;
  }

  private newUtterance(text: string): SpeechUtteranceLike | null {
    if (this.injectedMake) return this.injectedMake(text);
    const Ctor = (globalThis as { SpeechSynthesisUtterance?: new (t: string) => SpeechUtteranceLike }).SpeechSynthesisUtterance;
    if (!Ctor) return null;
    try { return new Ctor(text); } catch { return null; }
  }

  speak(evt: VoiceEvent): boolean {
    const synth = this.resolveSynth();
    if (!synth) return false; // headless / 无 speechSynthesis
    if (!evt.text) return false; // 空文本无可朗读
    let voices: ReadonlyArray<SpeechVoiceLike>;
    try { voices = synth.getVoices(); } catch { return false; }
    // 首帧空表 = 音色未就绪（异步）→ 本次回落兜底③、不永久判定「无 ja」；下次 speak 自动重查回升（裁决 ②）。
    if (voices.length === 0) return false;
    const p = resolveParams(this.defaults, this.perChar[evt.charId], evt.params);
    const lang = p.lang ?? 'ja-JP';
    const voice = pickVoice(voices, lang, p.voiceHint);
    if (!voice) return false; // 确无匹配语言音色 → 回落兜底③（合成提示音+字幕）
    const u = this.newUtterance(evt.text);
    if (!u) return false; // 无 utterance 构造器 → 回落
    u.lang = lang;
    u.rate = p.rate ?? 1;
    u.pitch = p.pitch ?? 1;
    u.volume = p.volume ?? 1;
    u.voice = voice;
    if (this.active) { try { synth.cancel(); } catch { /* 已停 */ } this.active = null; } // barge-in：新事件顶掉旧朗读
    u.onend = (): void => { if (this.active === u) this.active = null; };
    u.onerror = u.onend;
    this.active = u;
    try { synth.speak(u); } catch { this.active = null; return false; }
    return true;
  }

  stop(): void {
    const s = this.synth;
    if (s) { try { s.cancel(); } catch { /* 已停 */ } }
    this.active = null;
  }

  dispose(): void {
    this.stop();
  }
}
