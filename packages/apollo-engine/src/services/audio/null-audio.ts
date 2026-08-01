import type { AudioPort, PlayOptions } from './audio-port.js';

// 空音频后端 —— 无声、无依赖，供 headless / 测试 / 静音。记录调用日志便于断言。
export class NullAudioPort implements AudioPort {
  readonly playing = new Set<string>();
  readonly log: Array<{ op: string; clipId?: string }> = [];
  masterVolume = 1;

  play(clipId: string, _opts?: PlayOptions): void {
    this.playing.add(clipId);
    this.log.push({ op: 'play', clipId });
  }
  stop(clipId: string): void {
    this.playing.delete(clipId);
    this.log.push({ op: 'stop', clipId });
  }
  stopAll(): void {
    this.playing.clear();
    this.log.push({ op: 'stopAll' });
  }
  setMasterVolume(v: number): void {
    this.masterVolume = v;
  }
}
