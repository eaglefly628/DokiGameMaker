// 组合压力测试：MMO HUD 纯 LayoutNode 数据 —— 树结构良构、关键部件齐全、能渲成 HTML（零手写 React）。
import { describe, it, expect } from 'vitest';
import { renderNode } from '@ui/components/index.js';
import type { LayoutNode } from '@ui/components/index.js';
import { buildMmoHud } from './mmo-hud.js';

function ids(n: LayoutNode, acc: string[] = []): string[] {
  acc.push(n.id);
  (n.children ?? []).forEach((c) => ids(c, acc));
  return acc;
}
function types(n: LayoutNode, acc = new Set<string>()): Set<string> {
  acc.add(n.type);
  (n.children ?? []).forEach((c) => types(c, acc));
  return acc;
}

describe('Game I · 组合·MMO HUD（纯数据复现 WoW 风 HUD）', () => {
  const hud = buildMmoHud();

  it('关键 HUD 部件齐全（单位框/动作条/小地图/施法/任务/聊天/经验）', () => {
    const all = ids(hud);
    for (const need of [
      'pf-player', 'pf-target', 'mm-img', 'quest', 'party', 'chat',
      'cast-bar', 'actionbar', 'xp-bar', 'tgt-auras', 'player-buffs', 'pf-combo',
    ]) {
      expect(all, `缺部件 ${need}`).toContain(need);
    }
  });

  it('12 格主动作条 + 5 队伍/玩家单位框 + 8 个 buff/debuff 图标', () => {
    const all = ids(hud);
    expect(all.filter((i) => /^ab-\d+$/.test(i)).length).toBe(12);
    expect(all.filter((i) => /^pf-|^pt-\d/.test(i)).filter((i) => i.endsWith('-hp')).length).toBe(5); // 玩家+目标+3队友
    expect(all.filter((i) => /^au-\d|^pb-\d/.test(i) && /-/.test(i)).filter((i) => i.match(/^(au|pb)-\d$/)).length).toBe(8);
  });

  it('只用闭集控件（无逃生）：仅 ZeroCraft Kit ComponentType', () => {
    const used = types(hud);
    const allowed = new Set(['Panel', 'Label', 'Avatar', 'ProgressBar', 'Badge', 'Image', 'Tabs', 'Input', 'Button', 'Divider']);
    for (const t of used) expect(allowed.has(t), `非预期控件 ${t}`).toBe(true);
  });

  it('能渲成 HTML 字符串（mountUI 路径前置·不抛）', () => {
    const html = renderNode(hud);
    expect(html.length).toBeGreaterThan(2000);
    expect(html).toContain('id="mmo-hud"');
  });
});
