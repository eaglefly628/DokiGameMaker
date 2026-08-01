// Game F · 装备 ③/④ 模型（金铲铲制：每将 ≤3 件；"烘进下次部署"语义）。
// 纯函数 + JS 侧 meta 状态（EquipMap），不入战斗 hash；HP 经 Caster.overrides 在部署拍重烘
// （caster 每次施放重读 overrides → 拖上即改、下次开战生效）。零引擎。
// ⚠️ atk 缺口：伤害走共享 strike_<id> 模板 + 全局 scaleByResource，逐将 atk 无法经 override 烘
//   → v1 仅 HP 生效；atk/atkSpd/crit/move 记录入袋+tooltip，战斗加成待 Lead 路由（per-unit 缩放）或大厅预装版。
import { ITEM_LIB } from './items.js';
import { finalHp, type HeroSpec } from './heroes.js';
import { STAR_HP_MUL } from './economy.js';

export const MAX_EQUIP = 3; // 金铲铲：每将最多 3 件
export type EquipMap = Record<string, string[]>; // heroKey（marker 实例 id）→ 已装道具 id[]

// 装备一件（≤3）：成功 push 并返回 true；满员返回 false（调用方据此回弹/提示）。
export function addEquip(map: EquipMap, heroKey: string, itemId: string): boolean {
  const list = map[heroKey] ?? (map[heroKey] = []);
  if (list.length >= MAX_EQUIP) return false;
  list.push(itemId);
  return true;
}

// 拆解一件（④）：移除该将身上首个匹配 itemId，返回被移除的 id（用于退回战利品袋）；无则 null。
export function removeEquip(map: EquipMap, heroKey: string, itemId: string): string | null {
  const list = map[heroKey];
  if (!list) return null;
  const i = list.indexOf(itemId);
  if (i < 0) return null;
  list.splice(i, 1);
  if (list.length === 0) delete map[heroKey];
  return itemId;
}

// 某将装备的 stat 加总（缺省 0）；hp 接战斗烘值，其余暂表现。
export function equipStatSum(map: EquipMap, heroKey: string, k: 'hp' | 'atk'): number {
  return (map[heroKey] ?? []).reduce((s, id) => s + (ITEM_LIB[id]?.stats[k] ?? 0), 0);
}

// 部署 HP 重烘：= round((finalHp(英雄,含起手装) + Σ装备 hp) × 人数难度 × 星级倍率)。
// = heroOverrides 同管道（star 倍率），只是基底再加装备 hp。供拖装备时写回 marker 的 Caster.overrides.main.Resource。
export function equipDeployHp(h: HeroSpec, star: number, hpMul: number, map: EquipMap, heroKey: string): number {
  const bonus = equipStatSum(map, heroKey, 'hp');
  return Math.round((finalHp(h) + bonus) * hpMul * (STAR_HP_MUL[star] ?? 1));
}

// 极简 world 接口（解耦引擎类型，便于测试）：拖装备只需读/写 marker 的 Caster 组件。
export interface EquipWorld {
  getComponent(entityId: string, type: string): unknown;
  addComponent(entityId: string, comp: unknown): void;
}
interface CasterOverride { overrides?: { main?: { Resource?: { current: number; max: number } }; eqcaster?: { Resource?: { current: number; max: number } } } }

// 把某 marker 当前装备重烘进 Caster.overrides（caster 每施放重读 → 下次开战生效）。装/卸共用：
// ① main.Resource = 部署 HP(基底+Σ装备hp，star 同管道)；② eqstat.Resource(eq_atk) = Σ装备atk(REQ-F-065 per-caster，
// eq_strike 按本单位 eq_atk 缩放=异质平砍加伤)。HP/atk 双线一起烘。
export function rebakeDeployHp(world: EquipWorld, markerId: string, map: EquipMap, h: HeroSpec, star: number, hpMul: number): void {
  const caster = world.getComponent(markerId, 'Caster') as CasterOverride | undefined;
  if (!caster?.overrides?.main?.Resource) return;
  const hp = equipDeployHp(h, star, hpMul, map, markerId);
  caster.overrides.main.Resource = { current: hp, max: hp };
  const atk = equipStatSum(map, markerId, 'atk');
  caster.overrides.eqcaster = { Resource: { current: atk, max: 9999 } }; // eq_atk = Σ装备atk（per-unit sidecar，eq_strike 读它）
  world.addComponent(markerId, caster);
}

// 拖装备落 marker（③）：addEquip(≤3) 成功后重烘 HP。满 3 件返回 false（调用方回弹+提示，不写 override）。
export function applyEquip(world: EquipWorld, markerId: string, itemId: string, map: EquipMap, h: HeroSpec, star: number, hpMul: number): boolean {
  if (!addEquip(map, markerId, itemId)) return false;
  rebakeDeployHp(world, markerId, map, h, star, hpMul);
  return true;
}

// 拆解（④）：从 marker 卸下 itemId → 重烘 HP（扣回装备 hp）→ 返回被卸 id（退回战利品袋）；无则 null。
export function unequip(world: EquipWorld, markerId: string, itemId: string, map: EquipMap, h: HeroSpec, star: number, hpMul: number): string | null {
  const removed = removeEquip(map, markerId, itemId);
  if (removed) rebakeDeployHp(world, markerId, map, h, star, hpMul);
  return removed;
}

// 解析 marker 实例 id（`bench${star?}_${heroId}#${seq}:seat`）→ {heroId, star}；非席位 → null。
// star：bench_ =1 / bench2_ =2 / bench3_ =3（模板族名编码星级）。heroId 可含下划线（如 a_guanyu）。
export function parseMarkerId(entityId: string): { heroId: string; star: number } | null {
  const m = /^bench(\d?)_(.+?)#\d+:seat$/.exec(entityId);
  if (!m) return null;
  return { heroId: m[2], star: m[1] ? Number(m[1]) : 1 };
}
