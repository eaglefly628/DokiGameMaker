// 爱诗(AIGP)视频生成服务（基础设施，确定性 sim 之外；表现层旁路，REQ-C-004）。
// 消费游戏侧纯数据的「外观→提示词」表 → 生成竖屏短视频做展示/分享（游戏的"输出点"；活样例=game-i video-lab）。
// 缺真后端时用 NullAishePort（即时占位句柄），接入真 provider 时换 HttpAishePort——契约不变，与音频/资产端口同哲学。
export type { AishePort, AisheGenerateOptions, AisheVideoHandle, AisheStatus } from './aishe-port.js';
export { NullAishePort } from './null-aishe.js';
export { HttpAishePort } from './http-aishe.js';
export type { HttpAisheConfig } from './http-aishe.js';
