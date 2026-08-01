// PlayerProfile —— 玩家档案「只读」通道（REQ-C-104·三游戏共享角色卡 v1）。
//
// 外部（launcher 档案卡·将来工坊）配置一张最小角色卡 → 存 localStorage["apollo.playerProfile"]；
// 游戏装配层用本 API 读一次，把主角身份（姓名/头像）填进蓝图数据（Text/Sprite/席位铭牌）。
//
// 红线（与音频/语音/AIGP 端口同纪律）：**绝不进 world / snapshot / hash**——档案在装配期读一次成
// 静态蓝图数据，不参与确定性 sim/回放/lockstep。本模块**只读**：写入职责在 launcher（PST 域），
// 引擎侧不提供 setter，避免装配后被改动破坏可复现性。
//
// 格式 v1（owner 2026-07-17 拍板·仅 name+avatar；见 docs/design/game-b/character-card-format-needs.md §0）：
//   { name: string, avatarUrl?: string }
// portrait（立绘）字段**预留进类型不实装**——v2 完整格式定稿时再接（typing-only，本期不读）。

/** localStorage 存储键（launcher 写 · 三游戏读；跨游戏共享通道的唯一键）。 */
export const PLAYER_PROFILE_KEY = 'apollo.playerProfile';

/**
 * 玩家档案（共享角色卡 v1）。
 * v1 生效字段 = name（必填）+ avatarUrl（可选）；portrait 预留（立绘·v2·本期不读不写）。
 */
export interface PlayerProfile {
  /** 显示名（主角座位铭牌/结算屏/台词称呼）。 */
  name: string;
  /** 头像：预设 emoji 或资产引用/URL（可选·缺则游戏用占位头像）。 */
  avatarUrl?: string;
  /** 预留·立绘（竖构图半身立绘·v2 完整格式定稿时接·本期不实装）。 */
  portrait?: string;
}

/**
 * 读取玩家档案（引擎侧只读 API）。
 * - headless / 无 localStorage（node 测试/服务端）→ null
 * - 无档（键不存在）→ null
 * - 坏档（JSON 解析失败 / 非对象 / 缺有效 name）→ null（**绝不抛**，不炸装配期）
 * 游戏 adapter 拿到 null 时用内置默认（「主角」+占位头像）——见各游戏 capability-plan 的 PlayerCard 注入点。
 */
export function getPlayerProfile(): PlayerProfile | null {
  try {
    if (typeof localStorage === 'undefined') return null; // headless/无 window
    const raw = localStorage.getItem(PLAYER_PROFILE_KEY);
    if (!raw) return null; // 无档
    return normalizePlayerProfile(JSON.parse(raw) as unknown);
  } catch {
    return null; // 坏档 / 存储异常 → 一律吞掉返回 null，绝不向上抛
  }
}

/**
 * 把任意解析结果收敛为合法 PlayerProfile，否则 null（纯函数·确定性·便于 adapter/测试复用）。
 * 坏档判据：非对象、或 name 非非空串。avatarUrl 非串时静默丢弃（不因单个坏字段废掉整档）。
 */
export function normalizePlayerProfile(raw: unknown): PlayerProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const name = typeof rec.name === 'string' ? rec.name.trim() : '';
  if (!name) return null; // 无有效名字 = 坏档
  const profile: PlayerProfile = { name };
  // 头像：API 口径 avatarUrl；兼容共享卡格式 v1 的 avatar 字段（外部按 §0 写卡时用 avatar）。
  const avatar = rec.avatarUrl ?? rec.avatar;
  if (typeof avatar === 'string' && avatar) profile.avatarUrl = avatar;
  // portrait 预留·v1 不读入（typing-only）。
  return profile;
}
