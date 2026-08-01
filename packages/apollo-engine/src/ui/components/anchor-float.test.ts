// @vitest-environment happy-dom
// 锚定层（REQ-UI-锚定与绑定层①·owner 亲派）：Float 浮层 + Connector 连线钉在活动目标上·mountUI 每帧读 rect 定位。
// 消灭手写 getElementById+getBoundingClientRect+createElement 病。render-only·不进 sim/hash。
import { describe, it, expect } from 'vitest';
import { renderNode, mountUI, validateLayoutNode } from './index.js';
import type { LayoutNode } from './index.js';

describe('锚定层 · Float / Connector', () => {
  it('Float → data-float-*（锚 kind/id/at/offset·初始隐藏移出屏）', () => {
    const html = renderNode({ type: 'Float', id: 'nameplate', props: { anchorTo: { kind: 'entity', id: 'u7', at: 'top', offset: { y: -10 } }, ttlTicks: 30 } as never,
      children: [{ type: 'Label', id: 'np-l', props: { text: '★ 张飞' } }] });
    expect(html).toContain('data-float-kind="entity"');
    expect(html).toContain('data-float-id="u7"');
    expect(html).toContain('data-float-at="top"');
    expect(html).toContain('data-float-oy="-10"');
    expect(html).toContain('data-float-ttl="30"');
    expect(html).toContain('position:fixed'); // 按视口 rect 定位（跟随滚动）
    expect(html).toContain('opacity:0');       // 定位前不闪
    expect(html).toContain('★ 张飞');           // children 在内
  });

  it('Connector → SVG + 两端锚 + 线型/线色令牌 + 箭头/标签', () => {
    const html = renderNode({ type: 'Connector', id: 'atk', props: { from: { kind: 'node', id: 'a' }, to: { kind: 'entity', id: 'b', at: 'center' }, style: 'arrow', tone: 'danger', label: '−120' } as never });
    expect(html).toContain('<svg');
    expect(html).toContain('data-conn-from-id="a"');
    expect(html).toContain('data-conn-to-kind="entity"');
    expect(html).toContain('<line');
    expect(html).toContain('marker-end'); // arrow 箭头
    expect(html).toContain('−120');        // 标签
    expect(html).toContain('pointer-events:none'); // 连线不挡点击
  });
  it('Connector dashed → stroke-dasharray（虚线）', () => {
    expect(renderNode({ type: 'Connector', id: 'c', props: { from: { kind: 'node', id: 'a' }, to: { kind: 'node', id: 'b' }, style: 'dashed' } as never })).toContain('stroke-dasharray');
  });

  it('mountUI 挂锚定浮层不抛错（rAF 跟随·目标缺失自隐·teardown 取消）', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const tree: LayoutNode = { type: 'Panel', id: 'root', props: {}, children: [
      { type: 'Button', id: 'unit-a', props: { label: '单位A', action: 'x' } },
      { type: 'Float', id: 'f1', props: { anchorTo: { kind: 'node', id: 'unit-a', at: 'top' } } as never, children: [{ type: 'Label', id: 'f1l', props: { text: 'HP' } }] },
      { type: 'Connector', id: 'c1', props: { from: { kind: 'node', id: 'unit-a' }, to: { kind: 'node', id: 'missing-target' } } as never },
    ] };
    expect(() => { const h = mountUI(host, tree); h(); }).not.toThrow(); // 挂载 + teardown 不抛
    host.remove();
  });

  it('Float/Connector 样例过校验器（目录自洽）', () => {
    expect(validateLayoutNode({ type: 'Float', id: 'v', props: { anchorTo: { kind: 'node', id: 't' } } as never, children: [] })).toEqual([]);
    expect(validateLayoutNode({ type: 'Connector', id: 'v2', props: { from: { kind: 'node', id: 'a' }, to: { kind: 'node', id: 'b' } } as never })).toEqual([]);
  });
});
