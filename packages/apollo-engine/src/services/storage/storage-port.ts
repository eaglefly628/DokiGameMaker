import type { WorldSnapshot } from '@engine/core/types.js';

// StoragePort —— 存储端口（基础设施，**非涌现 skill**：副作用 IO，在确定性 sim 之外）。
// snapshot() 产出纯 POD，本端口只负责把它按"槽位名"落地/取回。具体后端可换（内存/localStorage/fs/云），
// 契约不变 —— 与渲染/输入/音频端口同一哲学。

// 单个存档的元数据（给存档界面：列表/时间/进度）。
export interface SaveMeta {
  slot: string;
  tick: number; // 存档时的世界 tick（world.getVersion）
  hash: string; // 确定性指纹（校验/防篡改）
  timestamp: number; // 墙钟毫秒（仅元数据，不进 sim）
  label?: string; // 可选人类可读标签（如章节名）
}

// 存档体 = 元数据 + 世界快照。
export interface SaveGame {
  meta: SaveMeta;
  snapshot: WorldSnapshot;
}

// 存储端口契约。实现可同步（localStorage/内存）或异步（fs/云）——一律 Promise 化。
export interface StoragePort {
  save(slot: string, data: SaveGame): Promise<void>;
  load(slot: string): Promise<SaveGame | null>;
  list(): Promise<SaveMeta[]>;
  delete(slot: string): Promise<void>;
}
