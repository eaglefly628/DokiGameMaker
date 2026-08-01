import type { VoiceEvent, VoicePort } from './voice-port.js';

// SamplePackVoicePort —— 档② 采样 wav（将来配音升级）。
// 事件键 → wav 资产 key（照 voice-pack-spec §1 命名 `voice/<charId>/<event>_<序号>.wav`·§2 事件键闭集）。
// 同事件多变体轮播（缺省确定性 round-robin·避免裸 Math.random；可注入 pick 走种子 PRNG 随机）。
// 降级：manifest 缺该 charId×event 键 → return false 回落 TTS（档①）；无播放后端 / 后端拒播 → 同样 false 回落。
// v1 owner 无音源包：manifest 多为空/占位 → 本端口对未灌入的键一律 false，让链自然落到 TTS。

// charId → event → 该事件的变体资产 key 列表（照 spec §1 命名·纯数据台账）。
export type VoiceSampleManifest = Readonly<Record<string, Readonly<Record<string, ReadonlyArray<string>>>>>;

export interface SamplePackOptions {
  // 真正把一个资产 key 播出去的后端（注入·如接 AudioPort 采样播放）。返回 false = 未能播出（回落）。
  play?: (clipKey: string, evt: VoiceEvent) => boolean | void;
  stop?: () => void; // 打断当前采样播放
  // 变体选择器（注入·可用种子 PRNG）。缺省 = 每 (charId,event) 各自 round-robin。
  pick?: (clips: ReadonlyArray<string>, key: string) => string;
}

export class SamplePackVoicePort implements VoicePort {
  private readonly counters = new Map<string, number>(); // per-(charId,event) 轮播游标

  constructor(
    private readonly manifest: VoiceSampleManifest,
    private readonly opts: SamplePackOptions = {},
  ) {}

  speak(evt: VoiceEvent): boolean {
    const clips = this.manifest[evt.charId]?.[evt.event];
    if (!clips || clips.length === 0) return false; // 缺键 → 回落 TTS
    const key = `${evt.charId}::${evt.event}`; // 轮播游标 key（charId/event=slug·冒号安全分隔）
    let clip: string;
    if (this.opts.pick) {
      clip = this.opts.pick(clips, key);
    } else {
      const i = this.counters.get(key) ?? 0;
      clip = clips[i % clips.length]!;
      this.counters.set(key, i + 1);
    }
    const play = this.opts.play;
    if (!play) return false; // 无播放后端 → 回落 TTS
    let r: boolean | void;
    try { r = play(clip, evt); } catch { return false; }
    return r !== false; // 后端显式返回 false → 回落；否则视作已播出
  }

  stop(): void {
    try { this.opts.stop?.(); } catch { /* 忽略 */ }
  }

  dispose(): void {
    this.stop();
    this.counters.clear();
  }
}
