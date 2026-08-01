import { describe, it, expect } from 'vitest';
import { sealEnvelope, openEnvelope, computeChecksum, CorruptSaveError } from './envelope.js';
import type { SaveCodec, SaveEnvelope } from './save-port.js';

// 信封核心正确性（REQ-CAP 件③ 硬门槛）：checksum 损坏报错不静默 + schema 迁移链 + 往返 round-trip。
// 确定性：savedAt 宿主注入（测试固定值，不取墙钟）；checksum 纯整数 FNV-1a、跨机一致。

const codecV1: SaveCodec = { gameId: 'game-z', schema: 1 };

describe('envelope —— 往返 round-trip', () => {
  it('seal → open 还原 data 原样（无迁移）', () => {
    const data = { gold: 120, deck: [5, 8, 13], flags: { seenIntro: true } };
    const env = sealEnvelope(data, codecV1, 1700000000000);
    expect(env.schema).toBe(1);
    expect(env.gameId).toBe('game-z');
    expect(env.savedAt).toBe(1700000000000);
    expect(openEnvelope(env, codecV1)).toEqual(data);
  });
});

describe('envelope —— checksum 损坏报错不静默', () => {
  const data = { hp: 30, name: 'leo' };
  const good = (): SaveEnvelope => sealEnvelope(data, codecV1, 100);

  it('篡改 data → CorruptSaveError（不静默返回坏数据）', () => {
    const env = good();
    (env.data as Record<string, unknown>).hp = 9999; // 改血量不改 checksum
    expect(() => openEnvelope(env, codecV1)).toThrow(CorruptSaveError);
  });
  it('篡改 checksum → CorruptSaveError', () => {
    const env = good();
    env.checksum = 'deadbeef';
    expect(() => openEnvelope(env, codecV1)).toThrow(/checksum 不符/);
  });
  it('篡改 savedAt / schema 任一 → 校验失败（checksum 覆盖全字段）', () => {
    const e1 = good(); e1.savedAt = 999; expect(() => openEnvelope(e1, codecV1)).toThrow(CorruptSaveError);
    const e2 = good(); (e2 as { schema: number }).schema = 2; expect(() => openEnvelope(e2, codecV1)).toThrow(CorruptSaveError);
  });
  it('gameId 串档（checksum 自洽但 codec 不符）→ CorruptSaveError', () => {
    // 用别的 game 封的合法信封，拿 game-z 的 codec 读 → gameId 校验拦。
    const env = sealEnvelope(data, { gameId: 'game-g', schema: 1 }, 100);
    expect(() => openEnvelope(env, codecV1)).toThrow(/gameId 不符/);
  });
});

describe('envelope —— schema 迁移链（v1→v2→v3）', () => {
  // 归纳 game-g-save.ts 内联迁移：每一版差异 = 一个 SaveMigration 步。
  const codecV3: SaveCodec = {
    gameId: 'game-z',
    schema: 3,
    migrations: {
      1: (d) => { const o = d as Record<string, unknown>; return { ...o, diamond: 0 }; }, // v1→v2：补 diamond
      2: (d) => { const o = d as Record<string, unknown>; return { ...o, decks: [o.deck], deck: undefined }; }, // v2→v3：deck→decks
    },
  };

  it('旧 v1 档经链升到 v3', () => {
    const oldEnv = sealEnvelope({ gold: 50, deck: [1, 2] }, codecV1, 100); // schema 1
    const migrated = openEnvelope(oldEnv, codecV3) as Record<string, unknown>;
    expect(migrated.diamond).toBe(0); // v1→v2 补
    expect(migrated.decks).toEqual([[1, 2]]); // v2→v3 转
    expect(migrated.deck).toBeUndefined();
  });

  it('当前版档（v3）读取不跑迁移', () => {
    const env = sealEnvelope({ gold: 1, decks: [[9]] }, { gameId: 'game-z', schema: 3 }, 100);
    expect(openEnvelope(env, codecV3)).toEqual({ gold: 1, decks: [[9]] });
  });

  it('迁移链断裂（缺步）→ CorruptSaveError', () => {
    const broken: SaveCodec = { gameId: 'game-z', schema: 3, migrations: { 1: (d) => d } }; // 缺 2→3
    const oldEnv = sealEnvelope({ x: 1 }, codecV1, 100);
    expect(() => openEnvelope(oldEnv, broken)).toThrow(/迁移链断裂/);
  });

  it('存档 schema 高于当前（来自更新版本）→ 拒绝降级读取', () => {
    const newer = sealEnvelope({ x: 1 }, { gameId: 'game-z', schema: 5 }, 100);
    expect(() => openEnvelope(newer, codecV3)).toThrow(/高于当前/);
  });
});

describe('envelope —— checksum 确定性', () => {
  it('同数据 → 同 checksum；字段书写序无关（规范化）', () => {
    const a = computeChecksum(1, 'g', 100, { x: 1, y: 2 });
    const b = computeChecksum(1, 'g', 100, { y: 2, x: 1 });
    expect(a).toBe(b);
  });
  it('数据不同 → checksum 不同', () => {
    expect(computeChecksum(1, 'g', 100, { x: 1 })).not.toBe(computeChecksum(1, 'g', 100, { x: 2 }));
  });
});
