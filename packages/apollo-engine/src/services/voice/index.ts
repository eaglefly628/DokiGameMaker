// 语音输出服务（基础设施·表现层旁路·确定性 sim 之外·REQ-VOICE）。
// 一接口两档：TtsVoicePort（合成·v1 默认）/ SamplePackVoicePort（采样·将来）+ createVoiceChain 降级链。
// 兜底③ = 现有 SynthAudioPort 合成提示音+字幕（见 services/audio，调用方在链返 false 时接）。
export type { VoicePort, VoiceEvent, VoiceParams } from './voice-port.js';
export {
  TtsVoicePort,
  type TtsVoiceOptions,
  type SpeechSynthesisLike,
  type SpeechUtteranceLike,
  type SpeechVoiceLike,
} from './tts-voice-port.js';
export {
  SamplePackVoicePort,
  type VoiceSampleManifest,
  type SamplePackOptions,
} from './sample-pack-voice-port.js';
export { createVoiceChain } from './voice-chain.js';
export { NullVoicePort } from './null-voice.js';
