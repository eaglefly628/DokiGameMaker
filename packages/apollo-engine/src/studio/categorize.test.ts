import { describe, it, expect } from 'vitest';
import {
  entityDomain,
  groupByDomain,
  filterEntities,
  capabilityKnobs,
  DOMAIN_RULES,
} from './categorize.js';
import type { InspectedEntity, InspectedField } from './inspect.js';
import type { CapabilityDefinition } from '@engine/core/define-capability.js';

// 终端实体夹具：只给 id + 组件类型(字段空)。
function ent(id: string, ...types: string[]): InspectedEntity {
  return { id, components: types.map((type) => ({ type, fields: [] })) };
}
// 带字段的实体（搜索测试用）。
function entWith(id: string, type: string, fields: Array<[string, unknown]>): InspectedEntity {
  const fs: InspectedField[] = fields.map(([key, value]) => ({ key, value, kind: 'string' }));
  return { id, components: [{ type, fields: fs }] };
}

describe('entityDomain — 按组件签名归域，首个命中胜', () => {
  it('有 Hitbox → 单位', () => {
    expect(entityDomain(ent('hero1', 'Transform', 'Hitbox', 'Resource')).id).toBe('unit');
  });
  it('单位优先级高于文字：Hitbox + Text → 单位(非文字)', () => {
    expect(entityDomain(ent('hero1', 'Hitbox', 'Text', 'Color')).id).toBe('unit');
  });
  it('纯 Resource → 经济', () => {
    expect(entityDomain(ent('gold', 'Resource')).id).toBe('economy');
  });
  it('纯 Text → 文字/名牌', () => {
    expect(entityDomain(ent('title', 'Text', 'Color')).id).toBe('text');
  });
  it('Tray → 席位/拖放', () => {
    expect(entityDomain(ent('bench', 'Tray')).id).toBe('slot');
  });
  it('CardPile → 牌库/商店', () => {
    expect(entityDomain(ent('shop', 'CardPile')).id).toBe('card');
  });
  it('HexBoard → 棋盘', () => {
    expect(entityDomain(ent('board', 'HexBoard')).id).toBe('board');
  });
  it('都不中 → 兜底 misc', () => {
    expect(entityDomain(ent('deco', 'Transform', 'Shape', 'Sprite')).id).toBe('misc');
  });
});

describe('groupByDomain — 分组、保序、空域不产出', () => {
  it('按 DOMAIN_RULES 顺序产出非空域', () => {
    const groups = groupByDomain([
      ent('gold', 'Resource'),
      ent('hero1', 'Hitbox'),
      ent('hero2', 'Hitbox'),
      ent('title', 'Text'),
    ]);
    // unit 在 economy 之前(规则顺序)
    expect(groups.map((g) => g.rule.id)).toEqual(['unit', 'text', 'economy']);
    expect(groups.find((g) => g.rule.id === 'unit')!.entities).toHaveLength(2);
  });
  it('空输入 → 空分组', () => {
    expect(groupByDomain([])).toEqual([]);
  });
  it('每个实体只归一个域(计数守恒)', () => {
    const ents = [ent('a', 'Hitbox'), ent('b', 'Resource'), ent('c', 'Text'), ent('d', 'Transform')];
    const total = groupByDomain(ents).reduce((n, g) => n + g.entities.length, 0);
    expect(total).toBe(ents.length);
  });
});

describe('filterEntities — id/组件/字段名/字段值全文，AND 全命中', () => {
  const ents = [
    entWith('player_hero', 'Resource', [['id', 'hp'], ['current', 100]]),
    entWith('gold_pool', 'Resource', [['id', 'gold'], ['current', 5]]),
    entWith('title_text', 'Text', [['content', '三国自走棋']]),
  ];
  it('空查询 → 全部', () => {
    expect(filterEntities(ents, '')).toHaveLength(3);
  });
  it('命中实体 id', () => {
    expect(filterEntities(ents, 'gold').map((e) => e.id)).toEqual(['gold_pool']);
  });
  it('命中字段值', () => {
    expect(filterEntities(ents, 'hp').map((e) => e.id)).toEqual(['player_hero']);
  });
  it('命中组件类型', () => {
    expect(filterEntities(ents, 'text').map((e) => e.id)).toEqual(['title_text']);
  });
  it('多词 AND：都要命中', () => {
    expect(filterEntities(ents, 'resource gold').map((e) => e.id)).toEqual(['gold_pool']);
    expect(filterEntities(ents, 'resource 三国')).toHaveLength(0);
  });
});

describe('capabilityKnobs — 从引擎自描述提取可配置字段', () => {
  const cap = {
    id: 't-test',
    describe: { name: '测试能力', summary: '做测试', semantic: [], whenToUse: '', examples: [] },
    components: {
      provides: {
        Foo: {
          category: 'config',
          describe: 'Foo 组件',
          fields: { x: { type: 'number', describe: '横坐标' }, name: { type: 'string', describe: '名字' } },
        },
      },
      reads: [],
      writes: [],
      consumes: [],
    },
    config: {},
    systems: [],
  } as unknown as CapabilityDefinition;

  const emptyCap = {
    id: 't-empty',
    describe: { name: '空', summary: '', semantic: [], whenToUse: '', examples: [] },
    components: { provides: {}, reads: [], writes: [], consumes: [] },
    config: {},
    systems: [],
  } as unknown as CapabilityDefinition;

  it('提取能力→组件→字段(类型+人话)', () => {
    const [k] = capabilityKnobs([cap]);
    expect(k.name).toBe('测试能力');
    expect(k.components[0].type).toBe('Foo');
    expect(k.components[0].fields.map((f) => `${f.key}:${f.type}`)).toEqual(['x:number', 'name:string']);
    expect(k.components[0].fields[0].describe).toBe('横坐标');
  });
  it('无组件的能力被略过', () => {
    expect(capabilityKnobs([cap, emptyCap]).map((k) => k.id)).toEqual(['t-test']);
  });
});

describe('DOMAIN_RULES 约定', () => {
  it('最后一条是兜底 misc(anyOf 空)', () => {
    const last = DOMAIN_RULES[DOMAIN_RULES.length - 1];
    expect(last.id).toBe('misc');
    expect(last.anyOf).toHaveLength(0);
  });
  it('域 id 唯一', () => {
    const ids = DOMAIN_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
