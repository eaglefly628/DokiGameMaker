import type { CapabilityDefinition } from '@engine/core/define-capability.js';
import type { EntityBlueprint } from './demo.assembly.js';

// ═══════════════════════════════════════════════════════════════
//  组件数据 schema 校验（R12）—— AI/预设/手改产出的蓝图数据的护城河。
//
//  动机：EntityBlueprint 是 string 索引，组件名打错（"Resorce"）或字段拼错（"currrent"）tsc 不报。
//  parseManifest 装 AI 产的 manifest 时，这层静态校验最值钱——把"最弱 LLM 也能产对数据"变成可强制。
//
//  关键：**复用各 capability 已声明的 components.provides[Type].fields 当 schema，绝不另造一份**。
//  那份 fields 本就是组件的字段契约（type + describe），校验器只是拿它交叉比对蓝图数据。
//
//  严格度（刻意保守，零误报优先）：
//   - error（会坏模拟的真错，调用方应拒绝加载）：声明 number/boolean 的字段给了别的基元类型。
//   - warning（疑似拼错，不阻断）：数据里的字段不在组件声明字段中。降级因 schema 完整性不保证，
//     且告警本身能反向暴露"未声明完整字段"的组件。
//   - **只严格查 number/boolean**：本引擎里 string 被复杂字段当占位用（如 dialogue.nodes 实为对象图、
//     shape.kind 是枚举），严格查 string/数组会误报，故跳过。
// ═══════════════════════════════════════════════════════════════

export interface SchemaIssue {
  entity: string;
  component: string;
  field?: string;
  message: string;
}

export interface SchemaReport {
  errors: SchemaIssue[];
  warnings: SchemaIssue[];
}

// 从一组（已解析的）能力聚出 组件类型 → 字段 schema 表。
function collectFieldSchemas(capabilities: readonly CapabilityDefinition[]): Map<string, Record<string, { type: string }>> {
  const out = new Map<string, Record<string, { type: string }>>();
  for (const cap of capabilities) {
    for (const [ctype, schema] of Object.entries(cap.components?.provides ?? {})) {
      out.set(ctype, schema.fields ?? {});
    }
  }
  return out;
}

/**
 * 用各能力声明的 fields 交叉校验蓝图实体的组件数据。
 * 无 provider 的组件（schema 未知）跳过字段校验——parseManifest 另有"无 provider"告警覆盖它。
 */
export function validateComponentData(
  capabilities: readonly CapabilityDefinition[],
  entities: Record<string, EntityBlueprint>,
): SchemaReport {
  const schemas = collectFieldSchemas(capabilities);
  const errors: SchemaIssue[] = [];
  const warnings: SchemaIssue[] = [];

  for (const [eid, comps] of Object.entries(entities)) {
    for (const [ctype, data] of Object.entries(comps as Record<string, unknown>)) {
      const fields = schemas.get(ctype);
      if (!fields) continue; // 无 provider：字段无 schema 可比，跳过（结构层另有告警）。
      if (typeof data !== 'object' || data === null) continue;

      for (const [fname, fval] of Object.entries(data as Record<string, unknown>)) {
        if (fname === 'type') continue; // 判别式键，非数据字段。
        const fschema = fields[fname];
        if (!fschema) {
          const declared = Object.keys(fields).join('/') || '（无声明字段）';
          warnings.push({
            entity: eid,
            component: ctype,
            field: fname,
            message: `字段 "${fname}" 不在 ${ctype} 的声明字段中（疑似拼错；声明字段：${declared}）`,
          });
          continue;
        }
        if (fschema.type === 'number' && typeof fval !== 'number') {
          errors.push({ entity: eid, component: ctype, field: fname, message: `${ctype}.${fname} 应为 number，实为 ${typeof fval}` });
        } else if (fschema.type === 'boolean' && typeof fval !== 'boolean') {
          errors.push({ entity: eid, component: ctype, field: fname, message: `${ctype}.${fname} 应为 boolean，实为 ${typeof fval}` });
        }
      }
    }
  }
  return { errors, warnings };
}

/**
 * 资产引用硬校验（R9 增益 A，护城河）：凡声明为 `assetKey` 类型的组件字段，其值必须是
 * 资产清单（AssetIndex/Manifest）里已注册的 key——否则 AI 可编造、运行期静默不画/不响。
 * 把 §五.2 的 prompt 软约束升级成加载期硬校验（与 R12 同源）。未知 key = error（拒绝加载）。
 * 仅当调用方提供了 assetKeys 集合时才校验；不提供则跳过（opt-in，不影响未接资产索引的路径）。
 */
export function validateAssetRefs(
  capabilities: readonly CapabilityDefinition[],
  entities: Record<string, EntityBlueprint>,
  assetKeys: ReadonlySet<string>,
): SchemaIssue[] {
  const schemas = collectFieldSchemas(capabilities);
  const errors: SchemaIssue[] = [];
  for (const [eid, comps] of Object.entries(entities)) {
    for (const [ctype, data] of Object.entries(comps as Record<string, unknown>)) {
      const fields = schemas.get(ctype);
      if (!fields || typeof data !== 'object' || data === null) continue;
      for (const [fname, fval] of Object.entries(data as Record<string, unknown>)) {
        if (fields[fname]?.type !== 'assetKey') continue;
        if (typeof fval === 'string' && fval.length > 0 && !assetKeys.has(fval)) {
          errors.push({ entity: eid, component: ctype, field: fname, message: `${ctype}.${fname} 引用了清单中不存在的资产 key "${fval}"（防 AI 编造）` });
        }
      }
    }
  }
  return errors;
}

/** 把若干 issue 拼成一行可读消息（用于告警/抛错）。 */
export function formatIssues(issues: readonly SchemaIssue[]): string {
  return issues
    .map((i) => `${i.entity}.${i.component}${i.field ? `.${i.field}` : ''} —— ${i.message}`)
    .join('；');
}
