import type { StoragePort, SaveGame, SaveMeta } from './storage-port.js';

// 内存存储后端 —— 无依赖、无 IO，供 headless / 测试 / 默认兜底。进程结束即丢。
// 存的是 structuredClone 副本，避免外部后续改动污染已存档。
export class MemoryStoragePort implements StoragePort {
  private readonly slots = new Map<string, SaveGame>();

  async save(slot: string, data: SaveGame): Promise<void> {
    this.slots.set(slot, structuredClone(data));
  }

  async load(slot: string): Promise<SaveGame | null> {
    const v = this.slots.get(slot);
    return v ? structuredClone(v) : null;
  }

  async list(): Promise<SaveMeta[]> {
    return [...this.slots.values()].map((s) => s.meta).sort((a, b) => b.timestamp - a.timestamp);
  }

  async delete(slot: string): Promise<void> {
    this.slots.delete(slot);
  }
}
