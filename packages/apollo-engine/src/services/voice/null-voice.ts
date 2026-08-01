import type { VoiceEvent, VoicePort } from './voice-port.js';

// NullVoicePort —— 无声端口（headless / 测试 / 显式静音）。镜像 NullAudioPort。
// speak 恒 return false（不处理→在链中透明·让调用方走兜底③展示字幕），仅记调用日志便于断言。
export class NullVoicePort implements VoicePort {
  readonly log: Array<{ op: 'speak' | 'stop' | 'dispose'; charId?: string; event?: string }> = [];

  speak(evt: VoiceEvent): boolean {
    this.log.push({ op: 'speak', charId: evt.charId, event: evt.event });
    return false;
  }
  stop(): void { this.log.push({ op: 'stop' }); }
  dispose(): void { this.log.push({ op: 'dispose' }); }
}
