// @vitest-environment happy-dom
// 生产板面板无头测试（REQ-QC-UI）：三门显示——机器门 + 复查门 + 人门；S7=评分卡判词（VISUAL/PREMIUM）；乱序放行痕。
// fetch mock 返回 /api/pipeline 板 JSON（含 review 字段·端点已透传），不依赖真 apollo.py。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GamePipelinePanel } from './GamePipelinePanel.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const gate = (state: string, detail: string) => ({ state, detail });
const BOARD = {
  success: true, slug: 'game-x', form: '内置', concept: { name: 'X', pitch: 'p' }, next: 'S2',
  stages: [
    { id: 'S3', title: '骨架关', handbook: 'h', gate: 'manifest-check',
      machine: gate('ok', '✓ 过'), review: gate('ok', '✓ PASS by lead @ 2026-07-15 · 复核通过'), human: gate('dim', '待人审（signoff 落账）'), status: 'warn' },
    { id: 'S7', title: '品质关', handbook: 'h', gate: null,
      machine: gate('ok', '✓ VISUAL: 20/24 · PREMIUM: YES（by 复查人 @ 2026-07-15）'),
      review: gate('ok', '复查形态=评分卡本身（复查人打分·机器门即其判词）'), human: gate('dim', '待人审'), status: 'ok' },
    { id: 'S8', title: '终检关', handbook: 'h', gate: 'full-suite',
      machine: gate('dim', '未跑'), review: gate('dim', '未复查'), human: gate('dim', '待人审'), status: 'dim',
      outOfOrder: { at: '2026-07-15T10:00', by: '某session', note: '前置未绿放行' } },
  ],
};

function stubBoard() { vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => BOARD }))); }
async function flush() { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }
function clickRowByTitle(container: HTMLElement, titleText: string) {
  const row = Array.from(container.querySelectorAll('div')).find((d) => (d.textContent || '').includes(titleText) && d.getAttribute('style')?.includes('cursor'));
  if (!row) throw new Error(`row not found: ${titleText}`);
  return row;
}

let container: HTMLElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); stubBoard(); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('GamePipelinePanel · 三门显示（REQ-QC-UI）', () => {
  it('板行一眼见三门：复查门紧凑标记（复✓ / 复—）', async () => {
    await act(async () => { root.render(<GamePipelinePanel slug="game-x" onBack={() => {}} />); });
    await flush();
    expect(container.textContent).toContain('复✓'); // S3/S7 review=ok
    expect(container.textContent).toContain('复—'); // S8 review=dim
    expect(container.textContent).toContain('每步三门'); // 头部改口径
  });

  it('选 S3 → 详情显「复查门：✓ PASS …」三行齐（机器门/复查门/人门）', async () => {
    await act(async () => { root.render(<GamePipelinePanel slug="game-x" onBack={() => {}} />); });
    await flush();
    await act(async () => { clickRowByTitle(container, '骨架关').click(); });
    await flush();
    expect(container.textContent).toContain('机器门：');
    expect(container.textContent).toContain('复查门：✓ PASS by lead');
    expect(container.textContent).toContain('人　门：');
  });

  it('选 S7 → 机器门行改标「评分卡」+ 显 VISUAL/PREMIUM 判词', async () => {
    await act(async () => { root.render(<GamePipelinePanel slug="game-x" onBack={() => {}} />); });
    await flush();
    await act(async () => { clickRowByTitle(container, '品质关').click(); });
    await flush();
    expect(container.textContent).toContain('评分卡：');
    expect(container.textContent).toContain('VISUAL: 20/24 · PREMIUM: YES');
  });

  it('选 S8 → 显乱序放行痕', async () => {
    await act(async () => { root.render(<GamePipelinePanel slug="game-x" onBack={() => {}} />); });
    await flush();
    await act(async () => { clickRowByTitle(container, '终检关').click(); });
    await flush();
    expect(container.textContent).toContain('乱序放行');
    expect(container.textContent).toContain('某session');
  });
});
