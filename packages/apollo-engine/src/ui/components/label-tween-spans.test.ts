// @vitest-environment happy-dom
// REQ-UI-数字补间/富文本 下沉验收（Label 扩字段·render-only·不进 sim hash）：
//   · tween（数字滚动）：掷骰滚到命点 / 筹码·倍率·分数跳动——from→to 由 mountUI 定时器动画到位。
//   · spans（富文本多段着色）：天罡/地煞词条高亮、说明分色——逐段自带 color(令牌)/bold，替代单色 text。
// 折进 Label 而非新建 Counter/RichText 控件（manifesto：扩字段优先于加控件类型）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderNode, mountUI } from './index.js';
import type { LayoutNode } from './index.js';

describe('UI Components · Label.spans 富文本多段着色（render-only·纯函数）', () => {
  it('多段各自 color(令牌)/bold；有 spans 忽略 text', () => {
    const html = renderNode({ type: 'Label', id: 'rt', props: { text: '应被忽略', spans: [
      { text: '天罡 ', color: 'gold', bold: true },
      { text: '破·', color: 'danger' },
      { text: '可克', color: 'jade' },
    ] } });
    expect(html).toContain('天罡'); expect(html).toContain('破·'); expect(html).toContain('可克');
    expect(html).toContain('font-weight:700');  // 第一段 bold
    expect(html).not.toContain('应被忽略');       // 有 spans → text 忽略
  });
  it('段 XSS 转义', () => {
    const html = renderNode({ type: 'Label', id: 'x', props: { text: '', spans: [{ text: '<script>x</script>' }] } });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('无 spans → 仍单色 text（不回归）', () => {
    expect(renderNode({ type: 'Label', id: 'p', props: { text: '纯文本' } })).toContain('>纯文本<');
  });
});

describe('UI Components · Label.tween 数字滚动（render-only·mountUI 定时器）', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('from→to 在 ms 内动画到位；满后停', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const tree: LayoutNode = { type: 'Label', id: 'n', props: { text: '', tween: { from: 0, to: 100, ms: 160 } } };
    const teardown = mountUI(host, tree);
    const el = (): HTMLElement => host.querySelector('#n') as HTMLElement;
    expect(el().textContent).toBe('0');      // 初值 = from
    vi.advanceTimersByTime(160);
    expect(el().textContent).toBe('100');     // 满 → to
    vi.advanceTimersByTime(200);
    expect(el().textContent).toBe('100');     // 停（定时器已清）
    teardown(); host.remove();
  });

  it('decimals 小数位（倍率 1.0→2.5）', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const tree: LayoutNode = { type: 'Label', id: 'm', props: { text: '', tween: { from: 1, to: 2.5, ms: 80, decimals: 1 } } };
    const teardown = mountUI(host, tree);
    const el = (): HTMLElement => host.querySelector('#m') as HTMLElement;
    expect(el().textContent).toBe('1.0');    // from 按 decimals 格式化
    vi.advanceTimersByTime(80);
    expect(el().textContent).toBe('2.5');     // to
    teardown(); host.remove();
  });

  it('teardown 清定时器（之后推进不改 DOM·不抛）', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const tree: LayoutNode = { type: 'Label', id: 'n', props: { text: '', tween: { from: 0, to: 50, ms: 160 } } };
    const teardown = mountUI(host, tree);
    vi.advanceTimersByTime(16);
    teardown();
    expect(() => vi.advanceTimersByTime(300)).not.toThrow();
    host.remove();
  });
});
