import type { SavePort, SaveEnvelope, SaveMeta } from './save-port.js';

// ═══════════════════════════════════════════════════════════════
//  桥后端 SavePort —— 任何「文件式桥」（readFile/writeFile/deleteFile/listFiles）都能当存档后端。
//  FilePort（electron/掌机本地文件系统）与 CloudPort（Steam 云存档）**共用本实现**，只换桥：
//    · FileSavePort  = BridgeSavePort(文件桥)  —— 真桥经 electron preload contextBridge（见 TODO），
//                       无头测试用 createMemoryFileBridge。
//    · CloudSavePort = BridgeSavePort(SteamCloudBridge) —— 直接复用 services/storage 既有 Steam 云桥
//                       （含 createMockSteamCloudBridge 假后端，无真账号可全链路测）。
//  槽位存为 `save/<slot>.json`，另一索引文件 `save/__index__.json` 存全部 SaveMeta；索引写失败回滚
//  数据文件（不脱节），索引缺失/损坏从文件列表重建兜底（同 SteamCloudStoragePort）。
// ═══════════════════════════════════════════════════════════════

// 文件式桥契约（读写删列）。SteamCloudBridge 结构上是它的超集 → 可直接传入。
export interface SaveFileBridge {
  readFile(name: string): Promise<string | null>;
  writeFile(name: string, content: string): Promise<boolean>;
  deleteFile(name: string): Promise<boolean>;
  listFiles(): Promise<string[]>;
}

const DIR = 'save/';
const INDEX = DIR + '__index__.json';
const slotFile = (slot: string): string => DIR + encodeURIComponent(slot) + '.json';

export class BridgeSavePort implements SavePort {
  constructor(private readonly bridge: SaveFileBridge) {}

  async list(): Promise<SaveMeta[]> {
    const raw = await this.bridge.readFile(INDEX);
    if (raw) {
      try {
        const index = JSON.parse(raw) as SaveMeta[];
        if (Array.isArray(index)) return index.sort((a, b) => b.savedAt - a.savedAt);
      } catch { /* 落到重建 */ }
    }
    return this.rebuildIndex();
  }

  async read(slot: string): Promise<SaveEnvelope | null> {
    const raw = await this.bridge.readFile(slotFile(slot));
    if (!raw) return null;
    try { return JSON.parse(raw) as SaveEnvelope; } // 结构损坏→null；内容篡改由 openEnvelope 的 checksum 抓
    catch { return null; }
  }

  async write(slot: string, envelope: SaveEnvelope): Promise<void> {
    const file = slotFile(slot);
    const prev = await this.bridge.readFile(file); // 回滚用
    if (!(await this.bridge.writeFile(file, JSON.stringify(envelope)))) throw new Error(`存档写失败: ${file}`);
    try {
      const index = (await this.list()).filter((m) => m.slot !== slot);
      index.push({ slot, schema: envelope.schema, gameId: envelope.gameId, savedAt: envelope.savedAt });
      if (!(await this.bridge.writeFile(INDEX, JSON.stringify(index)))) throw new Error('索引写失败');
    } catch (e) {
      // 回滚数据文件，保持索引/数据一致。
      if (prev === null) await this.bridge.deleteFile(file).catch(() => {});
      else await this.bridge.writeFile(file, prev).catch(() => {});
      throw e;
    }
  }

  async remove(slot: string): Promise<void> {
    await this.bridge.deleteFile(slotFile(slot)).catch(() => {});
    const index = (await this.list()).filter((m) => m.slot !== slot);
    await this.bridge.writeFile(INDEX, JSON.stringify(index));
  }

  // 索引缺失/损坏 → 扫描槽位文件重建。兜底路径。
  private async rebuildIndex(): Promise<SaveMeta[]> {
    const files = (await this.bridge.listFiles()).filter((f) => f.startsWith(DIR) && f !== INDEX);
    const metas: SaveMeta[] = [];
    for (const f of files) {
      const raw = await this.bridge.readFile(f);
      if (!raw) continue;
      try {
        const e = JSON.parse(raw) as SaveEnvelope;
        const slot = decodeURIComponent(f.slice(DIR.length, -'.json'.length));
        metas.push({ slot, schema: e.schema, gameId: e.gameId, savedAt: e.savedAt });
      } catch { /* skip 坏文件 */ }
    }
    return metas.sort((a, b) => b.savedAt - a.savedAt);
  }
}

/** 内存文件桥 —— 无头测试 FilePort 契约用（真 electron fs 桥不可无头跑）。 */
export function createMemoryFileBridge(): SaveFileBridge {
  const files = new Map<string, string>();
  return {
    async readFile(name) { return files.has(name) ? files.get(name)! : null; },
    async writeFile(name, content) { files.set(name, content); return true; },
    async deleteFile(name) { return files.delete(name); },
    async listFiles() { return [...files.keys()]; },
  };
}

// ── FilePort（electron/掌机本地文件系统）──
// 真桥 TODO：经 electron preload contextBridge 暴露 window.__APOLLO_FILE__（主进程 fs.promises 读写
// userData 目录下 save/*.json），渲染进程不直接碰 fs——与 SteamCloudBridge 同款接线（cloud-bridge.ts）。
// 无头环境（vitest/CI）无该桥 → 用 createMemoryFileBridge 测契约；生产壳注入真桥。
export class FileSavePort extends BridgeSavePort {}

// ── CloudPort（Steam 云存档）── 复用 services/storage 的 SteamCloudBridge（含 mock，无真账号可测）。
// SteamCloudBridge 结构上满足 SaveFileBridge（多一个 available 字段，不影响）。
export class CloudSavePort extends BridgeSavePort {}
