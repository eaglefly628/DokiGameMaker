import type { StoragePort, SaveGame, SaveMeta } from './storage-port.js';
import type { SteamCloudBridge } from './cloud-bridge.js';

// SteamCloudStoragePort —— StoragePort 的 Steam 云后端。槽位存为云文件 `save/<slot>.json`，
// 另一个索引文件 `save/__index__.json` 存全部 SaveMeta（同 LocalStorageStoragePort 思路，
// 换成异步云桥）。与 Memory/LocalStorage 后端契约一致 → SaveSystem 无感切换。
// 索引写失败回滚数据文件，保证「数据在但索引无」的脱节不发生；索引缺失时从 listFiles 重建兜底。

const DIR = 'save/';
const INDEX = DIR + '__index__.json';
const slotFile = (slot: string) => DIR + encodeURIComponent(slot) + '.json';

// listFiles 元素归一化：真桥（steamworks.js client.cloud.listFiles）返回 FileInfo{name,size}
// 对象，假桥返回字符串。两者对不齐时若直接当字符串用（f.startsWith）会在真机上抛。这里统一取名。
function fileName(entry: unknown): string {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string') {
    return (entry as { name: string }).name;
  }
  return '';
}

export class SteamCloudStoragePort implements StoragePort {
  constructor(private readonly cloud: SteamCloudBridge) {}

  async save(slot: string, data: SaveGame): Promise<void> {
    const file = slotFile(slot);
    const prev = await this.cloud.readFile(file);            // 回滚用
    if (!(await this.cloud.writeFile(file, JSON.stringify(data)))) {
      throw new Error(`Steam Cloud writeFile 失败: ${file}`);
    }
    try {
      const index = await this.list();
      const next = index.filter((m) => m.slot !== slot);
      next.push(data.meta);
      if (!(await this.cloud.writeFile(INDEX, JSON.stringify(next)))) throw new Error('索引写失败');
    } catch (e) {
      // 回滚数据文件，保持索引/数据一致
      if (prev === null) await this.cloud.deleteFile(file).catch(() => {});
      else await this.cloud.writeFile(file, prev).catch(() => {});
      throw e;
    }
  }

  async load(slot: string): Promise<SaveGame | null> {
    const raw = await this.cloud.readFile(slotFile(slot));
    if (!raw) return null;
    try { return JSON.parse(raw) as SaveGame; }       // 损坏存档按 null 处理，不抛
    catch { return null; }
  }

  async list(): Promise<SaveMeta[]> {
    const raw = await this.cloud.readFile(INDEX);
    if (raw) {
      try { return JSON.parse(raw) as SaveMeta[]; } catch { /* 落到重建 */ }
    }
    return this.rebuildIndex();   // 索引缺失/损坏 → 扫描槽位文件重建
  }

  async delete(slot: string): Promise<void> {
    const file = slotFile(slot);
    const prev = await this.cloud.readFile(file);            // 回滚用（与 save 对称）
    await this.cloud.deleteFile(file).catch(() => {});
    try {
      const index = (await this.list()).filter((m) => m.slot !== slot);
      if (!(await this.cloud.writeFile(INDEX, JSON.stringify(index)))) throw new Error('索引写失败');
    } catch (e) {
      // 索引更新失败 → 恢复被删的槽位文件，保持索引/数据一致（防「文件已删索引还在」反向脱节）
      if (prev !== null) await this.cloud.writeFile(file, prev).catch(() => {});
      throw e;
    }
  }

  // 从云文件列表重建索引（每个槽位文件读出 meta）。兜底路径，正常不走。
  private async rebuildIndex(): Promise<SaveMeta[]> {
    const files = ((await this.cloud.listFiles()) as unknown[])
      .map(fileName)
      .filter((f) => f.startsWith(DIR) && f !== INDEX);
    const metas: SaveMeta[] = [];
    for (const f of files) {
      const raw = await this.cloud.readFile(f);
      if (!raw) continue;
      try { metas.push((JSON.parse(raw) as SaveGame).meta); } catch { /* skip 坏文件 */ }
    }
    return metas.sort((a, b) => b.timestamp - a.timestamp);
  }
}
