// 风格库台账底座自检（REQ-STYLESET·M0）：保号幂等 · 加行顺延 · 风格包条目 · reconcile 零 FAIL。
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFreshLedger, deriveLedger, mockFill, CATALOG, STYLE_ID } from './styleset-ledger.mjs';
import { mergeLedger } from './art-replace.mjs';
import { STYLE_PACKS } from './style-packs.mjs';
import { reconcile } from './asset-reconcile.mjs';

const withRoot = (fn) => { const r = mkdtempSync(join(tmpdir(), 'styleset-')); try { return fn(r); } finally { rmSync(r, { recursive: true, force: true }); } };
const seedIndex = (root) => { mkdirSync(join(root, 'assets'), { recursive: true }); writeFileSync(join(root, 'assets', 'index.json'), JSON.stringify({ version: 1, assets: [] })); };
const pad2 = (n) => String(n).padStart(2, '0');

describe('REQ-STYLESET · M0 台账底座', () => {
  it('① 重跑 derive 幂等保号：no/status 两遍不变', () => withRoot((root) => {
    seedIndex(root);
    const l1 = deriveLedger(root);
    const l2 = deriveLedger(root);
    expect(l1.rows).toHaveLength(CATALOG.length);
    expect(l1.mode).toBe('library');
    expect(l2.rows.map((r) => r.no)).toEqual(l1.rows.map((r) => r.no));
    expect(l2.rows.map((r) => r.status)).toEqual(l1.rows.map((r) => r.status));
    // 编号从 art-01 连号顺次
    expect(l1.rows.map((r) => r.no)).toEqual(CATALOG.map((_, i) => 'art-' + pad2(i + 1)));
  }));

  it('① 保号核心：生成态/gen/provenance/人工 prompt 在合并后保留', () => {
    const fresh = buildFreshLedger();
    // 模拟已 mock 过 + 人工回填 prompt 的旧台账
    const prev = { ...fresh, rows: fresh.rows.map((r, i) => (i === 0
      ? { ...r, status: 'generated', prompt: 'hand tuned subject', gen: { mock: true, localId: 'x' }, provenance: { date: 'd', generator: 'mock' } }
      : r)) };
    const merged = mergeLedger(prev, buildFreshLedger(), null);
    const r0 = merged.rows.find((r) => r.slot.entity === fresh.rows[0].slot.entity);
    expect(r0.no).toBe(prev.rows[0].no);
    expect(r0.status).toBe('generated');
    expect(r0.prompt).toBe('hand tuned subject');
    expect(r0.gen).toEqual({ mock: true, localId: 'x' });
    expect(r0.provenance).toEqual({ date: 'd', generator: 'mock' });
  });

  it('② 加清单一行重跑：新行顺延 max+1·旧行编号全不动', () => {
    const l1 = mergeLedger(null, buildFreshLedger(CATALOG), null); // 首跑=fresh（art-01..art-72）
    const extra = { slug: 'ui.icon.test-extra', region: 'ui', kind: 'texture', subject: 'extra probe icon', spec: { w: 64, h: 64, transparent: true, usage: 'sprite', colorSpace: 'srgb' }, desc: '探针额外行' };
    const fresh2 = buildFreshLedger([...CATALOG.slice(0, 5), extra, ...CATALOG.slice(5)]); // 插在中间（fresh 号会整体后移）
    const merged = mergeLedger(l1, fresh2, null);
    for (const r of l1.rows) expect(merged.rows.find((x) => x.slot.entity === r.slot.entity).no).toBe(r.no); // 旧号不动
    const nw = merged.rows.find((x) => x.slot.entity === 'ui.icon.test-extra');
    expect(nw.no).toBe('art-' + pad2(CATALOG.length + 1)); // 顺延到 max+1（不占中间号）
    expect(merged.rows).toHaveLength(CATALOG.length + 1);
  });

  it('③ 风格包 apollo-toon 条目存在·含 8 色·stylePrompt 无厂牌词·refImage:null', () => {
    const p = STYLE_PACKS[STYLE_ID];
    expect(p).toBeTruthy();
    expect(Array.isArray(p.palette)).toBe(true);
    expect(p.palette).toHaveLength(8);
    expect(typeof p.stylePrompt).toBe('string');
    expect(p.stylePrompt.length).toBeGreaterThan(40);
    expect(p.refImage).toBeNull();
    // 每行 query 引风格锚全文（单一真相=风格包）
    const rows = buildFreshLedger().rows;
    expect(rows[0].query).toContain(p.stylePrompt);
    // IP 红线：锚不含常见厂牌词
    const low = p.stylePrompt.toLowerCase();
    for (const brand of ['disney', 'supercell', 'pixar', 'nintendo', 'blizzard', 'clash']) expect(low).not.toContain(brand);
  });

  it('④ mock 填充 → reconcile 对 styleset 目录零 FAIL（磁盘↔登记↔台账一致）', () => withRoot((root) => {
    seedIndex(root);
    deriveLedger(root);
    const r = mockFill(root, { at: '2026-01-01T00:00:00.000Z' });
    expect(r.summary.total).toBe(CATALOG.length);
    expect(r.summary.mesh).toBe(CATALOG.filter((c) => c.kind === 'mesh').length);
    // 台账行全部转 generated + gen.mock
    expect(r.ledger.rows.every((row) => row.status === 'generated' && row.gen.mock === true)).toBe(true);
    const rec = reconcile({ root, scope: 'shared' });
    expect(rec.fails).toBe(0);
    expect(rec.findings.filter((f) => f.type === 'orphan-file')).toHaveLength(0); // style-ledger.json 不误判孤儿
    expect(rec.verdict).toBe('PASS');
  }));
});
