import type { AudioPort, PlayOptions } from './audio-port.js';

// 浏览器音频后端 —— 每个 clipId 一个 HTMLAudioElement。clipId→url 由清单提供
// （可来自 assets/index.json 的 sound 条目）。仅浏览器可用；headless/测试用 NullAudioPort。
export class WebAudioPort implements AudioPort {
  private readonly elements = new Map<string, HTMLAudioElement>();
  private master = 1;

  constructor(private readonly urls: Readonly<Record<string, string>>, private readonly baseUrl = '') {}

  private element(clipId: string): HTMLAudioElement | null {
    const url = this.urls[clipId];
    if (!url) return null;
    let el = this.elements.get(clipId);
    if (!el) {
      el = new Audio(this.baseUrl + url);
      this.elements.set(clipId, el);
    }
    return el;
  }

  play(clipId: string, opts?: PlayOptions): void {
    const base = this.element(clipId);
    if (!base) return;
    const volume = (opts?.volume ?? 1) * this.master;
    if (opts?.loop) {
      // 循环(BGM)：用稳定缓存实例，可被 stop()/setMasterVolume 控制。
      base.loop = true;
      base.volume = volume;
      base.currentTime = 0;
      void base.play().catch(() => {});
    } else {
      // 一次性(SFX)：克隆节点播放，允许同源多重并发，避免把上一声 currentTime=0 暴力掐断
      // （HTML5 <audio> 单源不支持并发，Gemini 代码级 #1）。克隆 fire-and-forget，播完由 GC 回收。
      // 长远应转 Web Audio API(AudioContext) 彻底解决并发与精准时序。
      const clone = base.cloneNode() as HTMLAudioElement;
      clone.volume = volume;
      void clone.play().catch(() => {});
    }
  }
  stop(clipId: string): void {
    const el = this.elements.get(clipId);
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
  }
  stopAll(): void {
    for (const id of this.elements.keys()) this.stop(id);
  }
  setMasterVolume(v: number): void {
    this.master = v;
    for (const el of this.elements.values()) el.volume = v;
  }
}
