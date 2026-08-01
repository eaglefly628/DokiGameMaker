// 音频服务（基础设施，确定性 sim 之外）。
export type { AudioPort, PlayOptions } from './audio-port.js';
export { NullAudioPort } from './null-audio.js';
export { WebAudioPort } from './web-audio.js';
export { SynthAudioPort, type SfxSpec, type SfxPartial, type AudioCtxLike, type SynthOptions } from './synth-audio.js';
export { SynthMusicPort, type MusicTrack, type MusicNote, type MusicOptions } from './synth-music.js';
export { AudioSync } from './audio-sync.js';
