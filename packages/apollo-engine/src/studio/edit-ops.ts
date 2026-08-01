import { COMPONENT_PROVIDERS, CAPABILITY_REGISTRY } from '../assembly/capability-registry.js';
import type { FieldType } from '@engine/core/define-capability.js';

// ═══════════════════════════════════════════════════════════════
//  编辑操作 (edit-ops) —— "模型无关编辑"的确定性核心
//
//  edit-op 是**数据**（一小撮闭合操作）；本模块是把它们安全应用到 manifest entities 的
//  **确定性引擎代码**。强/弱大模型最终都只需产出这些 op，难的校验/纠错/不可变 patch 在此。
//  设计：逐 op 独立校验，非法 op 被拒（记原因）不影响其它 op；应用是不可变的（返回新 entities）。
// ═══════════════════════════════════════════════════════════════

export type CompData = Record<string, unknown>;
/** manifest 的实体数据：entityId → 组件名 → 组件数据。与 WorldBlueprint.entities 同形。 */
export type Entities = Record<string, Record<string, CompData>>;

export type EditOp =
  | { op: 'set'; entity: string; component: string; field: string; value: unknown }
  | { op: 'nudge'; entity: string; component: string; field: string; factor?: number; delta?: number }
  | { op: 'setColor'; entity: string; tint: number };

export interface OpResult {
  op: EditOp;
  ok: boolean;
  reason?: string;
  before?: unknown;
  after?: unknown;
}
export interface ApplyResult {
  entities: Entities;
  results: OpResult[];
}

/** (组件,字段) → 字段 schema（type+describe），取自能力注册表（全局，不依赖当前 manifest 的 capabilities）。 */
export function getFieldSchema(component: string, field: string): { type: FieldType; describe: string } | undefined {
  const capId = COMPONENT_PROVIDERS.get(component);
  if (!capId) return undefined;
  return CAPABILITY_REGISTRY.get(capId)?.components?.provides?.[component]?.fields?.[field];
}

/** 列出某实体当前可改的 (组件,字段,类型) —— 供解析器/UI 做候选与模糊匹配。 */
export function editableFields(entities: Entities, entity: string): Array<{ component: string; field: string; type: FieldType; describe: string }> {
  const ent = entities[entity];
  if (!ent) return [];
  const out: Array<{ component: string; field: string; type: FieldType; describe: string }> = [];
  for (const [component, data] of Object.entries(ent)) {
    for (const field of Object.keys(data)) {
      const fs = getFieldSchema(component, field);
      if (fs) out.push({ component, field, type: fs.type, describe: fs.describe });
    }
  }
  return out;
}

function coerce(value: unknown, type: FieldType): { ok: true; value: unknown } | { ok: false; reason: string } {
  switch (type) {
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, reason: `值 ${JSON.stringify(value)} 不是数字` };
    }
    case 'boolean': {
      if (typeof value === 'boolean') return { ok: true, value };
      if (value === 'true' || value === '1' || value === 1) return { ok: true, value: true };
      if (value === 'false' || value === '0' || value === 0) return { ok: true, value: false };
      return { ok: false, reason: `值 ${JSON.stringify(value)} 不是布尔` };
    }
    case 'string':
      return { ok: true, value: typeof value === 'string' ? value : String(value) };
    default:
      return { ok: true, value }; // EntityId / string[] / number[]：MVP 不强校，原样写入
  }
}

function commit(entities: Entities, op: EditOp, eid: string, comp: string, field: string, value: unknown): { entities: Entities; result: OpResult } {
  const before = (entities[eid][comp] as CompData)[field];
  const next: Entities = {
    ...entities,
    [eid]: { ...entities[eid], [comp]: { ...entities[eid][comp], [field]: value } },
  };
  return { entities: next, result: { op, ok: true, before, after: value } };
}

function applyOne(entities: Entities, op: EditOp): { entities: Entities; result: OpResult } {
  const reject = (reason: string) => ({ entities, result: { op, ok: false, reason } as OpResult });
  const ent = entities[op.entity];
  if (!ent) return reject(`实体 "${op.entity}" 不存在`);

  if (op.op === 'setColor') {
    if (!ent.Color) return reject(`实体 "${op.entity}" 没有 Color 组件`);
    if (!Number.isFinite(op.tint)) return reject(`颜色值非法`);
    return commit(entities, op, op.entity, 'Color', 'tint', op.tint & 0xffffff);
  }

  if (!ent[op.component]) return reject(`实体 "${op.entity}" 没有 ${op.component} 组件`);
  const fs = getFieldSchema(op.component, op.field);
  if (!fs) return reject(`${op.component} 无声明字段 "${op.field}"`);

  if (op.op === 'set') {
    const c = coerce(op.value, fs.type);
    if (!c.ok) return reject(c.reason);
    return commit(entities, op, op.entity, op.component, op.field, c.value);
  }

  // nudge：仅 number 字段
  if (fs.type !== 'number') return reject(`nudge 只能用于 number 字段（${op.component}.${op.field} 是 ${fs.type}）`);
  const cur = (ent[op.component] as CompData)[op.field];
  if (typeof cur !== 'number') return reject(`${op.component}.${op.field} 当前值不是数字`);
  let v = cur;
  if (op.factor !== undefined) v *= op.factor;
  if (op.delta !== undefined) v += op.delta;
  if (!Number.isFinite(v)) return reject('nudge 结果非有限数');
  return commit(entities, op, op.entity, op.component, op.field, v);
}

/** 不可变应用一组 op；逐 op 校验，非法的跳过并记原因。确定性：同输入同输出。 */
export function applyEditOps(entities: Entities, ops: readonly EditOp[]): ApplyResult {
  let next = entities;
  const results: OpResult[] = [];
  for (const op of ops) {
    const r = applyOne(next, op);
    results.push(r.result);
    if (r.result.ok) next = r.entities;
  }
  return { entities: next, results };
}
