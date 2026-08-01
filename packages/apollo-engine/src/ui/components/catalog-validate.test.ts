// UI 自描述目录 + 校验器验收（owner 2026-06-26：给 LayoutNode 也建约束式数据合成的机器）。
// catalog=喂 LLM 的闭 schema + per-控件 sample；validate=挡弱模型废数据。目录自洽（每条 sample 自己合法）是地基。
import { describe, it, expect } from 'vitest';
import { UI_CATALOG } from './catalog.js';
import { validateLayoutNode, isValidLayoutNode } from './validate.js';
import type { ComponentType, LayoutNode } from './types.js';

// 全部 ComponentType（运行时取不到 union·硬列对照；新增组件须同步补目录，否则本测红）。
const ALL_TYPES: ComponentType[] = [
  'Panel', 'Button', 'Label', 'Dropdown', 'Badge', 'Input', 'Divider', 'Checkbox', 'Toggle', 'RadioGroup',
  'Image', 'Screen', 'Slider', 'Table', 'Tabs', 'ProgressBar', 'Tag', 'Modal', 'Toast', 'Tooltip',
  'Card', 'PlayingCard', 'Stepper', 'Segmented', 'Avatar', 'Accordion', 'Rating', 'Combobox', 'Drawer',
  'VirtualList', 'ContextMenu', 'CoinFlip', 'Versus', 'Video', 'Particles', 'LevelPath', 'Float', 'Connector',
];

describe('UI 自描述目录 catalog', () => {
  it('覆盖全部 38 个 ComponentType（无遗漏·校验器/sample 集才完整）', () => {
    const cataloged = new Set(UI_CATALOG.map((s) => s.type));
    expect(ALL_TYPES.filter((t) => !cataloged.has(t))).toEqual([]);
    expect(UI_CATALOG.length).toBe(ALL_TYPES.length); // 无重复
  });

  it('每条 spec 的 sample 自洽合法（校验器零 issue）—— 目录即正确范例集', () => {
    for (const spec of UI_CATALOG) {
      const issues = validateLayoutNode(spec.sample);
      expect(issues, `${spec.type} sample 应合法，实际: ${JSON.stringify(issues)}`).toEqual([]);
    }
  });

  it('每条 spec 有 whenToUse + summary（喂 LLM 的引导文案不空）', () => {
    for (const spec of UI_CATALOG) {
      expect(spec.whenToUse.length, spec.type).toBeGreaterThan(0);
      expect(spec.summary.length, spec.type).toBeGreaterThan(0);
    }
  });
});

describe('UI 校验器 validate（弱模型废数据挡回 + 反馈）', () => {
  it('未知 type → unknown-type', () => {
    expect(validateLayoutNode({ type: 'Blurb' as never, id: 'x', props: {} }).some((i) => i.kind === 'unknown-type')).toBe(true);
  });
  it('缺必填 → missing-required（Button 缺 label）', () => {
    const is = validateLayoutNode({ type: 'Button', id: 'b', props: {} as never });
    expect(is.some((i) => i.kind === 'missing-required' && i.detail.includes('label'))).toBe(true);
  });
  it('错枚举 → bad-enum（Button kind=fancy）', () => {
    const is = validateLayoutNode({ type: 'Button', id: 'b', props: { label: 'x', kind: 'fancy' as never } });
    expect(is.some((i) => i.kind === 'bad-enum' && i.detail.includes('kind'))).toBe(true);
  });
  it('children 规则：Tabs 缺 children / Label 多 children → children-rule', () => {
    expect(validateLayoutNode({ type: 'Tabs', id: 't', props: { tabs: [{ id: 'a', label: 'A' }] } }).some((i) => i.kind === 'children-rule')).toBe(true);
    expect(validateLayoutNode({ type: 'Label', id: 'l', props: { text: 'x' }, children: [{ type: 'Label', id: 'k', props: { text: 'y' } }] }).some((i) => i.kind === 'children-rule')).toBe(true);
  });
  it('缺 id → missing-id', () => {
    expect(validateLayoutNode({ type: 'Label', props: { text: 'x' } } as never).some((i) => i.kind === 'missing-id')).toBe(true);
  });
  it('合法树（递归 children + node 型 props bubble）→ 零 issue', () => {
    const tree: LayoutNode = { type: 'Panel', id: 'p', props: { title: 'X' }, children: [
      { type: 'Button', id: 'b', props: { label: '点', kind: 'primary', action: 'go' } },
      { type: 'Tooltip', id: 'tp', props: { bubble: { type: 'Label', id: 'bl', props: { text: '富气泡' } } }, children: [{ type: 'Badge', id: 'bd', props: { text: '?' } }] },
    ] };
    expect(isValidLayoutNode(tree)).toBe(true);
  });
  it('深层错误带路径（嵌套子节点的坏枚举定位到 path）', () => {
    const tree: LayoutNode = { type: 'Panel', id: 'p', props: {}, children: [
      { type: 'Badge', id: 'bad', props: { text: 'x', tone: 'nope' as never } },
    ] };
    const is = validateLayoutNode(tree);
    expect(is.some((i) => i.kind === 'bad-enum' && i.path === 'root/children[0]')).toBe(true);
  });
});
