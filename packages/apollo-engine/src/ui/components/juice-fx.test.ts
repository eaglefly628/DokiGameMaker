// @vitest-environment happy-dom
// 休闲 juice 五补（owner 2026-07-15）：UI 庆祝粒子 Particles / 退场动画 fadeOut·popOut·floatUp /
//   环形进度 ProgressBar.shape:'ring' / 全息箔 fx:'holo' / 描边字 Label.stroke。全 render-only·纯数据。
import { describe, it, expect } from 'vitest';
import { renderNode, validateLayoutNode, formatNumber } from './index.js';
import type { LayoutNode } from './index.js';

const P = (layout: LayoutNode['layout']): string => renderNode({ type: 'Panel', id: 'p', props: {}, layout, children: [] });

describe('休闲 juice 五补', () => {
  it('退场动画 fadeOut/popOut → 一次性 both（播完停末态·不循环）', () => {
    expect(P({ anim: 'fadeOut' })).toMatch(/animation:apollo-fadeOut \d+ms .*both/);
    expect(P({ anim: 'popOut' })).toMatch(/animation:apollo-popOut \d+ms .*both/);
    // floatUp=升冒·循环（+N 飘字）·不是一次性
    expect(P({ anim: 'floatUp' })).toMatch(/animation:apollo-floatUp \d+ms ease-in-out infinite/);
  });

  it('fx:holo → data-fx 含 holo（全息箔叠层·position:relative）', () => {
    const html = renderNode({ type: 'Panel', id: 'card', props: {}, layout: { fx: [{ kind: 'holo' }] }, children: [] });
    expect(html).toContain('data-fx="holo"');
    expect(html).toContain('position:relative'); // 叠层锚
    // 与 sheen 叠加不互斥
    const both = renderNode({ type: 'Panel', id: 'c2', props: {}, layout: { fx: [{ kind: 'holo' }, { kind: 'sheen' }] }, children: [] });
    expect(both).toContain('holo');
    expect(both).toContain('sheen');
  });

  it('Label.stroke → text-stroke 描边 + paint-order（填色在描边之上·可读）', () => {
    const html = renderNode({ type: 'Label', id: 'l', props: { text: 'GO', stroke: true, size: 'xl', color: 'gold' } });
    expect(html).toContain('-webkit-text-stroke:2px');
    expect(html).toContain('paint-order:stroke fill');
    // 无 stroke 不加（不回归）
    expect(renderNode({ type: 'Label', id: 'l2', props: { text: 'x' } })).not.toContain('text-stroke');
  });

  it('ProgressBar.shape:ring → conic-gradient 环 + 中心值（非线性条）', () => {
    const html = renderNode({ type: 'ProgressBar', id: 'r', props: { value: 0.75, shape: 'ring', showValue: true, tone: 'ok', size: 80 } });
    expect(html).toContain('conic-gradient');
    expect(html).toContain('border-radius:50%');
    expect(html).toContain('width:80px');
    expect(html).toContain('75%'); // 中心显值
    // 缺省 bar 仍是线性条（不回归）
    expect(renderNode({ type: 'ProgressBar', id: 'b', props: { value: 0.5 } })).not.toContain('conic-gradient');
  });

  it('Particles → 铺满叠层 + N 个确定式粒子（无 Math.random·pointer-events:none）', () => {
    const html = renderNode({ type: 'Particles', id: 'fx', props: { kind: 'confetti', count: 20 }, layout: { width: 200, height: 120 } });
    expect(html).toContain('pointer-events:none');
    expect(html).toContain('apollo-p-fall'); // 下落动画
    expect((html.match(/<span/g) ?? []).length).toBe(20); // 恰 20 片
    // 确定式：两次渲染逐字节一致（可回归·非随机）
    const again = renderNode({ type: 'Particles', id: 'fx', props: { kind: 'confetti', count: 20 }, layout: { width: 200, height: 120 } });
    expect(again).toBe(html);
    // 星光爆走径向 burst；微光走 twinkle
    expect(renderNode({ type: 'Particles', id: 's', props: { kind: 'stars' } })).toContain('apollo-p-burst');
    expect(renderNode({ type: 'Particles', id: 'k', props: { kind: 'sparkle' } })).toContain('apollo-p-twinkle');
    // count 上限 60 封顶
    expect((renderNode({ type: 'Particles', id: 'm', props: { kind: 'confetti', count: 999 } }).match(/<span/g) ?? []).length).toBe(60);
  });

  it('Particles follow:"cursor" → 跟随光标态标记 + 绝对定位小簇 + 初始隐 + screen 混色（不铺满父）', () => {
    const html = renderNode({ type: 'Particles', id: 'dust', props: { kind: 'sparkle', count: 9, follow: 'cursor' } });
    expect(html).toContain('data-particle-follow="cursor"'); // server 跟随循环据此驱动
    expect(html).toContain('position:absolute');             // 小簇绝对定位（非铺满父）
    expect(html).toContain('opacity:0');                     // 初始隐（指针移动才淡入）
    expect(html).toContain('mix-blend-mode:screen');         // 只提亮·不挡字
    expect(html).toContain('apollo-p-twinkle');              // sparkle 微光
    expect((html.match(/<span/g) ?? []).length).toBe(9);     // 较弱=9 片
    // 非 follow 态仍铺满父（relative·overflow:hidden）——回归不破原语义
    expect(renderNode({ type: 'Particles', id: 'p', props: { kind: 'sparkle' } })).toContain('position:relative');
  });

  it('Particles/ProgressBar-ring/stroke 样例过校验器（零 issue·目录自洽）', () => {
    const nodes: LayoutNode[] = [
      { type: 'Particles', id: 'v1', props: { kind: 'coins' } },
      { type: 'ProgressBar', id: 'v2', props: { value: 0.4, shape: 'ring', size: 60 } },
      { type: 'Label', id: 'v3', props: { text: '标题', stroke: true } },
    ];
    for (const n of nodes) expect(validateLayoutNode(n)).toEqual([]);
  });

  // ── 休闲缺口补全批（数字格式化 / 飞向 / 关卡地图 / 跑马灯 / 涟漪）──
  it('formatNumber：compact 缩写 / time 计时 / percent 百分比 / int 整数', () => {
    expect(formatNumber(1234, 'compact')).toBe('1.2K');
    expect(formatNumber(3_400_000, 'compact')).toBe('3.4M');
    expect(formatNumber(1_500_000_000, 'compact')).toBe('1.5B');
    expect(formatNumber(950, 'compact')).toBe('950');
    expect(formatNumber(75, 'time')).toBe('1:15');
    expect(formatNumber(3661, 'time')).toBe('1:01:01');
    expect(formatNumber(0.75, 'percent')).toBe('75%');
    expect(formatNumber(3.7, 'int')).toBe('4');
  });
  it('Label.format：静态数字 text 渲染即格式化 + tween 带 data-tween-fmt/from', () => {
    expect(renderNode({ type: 'Label', id: 'l', props: { text: '1500000', format: 'compact' } })).toContain('>1.5M<');
    const tw = renderNode({ type: 'Label', id: 'l2', props: { format: 'compact', tween: { from: 0, to: 9820, ms: 1000 } } });
    expect(tw).toContain('data-tween-fmt="compact"');
    expect(tw).toContain('data-tween-from="0"');
    expect(tw).toContain('>0<'); // 初值格式化（0）
  });
  it('flyTo → data-flyto-*（飞向目标·mountUI 量 rect 算位移）', () => {
    const html = renderNode({ type: 'Badge', id: 'coin', props: { text: '+50' }, layout: { flyTo: { to: 'wallet', ms: 800, arc: 40 } } });
    expect(html).toContain('data-flyto-to="wallet"');
    expect(html).toContain('data-flyto-ms="800"');
    expect(html).toContain('data-flyto-arc="40"');
  });
  it('fx:ripple → data-fx 含 ripple；anim:marquee → apollo-marquee 匀速循环', () => {
    expect(renderNode({ type: 'Panel', id: 'r', props: {}, layout: { fx: [{ kind: 'ripple' }] }, children: [] })).toContain('data-fx="ripple"');
    expect(renderNode({ type: 'Label', id: 'm', props: { text: '公告' }, layout: { anim: 'marquee' } })).toMatch(/animation:apollo-marquee \d+ms .*linear infinite/);
  });
  it('LevelPath：蛇形节点 + SVG 连线 + 状态节点（done/current/locked）', () => {
    const html = renderNode({ type: 'LevelPath', id: 'lp', props: { cols: 3, nodes: [
      { label: '1', state: 'done', stars: 3, action: 'pick', actionArg: '1' },
      { label: '2', state: 'current' }, { label: '3', state: 'locked' },
    ] } });
    expect(html).toContain('<svg'); expect(html).toContain('<line'); // 连接线
    expect(html).toContain('data-action="pick"'); expect(html).toContain('data-arg="1"'); // 节点可点选关
    expect(html).toContain('🔒'); // locked 锁
    expect(html).toContain('★★★'); // done 三星
    expect(validateLayoutNode({ type: 'LevelPath', id: 'v', props: { nodes: [{ label: '1' }] } })).toEqual([]);
  });
});
