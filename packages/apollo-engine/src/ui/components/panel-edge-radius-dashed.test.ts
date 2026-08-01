// REQ-UI-容器描边形（主程 2026-06-28·接 owner 插播优先）：Panel.edge 语义/阵营描边色 + LayoutConstraints.radius
// 圆角覆盖 + Panel.dashed 虚线边——棋盘城堡阵营框 / 金边界格 / 虚线落点圈数据化所需。闭集令牌·主题解析·非自由 CSS。
import { describe, it, expect } from 'vitest';
import { renderNode } from './render.js';
import { SHELL } from '../shell-theme.js';
import { validateLayoutNode } from './validate.js';
import type { LayoutNode, UITheme } from './types.js';

const panel = (props: Record<string, unknown>, layout?: Record<string, unknown>): LayoutNode =>
  ({ type: 'Panel', id: 'p', props, layout, children: [] } as LayoutNode);

describe('UI Components · Panel.edge 描边语义/阵营色', () => {
  it('edge=gold → 金色描边（覆盖默认线）', () => {
    const html = renderNode(panel({ edge: 'gold' }), SHELL);
    expect(html).toContain(`border:1px solid ${SHELL.gold}`);
    expect(html).not.toContain(`border:1px solid ${SHELL.line}`);
  });

  it('edge=danger → danger 描边', () => {
    expect(renderNode(panel({ edge: 'danger' }), SHELL)).toContain(`border:1px solid ${SHELL.danger}`);
  });

  it('edge=mine 主题未定义 → 回退暖色 warn', () => {
    expect(renderNode(panel({ edge: 'mine' }), SHELL)).toContain(`border:1px solid ${SHELL.warn}`);
  });

  it('edge=foe 主题未定义 → 回退冷色 jadeLine', () => {
    expect(renderNode(panel({ edge: 'foe' }), SHELL)).toContain(`border:1px solid ${SHELL.jadeLine}`);
  });

  it('主题定义 mine/foe → 取阵营令牌（game-g 我橙/敌蓝）', () => {
    const battle: UITheme = { ...SHELL, mine: '#ff7a45', foe: '#3a86d4' };
    expect(renderNode(panel({ edge: 'mine' }), battle)).toContain('border:1px solid #ff7a45');
    expect(renderNode(panel({ edge: 'foe' }), battle)).toContain('border:1px solid #3a86d4');
  });

  it('edge 优先于 accent（都给时取 edge 色）', () => {
    const html = renderNode(panel({ edge: 'gold', accent: true }), SHELL);
    expect(html).toContain(`border:1px solid ${SHELL.gold}`);
    expect(html).not.toContain(`border:1px solid ${SHELL.jadeLine}`); // accent 的 jade 被 edge 覆盖
  });
});

describe('UI Components · Panel.dashed 虚线边', () => {
  it('dashed=true → border-style:dashed（配 edge 取色）', () => {
    const html = renderNode(panel({ edge: 'gold', dashed: true }), SHELL);
    expect(html).toContain(`border:1px dashed ${SHELL.gold}`);
  });

  it('缺省 → solid', () => {
    expect(renderNode(panel({ edge: 'gold' }), SHELL)).toContain('border:1px solid');
  });
});

describe('UI Components · LayoutConstraints.radius 圆角覆盖', () => {
  it('radius=3 → border-radius:3px（覆盖恒 10·城垛/盾小件）', () => {
    expect(renderNode(panel({}, { radius: 3 }), SHELL)).toContain('border-radius:3px');
  });

  it('缺省 → border-radius:10px', () => {
    const html = renderNode(panel({}), SHELL);
    expect(html).toContain('border-radius:10px');
    expect(html).not.toContain('border-radius:3px');
  });

  it('radius 同步到 vignette / pattern 叠层（叠层圆角跟随面板·不露直角）', () => {
    const html = renderNode(panel({ vignette: true, pattern: 'stripe' }, { radius: 20 }), SHELL);
    // 面板 + vignette + pattern 三处圆角都应是 20px（不再硬编码 10）。
    const m = html.match(/border-radius:20px/g) ?? [];
    expect(m.length).toBeGreaterThanOrEqual(3);
  });

  it('radius 防注入（非数字 → 0）', () => {
    expect(renderNode(panel({}, { radius: '5px;background:url(x)' as unknown as number }), SHELL)).toContain('border-radius:0px');
  });
});

describe('UI Components · validate 收 edge 闭集', () => {
  it('合法 edge 值通过', () => {
    for (const e of ['jade', 'gold', 'ok', 'warn', 'danger', 'mine', 'foe']) {
      expect(validateLayoutNode(panel({ edge: e })).filter((i) => i.kind === 'bad-enum')).toHaveLength(0);
    }
  });

  it('非法 edge 值 → bad-enum', () => {
    const issues = validateLayoutNode(panel({ edge: 'purple' }));
    expect(issues.some((i) => i.kind === 'bad-enum' && i.detail.includes('edge'))).toBe(true);
  });
});
