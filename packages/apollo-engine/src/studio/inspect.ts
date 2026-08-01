import type { WorldBlueprint, EntityBlueprint } from '../assembly/demo.assembly.js';
import type { CapabilityDefinition, ComponentSchema, FieldType } from '@engine/core/define-capability.js';
import type { AssetIndex, AssetStatus, AssetType } from '@assets/index.js';

// ═══════════════════════════════════════════════════════════════
//  游戏数据透视器 · 纯逻辑核心 (Data Inspector — pure core)
//
//  ⛔ 第一性原则：游戏=数据。本模块把一份 WorldBlueprint(那份"数据")
//  摊平成可视、可改的结构，并用引擎 capability 的**自描述元数据**
//  (defineCapability.components.provides[Type].fields) 给每个字段标注
//  类型 + 人话说明。没有 DOM / React / 引擎运行依赖 → 可单测。
// ═══════════════════════════════════════════════════════════════

/** 字段的运行时种类（决定 UI 用哪种编辑器）。'json' = 嵌套对象/数组，走原始 JSON 编辑。 */
export type FieldKind = 'number' | 'string' | 'boolean' | 'json';

export interface InspectedField {
  key: string;
  value: unknown;
  kind: FieldKind;
  /** 来自 capability 自描述的声明类型（若该组件被某 capability 登记）。 */
  declaredType?: FieldType;
  /** 来自 capability 自描述的字段说明（人话）。 */
  describe?: string;
}

export interface InspectedComponent {
  type: string;
  /** 来自 capability schema：组件语义类别（resource/event/render/...）。 */
  category?: string;
  describe?: string;
  /** 提供此组件的 capability id（数据→哪台引擎能力解释它）。 */
  capabilityId?: string;
  fields: InspectedField[];
}

export interface InspectedEntity {
  id: string;
  components: InspectedComponent[];
}

export interface SchemaEntry {
  schema: ComponentSchema;
  capabilityId: string;
}

/**
 * 扫描蓝图启用的全部 capability，建立 组件类型 → schema 的索引。
 * 同一组件被多个 capability 提供时，先登记者胜（provides 通常各管各的）。
 */
export function buildSchemaRegistry(caps: readonly CapabilityDefinition[]): Map<string, SchemaEntry> {
  const reg = new Map<string, SchemaEntry>();
  for (const cap of caps) {
    const provides = cap.components?.provides ?? {};
    for (const [type, schema] of Object.entries(provides)) {
      if (!reg.has(type)) reg.set(type, { schema, capabilityId: cap.id });
    }
  }
  return reg;
}

function kindOf(v: unknown): FieldKind {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'string') return 'string';
  return 'json';
}

// 值缺省(undefined/null，如可选的 Tween.loops)时 kindOf 会落到 'json' →
// JSON.stringify(undefined)===undefined → 编辑器 buf 为 undefined → 崩(白屏)。
// 改用 schema 声明类型挑编辑器，挑不出就当字符串（空值可填）。
function fieldKind(v: unknown, declared?: FieldType): FieldKind {
  if (v !== undefined && v !== null) return kindOf(v);
  if (declared === 'number') return 'number';
  if (declared === 'boolean') return 'boolean';
  return 'string';
}

/** 把蓝图摊平成 实体 → 组件 → 字段 的可视结构，并贴上 capability 自描述元数据。 */
export function inspectBlueprint(bp: WorldBlueprint): InspectedEntity[] {
  const reg = buildSchemaRegistry(bp.capabilities);
  return Object.entries(bp.entities).map(([id, comps]) => ({
    id,
    components: Object.entries(comps).map(([type, data]) => {
      const entry = reg.get(type);
      const fields = Object.entries(data as Record<string, unknown>).map(([key, value]) => {
        const declaredType = entry?.schema.fields[key]?.type;
        return {
          key,
          value,
          kind: fieldKind(value, declaredType),
          declaredType,
          describe: entry?.schema.fields[key]?.describe,
        };
      });
      return {
        type,
        category: entry?.schema.category,
        describe: entry?.schema.describe,
        capabilityId: entry?.capabilityId,
        fields,
      };
    }),
  }));
}

export interface BlueprintStats {
  entities: number;
  components: number;
  capabilities: number;
}

export function blueprintStats(bp: WorldBlueprint): BlueprintStats {
  let components = 0;
  for (const comps of Object.values(bp.entities)) {
    components += Object.keys(comps).length;
  }
  return {
    entities: Object.keys(bp.entities).length,
    components,
    capabilities: bp.capabilities.length,
  };
}

export interface CapabilitySummary {
  id: string;
  name: string;
  summary: string;
  provides: string[];
}

export function capabilitySummaries(caps: readonly CapabilityDefinition[]): CapabilitySummary[] {
  return caps.map((c) => ({
    id: c.id,
    name: c.describe?.name ?? c.id,
    summary: c.describe?.summary ?? '',
    provides: Object.keys(c.components?.provides ?? {}),
  }));
}

