// VoicePort —— 语音输出端口（基础设施·表现层旁路·确定性 sim 之外）。
// REQ-VOICE：游戏侧只发语音事件 `{charId,event,text,params?}`（纯数据），端口把「该说的」变成真声音。
// 一接口两档实现 + 组合器：① TtsVoicePort（浏览器 speechSynthesis·零资产零 key）
// ② SamplePackVoicePort（wav 采样·将来配音）③ 兜底 = 现有 SynthAudioPort 合成提示音+字幕（本模块不含·由调用方接）。
// 红线：**绝不碰 world / snapshot / hash**（NON-DETERMINISTIC OK·与音频/资产/AIGP 端口同纪律）→ 不进 sim/回放/lockstep。
// 事件键闭集校验归**消费方** spec（game-b voice-pack-spec §2）；端口本身收任意 string（引擎不背单游戏词表）。

// ── 每角色 TTS 参数（纯数据·spec §0）：合成档靠 rate/pitch 差异化音色 ──
export interface VoiceParams {
  lang?: string; // BCP-47 语言标签（缺省 'ja-JP'）
  voiceHint?: string; // 音色名称匹配串（在系统音色 name 里子串匹配·大小写不敏感）
  rate?: number; // 语速（speechSynthesis 约 0.1~10·缺省 1）
  pitch?: number; // 音高（约 0~2·缺省 1）
  volume?: number; // 音量 0~1（缺省 1）
}

// ── 语音事件（游戏侧唯一产物·纯数据）──
export interface VoiceEvent {
  charId: string; // 角色 id（aya/rise/sayo/主角…）
  event: string; // 事件键（引擎收任意 string；闭集由消费方 spec 约束）
  text: string; // 日文台词（TTS 朗读文本；采样档下可空·由 charId×event 查台账）
  params?: VoiceParams; // 本次事件的参数覆盖（优先级最高）
}

// ── 端口契约（三档共用）──
export interface VoicePort {
  // 尝试朗读/播放一条语音事件。成功分派 → true；本端口无法处理（无音色/缺键/headless/空文本）
  // → false，让调用方沿降级链回落（① → ② → ③）。绝不抛。
  speak(evt: VoiceEvent): boolean;
  // 打断当前朗读/播放（barge-in 或场景切换）。
  stop(): void;
  // 释放资源（解绑监听等）。之后端口不再发声。
  dispose(): void;
}
