import type { WorldBlueprint, EntityBlueprint } from './demo.assembly.js';
import { resolveCapabilities, inferCapabilityIds } from './capability-registry.js';
import { validateComponentData, validateAssetRefs, formatIssues } from './validate-manifest.js';
import { validateReferences } from './validate-references.js';

// ═══════════════════════════════════════════════════════════════
//  Manifest 加载器 —— studio「导出 manifest」的逆运算
//
//  规范 manifest(单一数据格式)= { capabilities: string[](能力id), entities: {id:{Comp:data}} }，
//  正是 studio exportManifest 产出的形状。parseManifest 把它泡发回可被 engine.load 的 WorldBlueprint：
//  id → 能力对象(注册表)，entities 原样(纯数据)。导出能再导入 = 对称闭环。
//  这就是「游戏=数据」的临门一脚：AI / 预设 / 手改 产出的同一种数据，引擎直接跑。
// ═══════════════════════════════════════════════════════════════

export interface Manifest {
  capabilities?: string[];
  entities: Record<string, Record<string, unknown>>;
}

export interface ParseResult {
  blueprint: WorldBlueprint;
  inferredCapabilities: boolean;
  warnings: string[];
}

function fail(msg: string): never {
  throw new Error(`manifest: ${msg}`);
}

export interface ParseOptions {
  /** 资产清单里所有已注册的 key（AssetIndex.assets[].id 等）。提供则对 `assetKey` 字段加载期硬校验（R9 增益 A）。 */
  assetKeys?: ReadonlySet<string>;
}

/** 校验 + 加载规范 manifest → 可运行 WorldBlueprint（带推断/告警信息）。 */
export function parseManifestDetailed(raw: unknown, opts: ParseOptions = {}): ParseResult {
  if (typeof raw !== 'object' || raw === null) fail('根必须是对象');
  const obj = raw as Record<string, unknown>;

  const ent = obj.entities;
  if (Array.isArray(ent)) fail('entities 是数组——疑似旧生成格式，需先转成 { 实体id: { 组件名: 数据 } } 对象');
  if (typeof ent !== 'object' || ent === null) fail('entities 必须是 { 实体id: { 组件名: 数据 } } 对象');

  const srcEntities = ent as Record<string, unknown>;
  const entities: Record<string, EntityBlueprint> = {};
  for (const [eid, comps] of Object.entries(srcEntities)) {
    if (typeof comps !== 'object' || comps === null || Array.isArray(comps)) {
      fail(`实体 "${eid}" 必须是 { 组件名: 数据 } 对象`);
    }
    const cleaned: Record<string, unknown> = {};
    for (const [ctype, data] of Object.entries(comps as Record<string, unknown>)) {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        fail(`实体 "${eid}" 的组件 "${ctype}" 必须是对象`);
      }
      // 组件数据里的 type 字段冗余(类型由键决定)，剥掉以免与引擎内部表示打架。
      const { type: _drop, ...rest } = data as Record<string, unknown>;
      cleaned[ctype] = rest;
    }
    entities[eid] = cleaned as EntityBlueprint;
  }

  const warnings: string[] = [];
  let inferred = false;
  let capIds: string[];
  const rawCaps = obj.capabilities;
  if (rawCaps !== undefined && !Array.isArray(rawCaps)) fail('capabilities 必须是 capability id 字符串数组');
  if (Array.isArray(rawCaps) && rawCaps.length > 0) {
    if (!rawCaps.every((c) => typeof c === 'string')) fail('capabilities 必须全是字符串 id');
    capIds = rawCaps as string[];
  } else {
    capIds = inferCapabilityIds(entities as Record<string, Record<string, unknown>>);
    inferred = true;
    warnings.push(
      `未声明 capabilities，已据组件类型推断 ${capIds.length} 个；仅含"提供组件"的能力，行为类系统(如运动/碰撞)可能需显式补全`,
    );
  }

  const capabilities = resolveCapabilities(capIds);

  // 体检：用了某组件却无任何 capability 提供它 → 该组件大概率不被解释（渲染/行为缺失）。
  const provided = new Set<string>();
  for (const c of capabilities) for (const t of Object.keys(c.components?.provides ?? {})) provided.add(t);
  const missing = new Set<string>();
  for (const comps of Object.values(entities)) {
    for (const t of Object.keys(comps)) if (!provided.has(t)) missing.add(t);
  }
  if (missing.size) {
    warnings.push(`这些组件无对应 provider capability（可能不被解释）：${[...missing].join(', ')}`);
  }

  // R12：用各能力声明的 fields 校验组件数据——字段拼错（warning）/ 基元类型不符（error，拒绝加载）。
  const schema = validateComponentData(capabilities, entities);
  for (const w of schema.warnings) warnings.push(formatIssues([w]));
  if (schema.errors.length) fail(`组件数据类型错误（${schema.errors.length} 处）—— ${formatIssues(schema.errors)}`);

  // P0 引用链接器：id 交叉引用体检（信号链 / 全局 id / 模板 / 图内跳转）。全部 warning——
  // id 可在运行时合法出现（prefab 展开 / 代码侧注入），链接器是体检报告，不是闸门。
  for (const w of validateReferences(entities)) warnings.push(formatIssues([w]));

  // R9 增益 A：资产 key 硬校验（opt-in——仅当提供 assetKeys 集合时才查，未知 key 拒绝加载，防 AI 编造）。
  if (opts.assetKeys) {
    const assetErrors = validateAssetRefs(capabilities, entities, opts.assetKeys);
    if (assetErrors.length) fail(`资产引用错误（${assetErrors.length} 处）—— ${formatIssues(assetErrors)}`);
  }

  return { blueprint: { capabilities, entities }, inferredCapabilities: inferred, warnings };
}

/** 便捷版：只取可运行蓝图。 */
export function parseManifest(raw: unknown, opts?: ParseOptions): WorldBlueprint {
  return parseManifestDetailed(raw, opts).blueprint;
}