// ── 美术资产引用 ──────────────────────────────────────────────
// 数据里只持有稳定 key（Sprite.textureKey / Sound.clipId）；把它们扒出来，
// 再和 assets/index.json 对照，告诉策划"这局要哪些美术、填了没"。

export interface AssetRef {
  id: string;
  kind: AssetType;
  /** 引用此资产的实体 id 列表。 */
  usedBy: string[];
}

/** 已知的"组件字段 → 资产类型"映射（数据里资产引用的出现点）。 */
const ASSET_FIELDS: Array<{ field: string; kind: AssetType }> = [
  { field: 'textureKey', kind: 'texture' },
  { field: 'clipId', kind: 'sound' },
];

export function collectAssetRefs(bp: WorldBlueprint): AssetRef[] {
  const map = new Map<string, { kind: AssetType; usedBy: Set<string> }>();
  for (const [entityId, comps] of Object.entries(bp.entities)) {
    for (const data of Object.values(comps as EntityBlueprint)) {
      const d = data as Record<string, unknown>;
      for (const { field, kind } of ASSET_FIELDS) {
        const v = d[field];
        if (typeof v === 'string' && v.length > 0) {
          let entry = map.get(v);
          if (!entry) {
            entry = { kind, usedBy: new Set() };
            map.set(v, entry);
          }
          entry.usedBy.add(entityId);
        }
      }
    }
  }
  return [...map.entries()]
    .map(([id, v]) => ({ id, kind: v.kind, usedBy: [...v.usedBy].sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export interface AssetRefStatus extends AssetRef {
  /** 'missing' = 蓝图引用了但 index 里没有这个 id。 */
  status: AssetStatus | 'missing';
  description?: string;
}

/** 把蓝图引用的资产和资产索引对照 → 每个引用标出 filled/tbf/missing + 描述。 */
export function crossReferenceAssets(refs: readonly AssetRef[], index: AssetIndex | null): AssetRefStatus[] {
  const byId = new Map((index?.assets ?? []).map((a) => [a.id, a]));
  return refs.map((ref) => {
    const entry = byId.get(ref.id);
    return {
      ...ref,
      status: entry ? entry.status : 'missing',
      description: entry?.description,
    };
  });
}

// ── 不可变编辑 ────────────────────────────────────────────────
// 编辑总是产出一份新蓝图（原件不动）→ 可对比 diff、可撤销、可导出。

/** 改某实体某组件的某个顶层字段，返回新蓝图（原件不变）。目标不存在则原样返回。 */
export function setField(
  bp: WorldBlueprint,
  entityId: string,
  componentType: string,
  fieldKey: string,
  value: unknown,
): WorldBlueprint {
  // 通用字段编辑器：按任意 componentType 字符串改 —— 在索引边界按原始蓝图形态(组件名→字段表)处理。
  const entity = bp.entities[entityId] as Record<string, Record<string, unknown>> | undefined;
  if (!entity) return bp;
  const comp = entity[componentType];
  if (!comp) return bp;
  const newComp = { ...structuredClone(comp), [fieldKey]: value };
  return {
    ...bp,
    entities: {
      ...bp.entities,
      [entityId]: { ...entity, [componentType]: newComp },
    },
  };
}

/** 整体替换某组件的数据（嵌套结构走原始 JSON 编辑时用），返回新蓝图。 */
export function setComponentRaw(
  bp: WorldBlueprint,
  entityId: string,
  componentType: string,
  data: Record<string, unknown>,
): WorldBlueprint {
  const entity = bp.entities[entityId] as Record<string, Record<string, unknown>> | undefined;
  if (!entity) return bp;
  return {
    ...bp,
    entities: {
      ...bp.entities,
      [entityId]: { ...entity, [componentType]: data },
    },
  };
}

export interface CoerceResult {
  ok: boolean;
  value: unknown;
  error?: string;
}

/** 把编辑器里的字符串输入按字段种类转回正确的值类型。json 走 JSON.parse。 */
export function coerceValue(raw: string, kind: FieldKind): CoerceResult {
  switch (kind) {
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, value: raw, error: '不是合法数字' };
    }
    case 'boolean':
      return { ok: true, value: raw === 'true' || raw === '1' };
    case 'string':
      return { ok: true, value: raw };
    case 'json':
      try {
        return { ok: true, value: JSON.parse(raw) };
      } catch (e) {
        return { ok: false, value: raw, error: (e as Error).message };
      }
  }
}

/** 导出为规范的纯数据 manifest JSON（capabilities 收敛成 id 列表，便于人读/diff/重建）。 */
export function exportManifest(bp: WorldBlueprint): string {
  return JSON.stringify(
    {
      capabilities: bp.capabilities.map((c) => c.id),
      entities: bp.entities,
    },
    null,
    2,
  );
}
