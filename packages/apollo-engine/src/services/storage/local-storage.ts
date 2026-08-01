import type { StoragePort, SaveGame, SaveMeta } from './storage-port.js';

// 浏览器存储后端 —— localStorage。键空间用前缀隔离，外加一个索引键存所有槽位的元数据列表。
// 仅在有 localStorage 的环境可用（浏览器）；headless/测试用 MemoryStoragePort。
export class LocalStorageStoragePort implements StoragePort {
  constructor(private readonly prefix = 'apollo-save:') {}

  private key(slot: string): string {
    return this.prefix + slot;
  }
  private get indexKey(): string {
    return this.prefix + '__index__';
  }

  // 原子性兜底（Gemini Q6）：localStorage 无事务，两步写（数据→索引）任一步可能抛 QuotaExceededError，
  // 导致索引与数据脱节、整库坏死。这里先存数据，索引写失败则回滚数据写，保持二者一致后再抛错。
  // 真正的事务/大容量请迁 IndexedDB（后续）。
  async save(slot: string, data: SaveGame): Promise<void> {
    const dataKey = this.key(slot);
    const prevData = localStorage.getItem(dataKey); // 失败回滚用
    localStorage.setItem(dataKey, JSON.stringify(data)); // 步骤1：失败则直接抛（无需回滚）
    try {
      const index = await this.list();
      const next = index.filter((m) => m.slot !== slot);
      next.push(data.meta);
      localStorage.setItem(this.indexKey, JSON.stringify(next)); // 步骤2
    } catch (e) {
      // 步骤2失败 → 回滚步骤1，保证"数据存在但索引无此条"的脱节不会发生。
      if (prevData === null) localStorage.removeItem(dataKey);
      else localStorage.setItem(dataKey, prevData);
      throw e;
    }
  }

  async load(slot: string): Promise<SaveGame | null> {
    const raw = localStorage.getItem(this.key(slot));
    if (!raw) return null;
    // 玩家可能在 DevTools 篡改/破坏 JSON：解析失败按"损坏存档"处理（返回 null），
    // 绝不向上抛异常炸毁主循环/存档界面（Gemini 代码级 #5）。
    try {
      return JSON.parse(raw) as SaveGame;
    } catch {
      return null;
    }
  }

  async list(): Promise<SaveMeta[]> {
    const raw = localStorage.getItem(this.indexKey);
    if (!raw) return [];
    try {
      const index = JSON.parse(raw) as SaveMeta[];
      return Array.isArray(index) ? index.sort((a, b) => b.timestamp - a.timestamp) : [];
    } catch {
      return []; // 索引损坏 → 当空，避免存档界面崩溃
    }
  }

  async delete(slot: string): Promise<void> {
    localStorage.removeItem(this.key(slot));
    const index = (await this.list()).filter((m) => m.slot !== slot);
    localStorage.setItem(this.indexKey, JSON.stringify(index));
  }
}
