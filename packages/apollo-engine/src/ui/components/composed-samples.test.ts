// 组合页面 sample 集验收（owner 2026-06-26）：整页范例必须自洽合法（过校验器）——才配当弱模型的「怎么搭整页」参考。
import { describe, it, expect } from 'vitest';
import { COMPOSED_SAMPLES } from './composed-samples.js';
import { validateLayoutNode } from './validate.js';
import { renderNode } from './render.js';

describe('UI 组合页面 sample 集（整页范例·喂 LLM）', () => {
  it('每个组合范例都过校验器（零 issue·整页也是合法数据）', () => {
    for (const s of COMPOSED_SAMPLES) {
      const issues = validateLayoutNode(s.tree);
      expect(issues, `${s.name}: ${JSON.stringify(issues)}`).toEqual([]);
    }
  });

  it('每个组合范例都能渲染（不崩·出真内容）', () => {
    for (const s of COMPOSED_SAMPLES) {
      expect(renderNode(s.tree).length, s.name).toBeGreaterThan(80);
    }
  });

  it('节点 id 树内唯一（mountUI diff 需要·无重复）', () => {
    const collect = (n: { id?: string; children?: unknown[] }, acc: string[]): void => {
      if (n.id) acc.push(n.id);
      (n.children as { id?: string; children?: unknown[] }[] | undefined)?.forEach((c) => collect(c, acc));
    };
    for (const s of COMPOSED_SAMPLES) {
      const ids: string[] = [];
      collect(s.tree, ids);
      expect(new Set(ids).size, `${s.name} 有重复 id`).toBe(ids.length);
    }
  });

  it('覆盖一组常见整页模式（命名 + 数量）', () => {
    const names = COMPOSED_SAMPLES.map((s) => s.name);
    for (const n of ['main-menu', 'settings', 'collection-grid', 'confirm-dialog', 'leaderboard', 'shop', 'hud-bar']) {
      expect(names, `缺范例 ${n}`).toContain(n);
    }
    expect(COMPOSED_SAMPLES.length).toBeGreaterThanOrEqual(7);
  });
});
