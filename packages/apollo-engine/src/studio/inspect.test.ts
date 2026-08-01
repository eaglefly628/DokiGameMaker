import { describe, it, expect } from 'vitest';
import type { CapabilityDefinition } from '@engine/core/define-capability.js';
import type { WorldBlueprint } from '../assembly/demo.assembly.js';
import { demoBlueprint } from '../assembly/demo.assembly.js';
import {
  buildSchemaRegistry,
  inspectBlueprint,
  blueprintStats,
  capabilitySummaries,
  collectAssetRefs,
  crossReferenceAssets,
  setField,
  setComponentRaw,
  coerceValue,
  exportManifest,
} from './inspect.js';

// 受控的 capability 夹具 —— 不依赖真实能力的内部 schema，测元数据贴合逻辑。
const fakeCap: CapabilityDefinition = {
  id: 'test-cap',
  version: '1.0.0',
  describe: { name: 'Test Cap', summary: '一个测试能力', semantic: [], whenToUse: '', examples: [] },
  components: {
    provides: {
      Resource: {
        category: 'resource',
        describe: '生命值组件',
        fields: {
          current: { type: 'number', describe: '当前血量' },
          max: { type: 'number', describe: '血量上限' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },
  config: {},
  systems: [],
};

const sampleBp: WorldBlueprint = {
  capabilities: [fakeCap],
  entities: {
    hero: {
      Resource: { current: 10, max: 100 },
      Transform: { x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 },
    },
  },
};

describe('buildSchemaRegistry', () => {
  it('索引 capability 提供的组件 schema', () => {
    const reg = buildSchemaRegistry([fakeCap]);
    expect(reg.get('Resource')?.capabilityId).toBe('test-cap');
    expect(reg.get('Resource')?.schema.category).toBe('resource');
    expect(reg.has('Transform')).toBe(false); // 无能力提供
  });
});

describe('inspectBlueprint', () => {
  it('摊平为 实体→组件→字段，并贴合 schema 元数据', () => {
    const out = inspectBlueprint(sampleBp);
    expect(out).toHaveLength(1);
    const hero = out[0];
    expect(hero.id).toBe('hero');

    const health = hero.components.find((c) => c.type === 'Resource')!;
    expect(health.category).toBe('resource');
    expect(health.describe).toBe('生命值组件');
    expect(health.capabilityId).toBe('test-cap');
    const current = health.fields.find((f) => f.key === 'current')!;
    expect(current.value).toBe(10);
    expect(current.kind).toBe('number');
    expect(current.declaredType).toBe('number');
    expect(current.describe).toBe('当前血量');

    // 无 schema 的组件：字段种类靠运行时值推断，元数据缺省。
    const transform = hero.components.find((c) => c.type === 'Transform')!;
    expect(transform.category).toBeUndefined();
    expect(transform.fields.find((f) => f.key === 'x')!.kind).toBe('number');
  });

  it('能处理真实 demoBlueprint 而不抛错', () => {
    const out = inspectBlueprint(demoBlueprint);
    expect(out.map((e) => e.id).sort()).toEqual(['bullet', 'wall']);
  });
});

describe('blueprintStats', () => {
  it('统计实体/组件/能力数', () => {
    expect(blueprintStats(sampleBp)).toEqual({ entities: 1, components: 2, capabilities: 1 });
  });
});

describe('capabilitySummaries', () => {
  it('提取 id/名称/摘要/提供的组件', () => {
    const [s] = capabilitySummaries([fakeCap]);
    expect(s.id).toBe('test-cap');
    expect(s.name).toBe('Test Cap');
    expect(s.provides).toEqual(['Resource']);
  });
});

describe('collectAssetRefs', () => {
  it('从 Sprite.textureKey 扒出资产引用', () => {
    const refs = collectAssetRefs(demoBlueprint);
    const bullet = refs.find((r) => r.id === 'bullet')!;
    expect(bullet.kind).toBe('texture');
    expect(bullet.usedBy).toContain('bullet'); // 实体 id 恰也叫 bullet
  });

  it('聚合同一资产的多个使用者', () => {
    const bp: WorldBlueprint = {
      capabilities: [],
      entities: {
        a: { Sprite: { textureKey: 'shared', anchorX: 0.5, anchorY: 0.5, zOrder: 0 } },
        b: { Sprite: { textureKey: 'shared', anchorX: 0.5, anchorY: 0.5, zOrder: 0 } },
      },
    };
    const refs = collectAssetRefs(bp);
    expect(refs).toHaveLength(1);
    expect(refs[0].usedBy).toEqual(['a', 'b']);
  });
});

describe('crossReferenceAssets', () => {
  it('对照资产索引标出 filled/tbf/missing', () => {
    const refs = collectAssetRefs(demoBlueprint);
    const out = crossReferenceAssets(refs, {
      version: 1,
      assets: [{ id: 'bullet', type: 'texture', description: '子弹贴图', status: 'tbf' }],
    });
    expect(out.find((r) => r.id === 'bullet')!.status).toBe('tbf');
    expect(out.find((r) => r.id === 'bullet')!.description).toBe('子弹贴图');
  });

  it('无索引时全部 missing', () => {
    const refs = collectAssetRefs(demoBlueprint);
    const out = crossReferenceAssets(refs, null);
    expect(out.every((r) => r.status === 'missing')).toBe(true);
  });
});

describe('setField (不可变编辑)', () => {
  it('改字段产出新蓝图，原件不动', () => {
    const next = setField(sampleBp, 'hero', 'Resource', 'current', 999);
    expect((next.entities.hero.Resource as Record<string, unknown>).current).toBe(999);
    expect((sampleBp.entities.hero.Resource as Record<string, unknown>).current).toBe(10); // 原件不变
  });

  it('目标不存在时原样返回', () => {
    expect(setField(sampleBp, 'nope', 'Resource', 'current', 1)).toBe(sampleBp);
    expect(setField(sampleBp, 'hero', 'Nope', 'current', 1)).toBe(sampleBp);
  });
});

describe('setComponentRaw', () => {
  it('整体替换组件数据，原件不动', () => {
    const next = setComponentRaw(sampleBp, 'hero', 'Resource', { current: 5, max: 5 });
    expect(next.entities.hero.Resource).toEqual({ current: 5, max: 5 });
    expect((sampleBp.entities.hero.Resource as Record<string, unknown>).max).toBe(100);
  });
});

describe('coerceValue', () => {
  it('number', () => {
    expect(coerceValue('42', 'number')).toEqual({ ok: true, value: 42 });
    expect(coerceValue('abc', 'number').ok).toBe(false);
  });
  it('boolean', () => {
    expect(coerceValue('true', 'boolean').value).toBe(true);
    expect(coerceValue('false', 'boolean').value).toBe(false);
  });
  it('string', () => {
    expect(coerceValue('hi', 'string')).toEqual({ ok: true, value: 'hi' });
  });
  it('json', () => {
    expect(coerceValue('[1,2,3]', 'json')).toEqual({ ok: true, value: [1, 2, 3] });
    expect(coerceValue('{bad', 'json').ok).toBe(false);
  });
});

describe('exportManifest', () => {
  it('capabilities 收敛成 id 列表，entities 原样', () => {
    const json = JSON.parse(exportManifest(sampleBp));
    expect(json.capabilities).toEqual(['test-cap']);
    expect(json.entities.hero.Resource).toEqual({ current: 10, max: 100 });
  });
});
