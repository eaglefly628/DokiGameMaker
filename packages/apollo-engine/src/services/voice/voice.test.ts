import { describe, it, expect, vi } from 'vitest';
import {
  TtsVoicePort,
  SamplePackVoicePort,
  createVoiceChain,
  NullVoicePort,
  type SpeechSynthesisLike,
  type SpeechUtteranceLike,
  type SpeechVoiceLike,
  type VoicePort,
  type VoiceParams,
} from './index.js';

// ── 假 speechSynthesis（记 spoken / cancel 次数；voices 可变模拟异步就绪）──
function fakeUtterance(text: string): SpeechUtteranceLike {
  return { text, lang: '', rate: 1, pitch: 1, volume: 1, voice: null, onend: null, onerror: null };
}
function fakeSynth(voices: SpeechVoiceLike[]) {
  const state = { spoken: [] as SpeechUtteranceLike[], cancelled: 0 };
  const synth: SpeechSynthesisLike = {
    speak: (u) => { state.spoken.push(u); },
    cancel: () => { state.cancelled++; },
    getVoices: () => voices,
  };
  return { synth, state };
}
const JA: SpeechVoiceLike = { name: 'Kyoko', lang: 'ja-JP' };
const EN: SpeechVoiceLike = { name: 'Samantha', lang: 'en-US' };

// spec §0 三姨太 TTS 参数草案（凭证探针 fixture）
const THREE_WIVES: Record<string, VoiceParams> = {
  aya: { rate: 0.9, pitch: 0.95 }, // 绫·沉稳
  rise: { rate: 1.15, pitch: 1.1 }, // 莉世·泼辣
  sayo: { rate: 1.0, pitch: 1.25 }, // 小夜·娇憨
};

