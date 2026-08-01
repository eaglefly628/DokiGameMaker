import type { CapabilityDefinition } from '@engine/core/define-capability.js';
import type { EntityBlueprint } from './demo.assembly.js';
import type { AssetIndex, AssetIndexEntry, AssetType } from '@assets/index.js';
import { ASSET_TYPES } from '@assets/index.js';

// ═══════════════════════════════════════════════════════════════
//  从蓝图自动派生资产清单（R9 §3，"甲"）。
//  扫一份蓝图里所有 `assetKey` 类型字段的值 = 这局游戏引用的全部资产 key，
//  逐个列成 tbf（待填充）AssetIndex 条目 = "这局还差哪些美术/音频"的购物单。
//
//  关键红利：清单与游戏逻辑**同源**（都来自同一份蓝图的引用）→ 逻辑写的 textureKey 与资产清单的 id
//  天生对齐，根除"逻辑 hero_idle / 资产 hero_idel"这类漂移。AI 只产一份蓝图，引擎自动算出它要的资产。
//  纯函数、无 I/O → 可测、确定。资产类型按字段声明的 assetType 归类（sprite→texture / sound→sound）。
// ═══════════════════════════════════════════════════════════════

export interface AssetRef {
  key: string;
  assetType: AssetType;
  component: string;
  field: string;
}

// 组件类型 → (assetKey 字段名 → 资产类型)。从各能力 provides 的字段声明派生。
function assetKeyFields(capabilities: readonly CapabilityDefinition[]): Map<string, Map<string, AssetType>> {
  const out = new Map<string, Map<string, AssetType>>();
  for (const cap of capabilities) {
    for (const [ctype, schema] of Object.entries(cap.components?.provides ?? {})) {
      for (const [fname, f] of Object.entries(schema.fields ?? {})) {
        if (f.type !== 'assetKey') continue;
        const at = f.assetType && (ASSET_TYPES as readonly string[]).includes(f.assetType) ? (f.assetType as AssetType) : 'texture';
        let m = out.get(ctype);
        if (!m) {
          m = new Map();
          out.set(ctype, m);
        }
        m.set(fname, at);
      }
    }
  }
  return out;
}

/** 扫蓝图实体，收集所有被引用的资产 key（去重，按声明的 assetType 归类）。 */
export function collectAssetRefs(capabilities: readonly CapabilityDefinition[], entities: Record<string, EntityBlueprint>): AssetRef[] {
  const fields = assetKeyFields(capabilities);
  const refs: AssetRef[] = [];
  const seen = new Set<string>();
  for (const comps of Object.values(entities)) {
    for (const [ctype, data] of Object.entries(comps as Record<string, unknown>)) {
      const fm = fields.get(ctype);
      if (!fm || typeof data !== 'object' || data === null) continue;
      for (const [fname, at] of fm) {
        const v = (data as Record<string, unknown>)[fname];
        if (typeof v === 'string' && v.length > 0 && !seen.has(v)) {
          seen.add(v);
          refs.push({ key: v, assetType: at, component: ctype, field: fname });
        }
      }
    }
  }
  return refs;
}

/**
 * 从蓝图派生 tbf 资产清单（购物单）。
 * 给 existing（如策展库/已填充清单）则：引用到的 key 若已有条目就保留（含 filled），否则列为 tbf；
 * 未被引用的既有条目不进结果（这是"本局所需"清单，非全库）。
 */
export function deriveAssetIndex(
  capabilities: readonly CapabilityDefinition[],
  entities: Record<string, EntityBlueprint>,
  opts: { version?: number; existing?: AssetIndex } = {},
): AssetIndex {
  const refs = collectAssetRefs(capabilities, entities);
  const have = new Map<string, AssetIndexEntry>();
  for (const e of opts.existing?.assets ?? []) have.set(e.id, e);
  const assets: AssetIndexEntry[] = refs.map((r) => {
    const existing = have.get(r.key);
    if (existing) return existing; // 保留已有条目（含已 filled 的真资产）
    return { id: r.key, type: r.assetType, status: 'tbf', description: `${r.component}.${r.field} 引用（自动派生，待填充）` };
  });
  return { version: opts.existing?.version ?? opts.version ?? 1, assets };
}
