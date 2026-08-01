// Game F 测试共享脚手架（从 game-f.test.ts 拆分时抽出，2026-06-13）：模块级纯 helper + 节奏常量。
// 各主题 test 文件（combat/economy/flow/placement）import 本模块，免重复定义、降低多人并行在单一测试文件上的撞车。
// 注：非 *.test.ts，不被 vitest 收集为测试文件。各测试内的局部 helper（res/click 等闭包 e）保持留在各自 it 内。
import type { Engine } from '../../runtime/engine.js';
import type { Flag } from '@engine/protocol/components.js';
import { GAME_F_HERO_IDS } from './blueprint.js';

// 节奏：缺省=玩家档（备战30s）；测试统一快速档维持既有时序断言。
export const FAST = { prepTicks: 40, resolutionTicks: 60, celebrateTicks: 12 };

// 棋子=运行时展开的实例（REQ-F-032 回合重置）：id 形如 `hero_<英雄>#<seq>:main`，
// 名牌/条/大招接线是同模板兄弟实例（REQ-F-033 '@local:' 重映射）→ 测试按前缀/后缀寻址。
export const A_HEROES = GAME_F_HERO_IDS.filter((id) => id.startsWith('a_'));
export const B_HEROES = GAME_F_HERO_IDS.filter((id) => id.startsWith('b_'));

export const alive = (e: Engine, id: string): boolean => e.world.getAllEntities().includes(id);
// 注意：overlap/trigger 碰撞对实体的 id 形如 `overlap:<甲>:<乙>`，乙可能是 ...:main 结尾 → 必须再按 hero_ 前缀过滤。
export const mains = (e: Engine): string[] => e.world.getAllEntities().filter((id) => (id.startsWith('hero_') || id.startsWith('mob_')) && id.endsWith(':main')); // 棋子=英雄+野怪（批B：阶段1 全野怪）
export const isBSide = (id: string): boolean => id.startsWith('hero_b_') || id.startsWith('mob_'); // B 方=魏将∪野怪
export const mainOf = (e: Engine, hero: string): string | undefined => mains(e).find((id) => id.startsWith(`hero_${hero}#`));
export const childOf = (mainId: string, part: string): string => mainId.replace(/:main$/, `:${part}`);
export const flag = (e: Engine, id: string): boolean => {
  for (const eid of e.world.getAllEntities()) {
    const f = e.world.getComponent<Flag>(eid, 'Flag');
    if (f && f.id === id) return f.active;
  }
  return false;
};
