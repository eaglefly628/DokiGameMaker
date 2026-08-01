import type { IWorld, EntityId, Component } from './types.js';
import type { Resource, PrefabOrigin } from '../protocol/components.js';

// 按"组件某字段的值"找实体 / 取组件（R13/R14）。游戏层反复要"按 id 取实体"（resource/flag/state/
// string/单例 fsm…），与 Condition 的 buildConditionLookup 同源；这里给**单次查找**的便捷版。
// 假定该 id 全局唯一，返回第一个匹配（与全局路由约定一致）。纯查询、无副作用、确定性。

export function findByComponentId(
  world: IWorld,
  type: string,
  idField: string,
  id: string,
): EntityId | undefined {
  for (const e of world.queryEntities(type)) {
    const c = world.getComponent(e, type) as (Component & Record<string, unknown>) | undefined;
    if (c && c[idField] === id) return e;
  }
  return undefined;
}

export function getComponentById<T extends Component>(
  world: IWorld,
  type: string,
  idField: string,
  id: string,
): T | undefined {
  const e = findByComponentId(world, type, idField, id);
  return e === undefined ? undefined : world.getComponent<T>(e, type);
}

// ── findSourceResource（REQ-F-065/REQ-SPENDONFIRE 共用口径）──
// 找"发起者本地"的某 id Resource：source 实体自身持有 → 直接命中（快路，一实体一 Resource）；
// 否则若 source 自身也是 prefab 复合实例（有 PrefabOrigin）→ 在其**同次展开的兄弟**里找。
// 未命中（或 source 实体已不存在）返回 undefined，**不做任何隐式全局回退**——回退策略交给调用方：
// hitbox.findScaleResource（读侧，per-caster 伤害缩放）未命中本地时回退全局资源（历史行为，零迁移）；
// resource-apply 的 ResourceModify.scope:'source'（写侧，per-shot 扣发射源 ammo）未命中则严格跳过，
// 防"源缺失/源无此资源 → 误扣某个同名全局资源"（那会比不扣更糟——扣错炮）。
// 纯查询、无副作用、确定性（遍历序与结果无关，一 source+resourceId 至多一个合法匹配）。
export function findSourceResource(world: IWorld, source: EntityId, resourceId: string): Resource | undefined {
  const own = world.getComponent<Resource>(source, 'Resource');
  if (own && own.id === resourceId) return own; // 源自身持有（快路）
  const origin = world.getComponent<PrefabOrigin>(source, 'PrefabOrigin'); // 源的复合身份
  if (!origin) return undefined;
  for (const [eid] of world.query('Resource', 'PrefabOrigin')) {
    const po = world.getComponent<PrefabOrigin>(eid, 'PrefabOrigin')!;
    if (po.templateId !== origin.templateId || po.seq !== origin.seq) continue; // 仅同次展开的兄弟
    const r = world.getComponent<Resource>(eid, 'Resource')!;
    if (r.id === resourceId) return r;
  }
  return undefined;
}
