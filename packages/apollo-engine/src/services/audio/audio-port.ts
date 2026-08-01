// AudioPort —— 音频端口（基础设施，非涌现 skill：副作用输出，在确定性 sim 之外）。
// sim 只持有 `Sound{clipId,volume,loop}`（纯数据）；本端口把"该响的"变成真实声音。后端可换
// （Null/Web/未来 WebAudio 图），契约不变 —— 与渲染/输入端口同一哲学。

export interface PlayOptions {
  volume?: number; // 0..1，缺省 1
  loop?: boolean; // 缺省 false
}

export interface AudioPort {
  play(clipId: string, opts?: PlayOptions): void;
  stop(clipId: string): void;
  stopAll(): void;
  setMasterVolume(v: number): void;
}
