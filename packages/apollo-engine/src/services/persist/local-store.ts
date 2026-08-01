// 局外小态的类型化本地存储（KV + 编解码 + 优雅降级）——REQ-SHELL-公共壳三件 ③。
//
// 提升自 game-f `account.ts:19-30` 现成的极小 KV 抽象（game-f 冻结·**只抄不动原文件**），
// 补上七家宿主各写一遍的那圈样板：`typeof localStorage === 'undefined'` 判空 + try/catch 吞异常 +
// JSON 解析 + 形状校验 + 坏档回缺省。收编面（各家现状）：
//   game-t/game-t.ts:30-48（关卡星级 JSON）· game-x/record.ts:16-27（关系档 JSON+缺省合并）
//   game-103/achievements.ts:38-54（解锁集）· game-103/leaderboard.ts:24-40（榜）
//   game-a/game-a.ts:64-66 + game-c/game-c.ts:121-129（语言/人数·**原文**存非 JSON）
//   game-q/sounds.ts:20-25 · game-t/sounds.ts:50-63 · game-g/sound.ts:29-43（静音位 '1'/'0'）
// 故编解码是**闭集 4 款**，各对应真实存量写法，迁移后字节级同格式（老玩家档不炸）：
//   `jsonCodec`（JSON blob·可带形状校验）· `textCodec`（原文枚举串）· `intCodec`（原文整数+钳）· `flagCodec`（'1'/'0'）。
//
// 红线：这是**局外壳层**——不进 world/snapshot/hash，不参与回放/lockstep（同 profile/audio 端口纪律）。
// 引擎快照存档/带迁移链的正经存档走 `services/storage`（StoragePort）与 `services/save`（SavePort 信封），
// 别拿本件替代它们：本件只管「一个键一个小值」的局外偏好/进度/榜。

/** 极小 KV 面（浏览器 localStorage 天然满足；测试注入内存 KV）。 */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** 内存 KV（测试/SSR 降级用·同进程内一致·进程结束即失）。 */
export function memoryKV(seed?: Readonly<Record<string, string>>): KV {
  const m = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 降级用的**共享**内存 KV：无 localStorage 时所有 store 落同一张表，
// 同键的两个 store 才不会各说各话（本进程内行为与真存储一致，只是不跨会话）。
let fallbackKV: KV | null = null;

/** 默认 KV：有 localStorage 用它；隐私模式/SSR/headless（访问即抛或不存在）→ 退共享内存 KV，绝不抛。 */
export function defaultKV(): KV {
  try {
    const ls = (globalThis as { localStorage?: KV | null }).localStorage;
    if (ls && typeof ls.getItem === 'function') return ls;
  } catch { /* 隐私模式下访问 localStorage 本身会抛 */ }
  return (fallbackKV ??= memoryKV());
}

/** 值 ⇄ 原文的编解码（decode 返 null = 坏档 → 用缺省）。 */
export interface StoreCodec<T> {
  decode(raw: string): T | null;
  encode(value: T): string;
}

/**
 * JSON blob 编解码。`normalize` 是形状校验（返 null = 坏档）——缺省只要求解析成功。
 * 传 normalize 时它同时是「旧档兼容/字段补缺」的落点（同 `normalizePlayerProfile` 纪律）。
 */
export function jsonCodec<T>(normalize?: (raw: unknown) => T | null): StoreCodec<T> {
  return {
    decode(raw) {
      const parsed = JSON.parse(raw) as unknown; // 抛由 localStore 兜住 → 回缺省
      return normalize ? normalize(parsed) : (parsed as T);
    },
    encode: (v) => JSON.stringify(v),
  };
}

/** 原文枚举串（**不裹引号**·与既有 `localStorage.getItem(k) === 'en'` 类写法字节兼容）。不在闭集内=坏档。 */
export function textCodec<T extends string>(allowed: readonly T[]): StoreCodec<T> {
  return {
    decode: (raw) => (allowed.includes(raw as T) ? (raw as T) : null),
    encode: (v) => v,
  };
}

/** 原文十进制整数 + 钳到 [min,max]（非数=坏档）。 */
export function intCodec(min: number, max: number): StoreCodec<number> {
  return {
    decode(raw) {
      const n = Number(raw);
      return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : null;
    },
    encode: (v) => String(Math.max(min, Math.min(max, Math.round(v)))),
  };
}

/** 布尔位 '1'/'0'（与三家静音键现存格式字节兼容·迁移不丢老玩家的静音偏好）。 */
export const flagCodec: StoreCodec<boolean> = {
  decode: (raw) => (raw === '1' ? true : raw === '0' ? false : null),
  encode: (v) => (v ? '1' : '0'),
};

/** 一个键一个值的类型化存取口。 */
export interface LocalStore<T> {
  readonly key: string;
  /** 读；无值/坏档/存储不可用 → 缺省（**绝不抛**）。 */
  get(): T;
  /** 写；配额满/隐私模式 → 静默忽略（**绝不抛**·退化为局内内存态）。 */
  set(value: T): void;
  /** 删（后续 get 回缺省）。 */
  remove(): void;
}

function resolveFallback<T>(f: T | (() => T)): T {
  return typeof f === 'function' ? (f as () => T)() : f;
}

/**
 * 建一个类型化本地存储口。
 * @param key      存储键（沿用各家现键即可·迁移零丢档）
 * @param fallback 缺省值；**对象/数组类请传工厂**（`() => ({...})`），免得调用方改到共享的那一份
 * @param codec    编解码（默认 `jsonCodec()`）
 * @param kv       存储后端（默认 `defaultKV()`·测试传 `memoryKV()`）
 *
 * ```ts
 * const stars = localStore<Record<number, number>>('apollo-t-progress-v1', () => ({}));
 * stars.set({ ...stars.get(), 3: 2 });
 * const muted = localStore('gg_sfx_muted', false, flagCodec);
 * ```
 */
export function localStore<T>(
  key: string,
  fallback: T | (() => T),
  codec: StoreCodec<T> = jsonCodec<T>(),
  kv: KV = defaultKV(),
): LocalStore<T> {
  return {
    key,
    get(): T {
      try {
        const raw = kv.getItem(key);
        if (raw === null) return resolveFallback(fallback);
        const value = codec.decode(raw);
        return value === null || value === undefined ? resolveFallback(fallback) : value;
      } catch {
        return resolveFallback(fallback); // 坏档/存储异常 → 缺省·绝不炸宿主
      }
    },
    set(value: T): void {
      try { kv.setItem(key, codec.encode(value)); } catch { /* 隐私模式/配额满 → 忽略 */ }
    },
    remove(): void {
      try { kv.removeItem?.(key); } catch { /* 同上 */ }
    },
  };
}
