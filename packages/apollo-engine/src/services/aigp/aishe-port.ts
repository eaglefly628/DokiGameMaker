// AishePort —— 爱诗(AIGP)视频生成端口（基础设施，确定性 sim 之外；表现层旁路，REQ-C-004）。
//
// 输入 = 一段提示词（由 sim 外的「外观→提示词」纯数据表组装，活样例见 game-i video-lab）；
// 输出 = 一个视频句柄（异步生成，UI 据此展示/分享）。后端可换（Null/真后端），契约不变——
// 与渲染/音频/资产端口同一哲学（EnginePort 风格）。**绝不碰 world / snapshot / hash**（异步旁路，
// 与资产、音频同纪律）→ 不影响确定性/lockstep/录放。对应周期表「扩展 C: AIGP 旁路」X4–X7 的消费端。

export interface AisheGenerateOptions {
  aspect?: string; // 画幅，如 '9:16'（竖屏短视频）
  negativePrompt?: string; // 负面提示词
  seconds?: number; // 时长（秒）
  seed?: number; // 可复现生成的种子（可选）
}

export type AisheStatus = 'pending' | 'ready' | 'error';

export interface AisheVideoHandle {
  id: string; // 句柄 id
  status: AisheStatus;
  prompt: string; // 生成所用提示词（回显）
  url?: string; // status==='ready' 时的视频地址
  error?: string; // status==='error' 时的错误信息
}

export interface AishePort {
  // 提交一段提示词生成视频，返回句柄（异步）。Null 后端即时返回 ready 的占位句柄；真后端调外部 API。
  generate(prompt: string, opts?: AisheGenerateOptions): Promise<AisheVideoHandle>;
}
