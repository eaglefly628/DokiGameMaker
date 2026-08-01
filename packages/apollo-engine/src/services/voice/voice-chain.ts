import type { VoiceEvent, VoicePort } from './voice-port.js';

// createVoiceChain —— 降级链组合器（图纸：createVoiceChain([sample?, tts])）。
// 依序尝试每个端口的 speak：首个返回 true 的即胜出（其余不再尝试）；全 false → 链返回 false，
// 由调用方接兜底③（现有 SynthAudioPort 合成提示音 + 字幕·本模块不含）。
// null/undefined 端口跳过（便于写 [samplePack ?? undefined, tts]）。stop/dispose 广播全体。
export function createVoiceChain(ports: ReadonlyArray<VoicePort | null | undefined>): VoicePort {
  const list = ports.filter((p): p is VoicePort => p != null);
  return {
    speak(evt: VoiceEvent): boolean {
      for (const p of list) {
        if (p.speak(evt)) return true;
      }
      return false;
    },
    stop(): void {
      for (const p of list) { try { p.stop(); } catch { /* 忽略 */ } }
    },
    dispose(): void {
      for (const p of list) { try { p.dispose(); } catch { /* 忽略 */ } }
    },
  };
}
