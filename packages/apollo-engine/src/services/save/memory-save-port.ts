import type { SavePort, SaveEnvelope, SaveMeta } from './save-port.js';

// 内存后端 —— 无依赖、无 IO，供 headless / 测试 / 默认兜底。进程结束即丢。
// 存 structuredClone 副本，避免外部后续改动污染已存信封。
export class MemorySavePort implements SavePort {
  private readonly slots = new Map<string, SaveEnvelope>();

  async list(): Promise<SaveMeta[]> {
    return [...this.slots.entries()]
      .map(([slot, e]) => ({ slot, schema: e.schema, gameId: e.gameId, savedAt: e.savedAt }))
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  async read(slot: string): Promise<SaveEnvelope | null> {
    const v = this.slots.get(slot);
    return v ? structuredClone(v) : null;
  }

  async write(slot: string, envelope: SaveEnvelope): Promise<void> {
    this.slots.set(slot, structuredClone(envelope));
  }

  async remove(slot: string): Promise<void> {
    this.slots.delete(slot);
  }
}
