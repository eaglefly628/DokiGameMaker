import type { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/index.js';
import type { StoragePort, SaveGame, SaveMeta } from './storage-port.js';

// SaveSystem —— 存档系统（基础设施服务，sim 之外）。把 world.snapshot()/restore() 与 StoragePort 接起来：
// save = 快照 + 元数据(tick/hash/时间) → 端口；load = 端口取回 → world.restore()。具名槽位 + 列表 + 删除。
// 确定性：hash 用与 lockstep 守卫同一套；存档体是纯 POD。墙钟 timestamp 仅元数据、不进 sim。
export class SaveSystem {
  constructor(private readonly port: StoragePort) {}

  async save(slot: string, world: World, label?: string): Promise<SaveMeta> {
    const snapshot = world.snapshot();
    const meta: SaveMeta = {
      slot,
      tick: world.getVersion(),
      hash: hashSnapshot(snapshot),
      timestamp: Date.now(),
      label,
    };
    await this.port.save(slot, { meta, snapshot });
    return meta;
  }

  // 读档：恢复世界状态。成功返回元数据；槽位不存在返回 null。
  async load(slot: string, world: World): Promise<SaveMeta | null> {
    const data: SaveGame | null = await this.port.load(slot);
    if (!data) return null;
    world.restore(data.snapshot);
    return data.meta;
  }

  list(): Promise<SaveMeta[]> {
    return this.port.list();
  }

  delete(slot: string): Promise<void> {
    return this.port.delete(slot);
  }
}
