import type { SavePort, SaveEnvelope, SaveMeta } from './save-port.js';

// 浏览器后端 —— localStorage。键空间前缀隔离 + 一个索引键存全部 SaveMeta（同 services/storage 的
// LocalStorageStoragePort 思路）。仅浏览器可用；headless/测试用 MemorySavePort。
export class LocalStorageSavePort implements SavePort {
  constructor(private readonly prefix = 'apollo-save:') {}

  private key(slot: string): string {
    return this.prefix + slot;
  }
  private get indexKey(): string {
    return this.prefix + '__index__';
  }

  async list(): Promise<SaveMeta[]> {
    const raw = localStorage.getItem(this.indexKey);
    if (!raw) return [];
    try {
      const index = JSON.parse(raw) as SaveMeta[];
      return Array.isArray(index) ? index.sort((a, b) => b.savedAt - a.savedAt) : [];
    } catch {
      return []; // 索引损坏 → 当空，避免存档界面崩溃（信封本体的 checksum 校验在 openEnvelope 做）
    }
  }

  async read(slot: string): Promise<SaveEnvelope | null> {
    const raw = localStorage.getItem(this.key(slot));
    if (!raw) return null;
    // JSON 解析失败（DevTools 篡改破坏结构）→ null，不抛炸主循环；结构完整但内容被改由 openEnvelope 的
    // checksum 抓（那是「报坏档不静默」的正路）。
    try {
      return JSON.parse(raw) as SaveEnvelope;
    } catch {
      return null;
    }
  }

  // 原子性兜底（同 LocalStorageStoragePort）：两步写（数据→索引）任一步可能抛 QuotaExceededError；
  // 索引写失败则回滚数据写，保持二者一致后再抛。
  async write(slot: string, envelope: SaveEnvelope): Promise<void> {
    const dataKey = this.key(slot);
    const prev = localStorage.getItem(dataKey);
    localStorage.setItem(dataKey, JSON.stringify(envelope));
    try {
      const index = (await this.list()).filter((m) => m.slot !== slot);
      index.push({ slot, schema: envelope.schema, gameId: envelope.gameId, savedAt: envelope.savedAt });
      localStorage.setItem(this.indexKey, JSON.stringify(index));
    } catch (e) {
      if (prev === null) localStorage.removeItem(dataKey);
      else localStorage.setItem(dataKey, prev);
      throw e;
    }
  }

  async remove(slot: string): Promise<void> {
    localStorage.removeItem(this.key(slot));
    const index = (await this.list()).filter((m) => m.slot !== slot);
    localStorage.setItem(this.indexKey, JSON.stringify(index));
  }
}