describe('TtsVoicePort — 档① TTS 合成', () => {
  it('headless（无注入·node 无 speechSynthesis）→ speak/stop/dispose 不抛、speak 返 false', () => {
    const port = new TtsVoicePort();
    expect(() => { port.stop(); port.dispose(); }).not.toThrow();
    expect(port.speak({ charId: 'aya', event: 'riichi', text: 'リーチ' })).toBe(false);
  });

  it('凭证探针：构造的 utterance 携带正确 TTS 参数（lang/rate/pitch/voice）——三姨太逐一断言', () => {
    for (const [charId, p] of Object.entries(THREE_WIVES)) {
      const { synth, state } = fakeSynth([EN, JA]);
      const port = new TtsVoicePort({ synth, makeUtterance: fakeUtterance, voices: THREE_WIVES });
      const ok = port.speak({ charId, event: 'riichi', text: 'リーチ！' });
      expect(ok).toBe(true);
      expect(state.spoken).toHaveLength(1);
      const u = state.spoken[0]!;
      expect(u.text).toBe('リーチ！');
      expect(u.lang).toBe('ja-JP'); // 缺省语言
      expect(u.rate).toBe(p.rate); // per-char 参数生效
      expect(u.pitch).toBe(p.pitch);
      expect(u.voice).toBe(JA); // 选中 ja 音色（非 en）
    }
  });

  it('event.params 覆盖 per-char 表（优先级最高）', () => {
    const { synth, state } = fakeSynth([JA]);
    const port = new TtsVoicePort({ synth, makeUtterance: fakeUtterance, voices: THREE_WIVES });
    port.speak({ charId: 'aya', event: 'ron', text: 'ロン', params: { rate: 1.4, pitch: 0.5 } });
    const u = state.spoken[0]!;
    expect(u.rate).toBe(1.4);
    expect(u.pitch).toBe(0.5);
  });

  it('voiceHint 名称子串匹配优先于语言匹配', () => {
    const kyoko: SpeechVoiceLike = { name: 'Kyoko', lang: 'ja-JP' };
    const otoya: SpeechVoiceLike = { name: 'Otoya', lang: 'ja-JP' };
    const { synth, state } = fakeSynth([kyoko, otoya]);
    const port = new TtsVoicePort({ synth, makeUtterance: fakeUtterance });
    port.speak({ charId: 'x', event: 'greet', text: 'どうも', params: { voiceHint: 'Otoya' } });
    expect(state.spoken[0]!.voice).toBe(otoya);
  });

  it('确无匹配语言音色（只有 en）→ speak 返 false 回落兜底③', () => {
    const { synth, state } = fakeSynth([EN]);
    const port = new TtsVoicePort({ synth, makeUtterance: fakeUtterance });
    expect(port.speak({ charId: 'aya', event: 'riichi', text: 'リーチ' })).toBe(false);
    expect(state.spoken).toHaveLength(0);
  });

  it('裁决②：voices 空表（异步未就绪）→ 本次 false（不永久判定无ja）；音色就绪后下次 speak 回升 true', () => {
    const voices: SpeechVoiceLike[] = [];
    const { synth, state } = fakeSynth(voices);
    const port = new TtsVoicePort({ synth, makeUtterance: fakeUtterance });
    // 首帧空表
    expect(port.speak({ charId: 'aya', event: 'riichi', text: 'リーチ' })).toBe(false);
    expect(state.spoken).toHaveLength(0);
    // 音色异步就绪（voiceschanged 后 getVoices 返回非空）
    voices.push(JA);
    expect(port.speak({ charId: 'aya', event: 'riichi', text: 'リーチ' })).toBe(true);
    expect(state.spoken).toHaveLength(1);
  });

  it('空文本 → 不朗读、返 false', () => {
    const { synth, state } = fakeSynth([JA]);
    const port = new TtsVoicePort({ synth, makeUtterance: fakeUtterance });
    expect(port.speak({ charId: 'aya', event: 'idle', text: '' })).toBe(false);
    expect(state.spoken).toHaveLength(0);
  });

  it('同 char 新事件顶掉旧朗读（barge-in → cancel 后再 speak）', () => {
    const { synth, state } = fakeSynth([JA]);
    const port = new TtsVoicePort({ synth, makeUtterance: fakeUtterance });
    port.speak({ charId: 'aya', event: 'draw_think', text: 'うーん' }); // active
    expect(state.cancelled).toBe(0);
    port.speak({ charId: 'aya', event: 'riichi', text: 'リーチ' }); // 顶掉
    expect(state.cancelled).toBe(1);
    expect(state.spoken).toHaveLength(2);
  });

  it('onend 后不再算在朗读（下次 speak 不触发 barge-in cancel）', () => {
    const { synth, state } = fakeSynth([JA]);
    const port = new TtsVoicePort({ synth, makeUtterance: fakeUtterance });
    port.speak({ charId: 'aya', event: 'greet', text: 'どうも' });
    state.spoken[0]!.onend?.(); // 朗读自然结束
    port.speak({ charId: 'aya', event: 'greet', text: 'また' });
    expect(state.cancelled).toBe(0); // 无需 barge-in
  });

  it('引擎收任意事件键 string（不背单游戏闭集）', () => {
    const { synth } = fakeSynth([JA]);
    const port = new TtsVoicePort({ synth, makeUtterance: fakeUtterance });
    expect(port.speak({ charId: 'aya', event: 'totally_custom_event', text: 'あ' })).toBe(true);
  });

  it('stop → cancel 合成器', () => {
    const { synth, state } = fakeSynth([JA]);
    const port = new TtsVoicePort({ synth, makeUtterance: fakeUtterance });
    port.speak({ charId: 'aya', event: 'greet', text: 'どうも' });
    port.stop();
    expect(state.cancelled).toBe(1);
  });
});

