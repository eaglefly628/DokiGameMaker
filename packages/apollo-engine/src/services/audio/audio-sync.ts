import type { IWorld } from '@engine/core/types.js';
import type { Sound } from '@engine/protocol/components.js';
import type { AudioPort } from './audio-port.js';

// AudioSync —— "消费 Sound" 的协调器（基础设施服务，sim 外）。每次 sync 读世界里所有 `Sound` 组件，
// 与"当前在放"的集合做 diff：新出现的 clip → port.play；已消失的 → port.stop。
// Sound 的存在 = "应当在响"；移除 Sound 即停。与渲染器的"读组件→驱动后端"同构。
// 放在渲染同侧（每帧/每 tick 调一次），不进 snapshot/hash。
export class AudioSync {
  // 按 **EntityId** 追踪（Gemini Q4 "金币问题"）：同一 clipId 的多个实体实例各自独立追踪生命周期，
  // 不会因 clipId 撞键而互相覆盖。clipId 引用计数决定何时真正 stop（最后一个实例消失才停）。
  private readonly playing = new Map<string, string>(); // entityId → 当前在放的 clipId（**快照字符串**；组件会原位改，存引用会漏检切歌）
  private readonly refCount = new Map<string, number>(); // clipId → 在放实例数

  constructor(private readonly port: AudioPort) {}

  sync(world: IWorld): void {
    const desired = new Map<string, Sound>(); // entityId → Sound
    for (const [e] of world.query('Sound')) {
      const s = world.getComponent<Sound>(e, 'Sound');
      if (s) desired.set(e, s);
    }
    // 消失的实体 → 释放（引用计数减一，归零才真停该 clip）。
    for (const [eid, clipId] of [...this.playing]) {
      if (!desired.has(eid)) {
        this.playing.delete(eid);
        this.release(clipId);
      }
    }
    // 出现 / 切歌 → 播放。组件数据会**原位修改**：实体没销毁但 clipId 变了（forest→boss BGM）也要响应。
    // 关键：playing 存 clipId **快照字符串**而非组件引用——否则原位改后 prev 与 s 同引用、永远相等、漏掉切歌（Gemini code review）。
    for (const [eid, s] of desired) {
      const prevClip = this.playing.get(eid);
      if (prevClip === undefined) {
        this.acquire(s); // 新实例
      } else if (prevClip !== s.clipId) {
        this.release(prevClip); // 切歌：先停旧
        this.acquire(s); // 再播新
      }
      // 同 clip：无操作（volume/loop 热更新需 AudioPort 支持，列为 follow-up）。
      this.playing.set(eid, s.clipId);
    }
  }

  // 引用计数 +1 并播放（同 clip 的多实例各自 play，最后一个释放才真停）。
  private acquire(s: Sound): void {
    this.refCount.set(s.clipId, (this.refCount.get(s.clipId) ?? 0) + 1);
    this.port.play(s.clipId, { volume: s.volume, loop: s.loop });
  }

  // 引用计数 -1，归零则真停该 clip。
  private release(clipId: string): void {
    const n = (this.refCount.get(clipId) ?? 1) - 1;
    if (n <= 0) {
      this.refCount.delete(clipId);
      this.port.stop(clipId);
    } else {
      this.refCount.set(clipId, n);
    }
  }
}
