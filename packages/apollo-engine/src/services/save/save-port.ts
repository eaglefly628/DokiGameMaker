// ═══════════════════════════════════════════════════════════════
//  SavePort —— 存档端口（REQ-CAP 下沉·服务+端口形态，照 services/audio·platform 先例）。
//  基础设施：副作用 IO，在确定性 sim 之外。sim 只产纯数据；本端口把「版本化信封」按槽位落地/取回。
//  后端可换（内存 / localStorage / 文件桥 / Steam 云），契约不变——与渲染/输入/音频端口同哲学。
//
//  与既有 services/storage 的分工：storage 是「WorldSnapshot 快照 + hash」向（引擎快照存档）；
//  本 save 端口是「游戏自有数据 blob + schema 迁移链 + checksum」向（game-g-save 那类自定义 Save
//  归纳成的通用信封）。两者互补、各管一摊。
// ═══════════════════════════════════════════════════════════════

// 版本化信封（引擎强制形状）。data 为游戏自有存档 blob（纯 POD·JSON 可序列化）。
export interface SaveEnvelope {
  schema: number; // 数据 schema 版本（游戏自增；读到旧版走迁移链升级到当前）
  gameId: string; // 归属游戏（读时校验，防串档）
  savedAt: number; // 存档时刻（**宿主注入**的时间戳/tick·绝不由 sim 取墙钟 → 确定性红线）
  checksum: string; // 完整性指纹（覆盖 schema/gameId/savedAt/data；不符=坏档，读时报错不静默）
  data: unknown; // 游戏自有存档 blob
}

// 存档元数据（存档界面列表用：不含 data/checksum）。
export interface SaveMeta {
  slot: string;
  schema: number;
  gameId: string;
  savedAt: number;
}

// 单步迁移：把 schema v 的 data 升级成 schema v+1（纯函数·确定性·无墙钟/无 Math.random）。
export type SaveMigration = (data: unknown) => unknown;

// 存档编解码器（游戏注册）：当前 schema + 迁移链。migrations[v] 把 v 升到 v+1。
// 归纳自 game-g-save.ts 的内联逐字段迁移（那里 loadSave 手写一堆 if 补默认；这里把「每一版差异」拆成
// 一个 SaveMigration 步，链式 v→v+1→…→current，永不删旧步——玩家可能拿着旧档回来）。
export interface SaveCodec {
  gameId: string;
  schema: number; // 当前 schema 版本
  migrations?: Record<number, SaveMigration>; // 键 v：schema v → v+1
}

// 存储端口契约。实现可同步（内存/localStorage）或异步（文件/云）——一律 Promise 化。
// 只管「按槽位存取整只信封」；封装/校验/迁移由 envelope.ts 的 seal/open 在端口之外做（关注点分离）。
export interface SavePort {
  list(): Promise<SaveMeta[]>;
  read(slot: string): Promise<SaveEnvelope | null>;
  write(slot: string, envelope: SaveEnvelope): Promise<void>;
  remove(slot: string): Promise<void>;
}
