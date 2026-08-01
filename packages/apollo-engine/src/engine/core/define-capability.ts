import type { SystemDeclaration, ComponentType } from './types.js';

export type ComponentCategory = 'resource' | 'event' | 'intent' | 'marker' | 'config' | 'render' | 'effect';
// 'assetKey'：值是资产清单(AssetIndex/Manifest)里的 key，加载期可对清单硬校验，防 AI 编造（R9 增益 A）。
export type FieldType = 'number' | 'string' | 'boolean' | 'EntityId' | 'string[]' | 'number[]' | 'assetKey';

export interface ComponentSchema {
  category: ComponentCategory;
  describe: string;
  fields: Record<string, {
    type: FieldType;
    describe: string;
    // 当 type==='assetKey'：该 key 指向的资产类型（'texture'|'sound'|...）。供"从蓝图派生资产清单"按类型归类。
    assetType?: string;
  }>;
}

export interface CapabilityConfig {
  type: 'number' | 'string' | 'boolean' | 'select';
  default: unknown;
  describe: string;
  question: string;
  ui: {
    control: 'slider' | 'toggle' | 'chips' | 'input';
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
  };
}

export interface CapabilityDefinition {
  id: string;
  version: string;

  describe: {
    name: string;
    summary: string;
    semantic: string[];
    whenToUse: string;
    examples: string[];
  };

  components: {
    provides: Record<ComponentType, ComponentSchema>;
    reads: ComponentType[];
    writes: ComponentType[];
    consumes: ComponentType[];
  };

  config: Record<string, CapabilityConfig>;

  systems: SystemDeclaration[];
}

export function defineCapability(def: CapabilityDefinition): CapabilityDefinition {
  return Object.freeze(def);
}
