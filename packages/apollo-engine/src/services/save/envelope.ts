import type { SaveEnvelope, SaveCodec } from './save-port.js';

// ═══════════════════════════════════════════════════════════════
//  信封封装 / 拆封 —— 版本化存档的**核心正确性层**（checksum + schema 迁移链）。
//  与端口解耦：端口只负责「存取整只信封」，本模块负责「封装（算 checksum）/ 拆封（校验 + 迁移）」。
//  确定性：checksum 用规范化序列化 + FNV-1a（纯整数、跨机一致）；savedAt 由宿主注入、绝不取墙钟。
// ═══════════════════════════════════════════════════════════════

// 坏档 / 迁移断裂：读档时**报错不静默**（owner 铁律）。上层据此提示「存档损坏」而非默默丢数据。
export class CorruptSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorruptSaveError';
  }
}

// ── 规范化序列化（对象键排序 → 与字段书写序无关）+ FNV-1a 32bit（自包含，不依赖 net/determinism）──
function stable(v: unknown): string {
  if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
  if (v === null || typeof v !== 'object') return typeof v === 'string' ? JSON.stringify(v) : String(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
}
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// 完整性指纹：覆盖 schema/gameId/savedAt/data —— 任一字段被篡改/损坏都会变。
export function computeChecksum(schema: number, gameId: string, savedAt: number, data: unknown): string {
  return fnv1a(`${schema}|${gameId}|${savedAt}|${stable(data)}`);
}

/** 封装：把游戏 blob 封进版本化信封（schema/gameId 取自 codec；savedAt 宿主注入；算 checksum）。 */
export function sealEnvelope(data: unknown, codec: SaveCodec, savedAt: number): SaveEnvelope {
  return {
    schema: codec.schema,
    gameId: codec.gameId,
    savedAt,
    checksum: computeChecksum(codec.schema, codec.gameId, savedAt, data),
    data,
  };
}

/**
 * 拆封：校验 checksum（不符→CorruptSaveError·不静默）→ 校验 gameId/schema → 跑迁移链 → 返回当前 schema 的 data。
 *  - checksum 不符（数据损坏/被篡改）→ 抛。
 *  - gameId 不符（串档）→ 抛。
 *  - env.schema > codec.schema（来自更新版本）→ 抛（拒绝降级读取，避免丢新字段）。
 *  - env.schema < codec.schema → 逐步 migrations[v] 升级 v→v+1，缺步则抛（迁移链断裂）。
 */
export function openEnvelope(env: SaveEnvelope, codec: SaveCodec): unknown {
  const expect = computeChecksum(env.schema, env.gameId, env.savedAt, env.data);
  if (expect !== env.checksum) {
    throw new CorruptSaveError(`存档校验失败：checksum 不符（期望 ${expect}，实为 ${env.checksum}）——数据已损坏或被篡改`);
  }
  if (env.gameId !== codec.gameId) {
    throw new CorruptSaveError(`存档 gameId 不符：期望 "${codec.gameId}"，实为 "${env.gameId}"（串档）`);
  }
  if (env.schema > codec.schema) {
    throw new CorruptSaveError(`存档 schema ${env.schema} 高于当前 ${codec.schema}（来自更新版本，拒绝降级读取）`);
  }
  let data = env.data;
  for (let v = env.schema; v < codec.schema; v++) {
    const step = codec.migrations?.[v];
    if (!step) throw new CorruptSaveError(`迁移链断裂：缺少 schema ${v}→${v + 1} 的迁移步骤`);
    data = step(data);
  }
  return data;
}
