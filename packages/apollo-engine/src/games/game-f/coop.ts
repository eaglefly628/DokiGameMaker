// Game F · 多人 B·slice1 —— 本地三人「共享岛」协作核（designer #23；game-side、零引擎、与 ECS 解耦）。
// 方案乙：三人各跑自己的盘（mirror，不重演），但贡献度凿同一座岛 → island 累加三方贡献；满即全局陷落。
// 结算读 per-owner 贡献排序 → 岛主（最高贡献）。真·远程传输（WS/WebRTC, REQ-018）押后主程；此处只做本地框架。
// ⛔ 纯表现/账号侧聚合：读各 owner 引擎的 contribution 资源求和，不进任何 world 的 sim/hash。

export interface OwnerContribution {
  name: string;     // 显示名（玄德 / 仲谋 / 孟德…）
  faction: string;  // 蜀 / 吴 / 魏
  human: boolean;   // 真人 or AI 补位
  contribution: number;
}

export interface CoopIsland {
  progress: number;          // 三方贡献之和
  goal: number;              // 陷落阈值（默认 3 owner × 100）
  fallen: boolean;           // 达标 = 全局岛陷落、本局结束
  ranking: OwnerContribution[]; // 按贡献降序（同分按原序稳定）
  owner: string | null;      // 岛主 = 贡献最高者
}

export const COOP_GOAL_PER_OWNER = 100;

// 太阁强度按攻岛人数缩放（designer #28；三人同凿一岛、岛 goal 已 ×N，须让各 owner 的太阁更厚以防秒岛、
// 拉长终盘）：hp 乘子 = 1 + 0.3×(N-1) → 单机1.0 / 双人1.3 / 三人1.6。单机(N=1)基线不变。喂 buildGameFBlueprint.difficulty。
export function enemyScaleForPlayers(playerCount: number): number {
  return +(1 + 0.3 * Math.max(0, playerCount - 1)).toFixed(2);
}
// 太阁 atk 基线按人数（更凶但比 hp 缓，避免与信长/毛利叠加爆炸）：单机1.0/双人1.15/三人1.3。
export function enemyAtkBaseForPlayers(playerCount: number): number {
  return +(1 + 0.15 * Math.max(0, playerCount - 1)).toFixed(2);
}

// Boss 宝箱掷点分卡（B·slice2，designer #24；co-opetition：合作杀 Boss、按贡献竞争分赃）。
// 轮选制：贡献排序后第 1 名先挑 1 张（加权随机出小丑牌），轮转到分完 lootCount 张。AI 份额=展示，人类份额入收藏。
// rng 注入（确定性 seed 可选）；纯账号层、零引擎。
export interface LootShare { name: string; human: boolean; cards: GachaPoolEntry[] }
// 复用 account 的 GachaEntry 形（避免循环依赖：此处只声明所需字段）。
export interface GachaPoolEntry { id: string; name: string; weight: number; rarity?: string }
export function distributeBossLoot(owners: OwnerContribution[], lootCount: number, pool: GachaPoolEntry[], rng: () => number = Math.random): LootShare[] {
  const ranked = owners
    .map((o, i) => ({ o, i }))
    .sort((a, b) => (b.o.contribution - a.o.contribution) || (a.i - b.i))
    .map((x) => x.o);
  const shares: LootShare[] = ranked.map((o) => ({ name: o.name, human: o.human, cards: [] }));
  if (!pool.length || lootCount <= 0 || !shares.length) return shares;
  const total = pool.reduce((s, e) => s + e.weight, 0);
  for (let k = 0; k < lootCount; k++) {
    let r = rng() * total;
    let card = pool[pool.length - 1];
    for (const e of pool) { if (r < e.weight) { card = e; break; } r -= e.weight; }
    shares[k % shares.length].cards.push(card); // 轮选：贡献高者先挑（k=0 给排名第 1）
  }
  return shares;
}

// 纯函数：三方贡献 → 共享岛进度 + 排名 + 岛主。确定（稳定排序：贡献降序，等值保入参序）。
export function computeCoopIsland(owners: OwnerContribution[], goalPerOwner = COOP_GOAL_PER_OWNER): CoopIsland {
  const progress = owners.reduce((s, o) => s + Math.max(0, o.contribution), 0);
  const goal = Math.max(1, owners.length) * goalPerOwner;
  const ranking = owners
    .map((o, i) => ({ o, i }))
    .sort((a, b) => (b.o.contribution - a.o.contribution) || (a.i - b.i))
    .map((x) => x.o);
  return { progress, goal, fallen: progress >= goal, ranking, owner: ranking[0]?.name ?? null };
}