describe('SamplePackVoicePort — 档② 采样', () => {
  const manifest = {
    aya: { riichi: ['voice/aya/riichi_01.wav', 'voice/aya/riichi_02.wav'], ron: ['voice/aya/ron_01.wav'] },
  };

  it('命中键 → 调 play 后端并返 true', () => {
    const play = vi.fn(() => true);
    const port = new SamplePackVoicePort(manifest, { play });
    expect(port.speak({ charId: 'aya', event: 'ron', text: '' })).toBe(true);
    expect(play).toHaveBeenCalledWith('voice/aya/ron_01.wav', expect.anything());
  });

  it('缺 event 键 → false 回落 TTS', () => {
    const play = vi.fn(() => true);
    const port = new SamplePackVoicePort(manifest, { play });
    expect(port.speak({ charId: 'aya', event: 'greet', text: '' })).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it('缺 charId 键 → false 回落', () => {
    const port = new SamplePackVoicePort(manifest, { play: () => true });
    expect(port.speak({ charId: 'rise', event: 'riichi', text: '' })).toBe(false);
  });

  it('无播放后端 → false 回落（v1 owner 无音源包时链自然落到 TTS）', () => {
    const port = new SamplePackVoicePort(manifest);
    expect(port.speak({ charId: 'aya', event: 'ron', text: '' })).toBe(false);
  });

  it('后端显式返 false（未能播出）→ 回落', () => {
    const port = new SamplePackVoicePort(manifest, { play: () => false });
    expect(port.speak({ charId: 'aya', event: 'ron', text: '' })).toBe(false);
  });

  it('多变体缺省确定性 round-robin 轮播（无裸 Math.random）', () => {
    const played: string[] = [];
    const port = new SamplePackVoicePort(manifest, { play: (k) => { played.push(k); return true; } });
    port.speak({ charId: 'aya', event: 'riichi', text: '' });
    port.speak({ charId: 'aya', event: 'riichi', text: '' });
    port.speak({ charId: 'aya', event: 'riichi', text: '' });
    expect(played).toEqual([
      'voice/aya/riichi_01.wav',
      'voice/aya/riichi_02.wav',
      'voice/aya/riichi_01.wav', // 回环
    ]);
  });

  it('可注入 pick（种子 PRNG 随机选变体）', () => {
    const port = new SamplePackVoicePort(manifest, {
      play: () => true,
      pick: (clips) => clips[clips.length - 1]!,
    });
    const played: string[] = [];
    const p2 = new SamplePackVoicePort(manifest, {
      play: (k) => { played.push(k); return true; },
      pick: (clips) => clips[clips.length - 1]!,
    });
    p2.speak({ charId: 'aya', event: 'riichi', text: '' });
    expect(played).toEqual(['voice/aya/riichi_02.wav']);
    expect(port.speak({ charId: 'aya', event: 'ron', text: '' })).toBe(true);
  });
});

describe('createVoiceChain — 降级链 ①→②', () => {
  function spyPort(returns: boolean): VoicePort & { calls: number } {
    return {
      calls: 0,
      speak(): boolean { this.calls++; return returns; },
      stop(): void {},
      dispose(): void {},
    };
  }

  it('sample 命中 → tts 不被尝试', () => {
    const sample = spyPort(true);
    const tts = spyPort(true);
    const chain = createVoiceChain([sample, tts]);
    expect(chain.speak({ charId: 'aya', event: 'ron', text: 'ロン' })).toBe(true);
    expect(sample.calls).toBe(1);
    expect(tts.calls).toBe(0);
  });

  it('sample 缺键 → 落到 tts', () => {
    const sample = spyPort(false);
    const tts = spyPort(true);
    const chain = createVoiceChain([sample, tts]);
    expect(chain.speak({ charId: 'aya', event: 'ron', text: 'ロン' })).toBe(true);
    expect(sample.calls).toBe(1);
    expect(tts.calls).toBe(1);
  });

  it('全 false → 链返 false（调用方接兜底③）', () => {
    const chain = createVoiceChain([spyPort(false), spyPort(false)]);
    expect(chain.speak({ charId: 'aya', event: 'ron', text: 'ロン' })).toBe(false);
  });

  it('跳过 null/undefined 端口（便于 [samplePack ?? undefined, tts]）', () => {
    const tts = spyPort(true);
    const chain = createVoiceChain([undefined, null, tts]);
    expect(chain.speak({ charId: 'aya', event: 'ron', text: 'ロン' })).toBe(true);
    expect(tts.calls).toBe(1);
  });

  it('stop/dispose 广播全体', () => {
    let stopped = 0, disposed = 0;
    const mk = (): VoicePort => ({ speak: () => false, stop: () => { stopped++; }, dispose: () => { disposed++; } });
    const chain = createVoiceChain([mk(), mk()]);
    chain.stop();
    chain.dispose();
    expect(stopped).toBe(2);
    expect(disposed).toBe(2);
  });

  it('端到端：真 TtsVoicePort(headless) 在链中返 false → 链落到下一档', () => {
    const tts = new TtsVoicePort(); // headless no-op
    const backup = { calls: 0, speak(): boolean { this.calls++; return true; }, stop(): void {}, dispose(): void {} };
    const chain = createVoiceChain([tts, backup]);
    expect(chain.speak({ charId: 'aya', event: 'ron', text: 'ロン' })).toBe(true);
    expect(backup.calls).toBe(1);
  });
});

describe('NullVoicePort — 无声端口', () => {
  it('speak 恒 false（透明）、记日志、不抛', () => {
    const port = new NullVoicePort();
    expect(port.speak({ charId: 'aya', event: 'greet', text: 'x' })).toBe(false);
    port.stop();
    port.dispose();
    expect(port.log.map((l) => l.op)).toEqual(['speak', 'stop', 'dispose']);
    expect(port.log[0]).toMatchObject({ charId: 'aya', event: 'greet' });
  });
});
