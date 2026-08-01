// @vitest-environment happy-dom
// 华丽起手包守卫（owner 2026-07「起手默认华丽」）：两屏 builder 合法 LayoutNode（零 issue）+ 用上成熟件 + house 主题。
import { describe, it, expect } from 'vitest';
import { validateLayoutNode, type LayoutNode } from '@ui/components/index.js';
import { STARTER_THEME, buildStarterHome, buildStarterResult } from './index.js';
import { apolloToon } from '@ui/apollo-toon-theme.js';

function types(node: LayoutNode, acc = new Set<string>()): Set<string> {
  acc.add(node.type);
  for (const c of node.children ?? []) types(c, acc);
  return acc;
}

describe('华丽起手包 · Starter Kit', () => {
  it('起手主题 = apollo-toon house 主题（别从零写皮）·带糖果 buttonSkins', () => {
    expect(STARTER_THEME).toBe(apolloToon);
    expect(STARTER_THEME.buttonSkins?.hero?.skin).toBeTruthy();
  });

  it('① 主菜单是合法 LayoutNode + 用上成熟件（糖果钮/环境粒子/衬线标题/悬停流光）', () => {
    const node = buildStarterHome({
      title: '魔法方块', subtitle: '三消解谜 · 收集星星',
      actions: [{ label: '开始', action: 'play' }, { label: '选关', action: 'select' }, { label: '设置', action: 'settings', kind: 'quiet' }],
    });
    expect(validateLayoutNode(node)).toEqual([]);
    const t = types(node);
    expect(t.has('Particles')).toBe(true); // 环境微光=juice
    expect(t.has('Button')).toBe(true);
    expect(node.props).toMatchObject({ fill: true }); // 填满宿主盒·去底部空白
    // 首键=hero（金糖大 CTA）+ 悬停流光
    const hero = node.children![2].children![0] as LayoutNode;
    expect((hero.props as { kind: string }).kind).toBe('hero');
    expect((hero.layout as { fx?: unknown[] }).fx?.length).toBe(1);
  });

  it('② 结算屏是合法 LayoutNode + 星级/庆祝粒子/数字格式化', () => {
    for (const s of [
      { stars: 3, score: 12340, hasNext: true },
      { stars: 1, score: 800, hasNext: false, title: '过关' },
    ]) {
      const node = buildStarterResult(s);
      expect(validateLayoutNode(node)).toEqual([]);
      const t = types(node);
      expect(t.has('Rating')).toBe(true);
      expect(t.has('Particles')).toBe(true);
      expect(!!findId(node, 'starter-res-next')).toBe(s.hasNext);
    }
    // 星级钳制到 0..3
    const over = buildStarterResult({ stars: 9, score: 1 });
    expect((findId(over, 'starter-res-stars')!.props as { value: number }).value).toBe(3);
  });
});

function findId(node: LayoutNode, id: string): LayoutNode | null {
  if (node.id === id) return node;
  for (const c of node.children ?? []) { const h = findId(c, id); if (h) return h; }
  return null;
}
