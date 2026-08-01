// asset-reconcile 自检：合成 fixture（临时根）验三类 finding + 判词 + tbf 不误报。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { reconcile } from './asset-reconcile.mjs';

let root;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'reconcile-'));
  const A = join(root, 'assets');
  mkdirSync(join(A, 'textures'), { recursive: true });
  // 磁盘：a.png（登记·存在）+ orphan.png（未登记·孤儿）
  writeFileSync(join(A, 'textures', 'a.png'), Buffer.from([0x89, 0x50]));
  writeFileSync(join(A, 'textures', 'orphan.png'), Buffer.from([0x89, 0x50]));
  writeFileSync(join(A, 'index.json'), JSON.stringify({
    version: 1,
    assets: [
      { id: 'tex/a', type: 'texture', status: 'filled', path: 'textures/a.png' },              // ✓ 一致
      { id: 'tex/missing', type: 'texture', status: 'filled', path: 'textures/missing.png' },   // ✗ dangling-file
      { id: 'tex/tbf', type: 'texture', status: 'tbf' },                                        // 合法：tbf 无文件·不报
      { id: 'mat/bad', type: 'material', status: 'filled', spec: { map: 'tex/nope' } },         // ✗ dangling-key（tex/nope 不在册）
      { id: 'mat/ok', type: 'material', status: 'filled', spec: { map: 'tex/a' } },             // ✓ 键在册
    ],
  }));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('asset-reconcile · 三方对账三类 finding', () => {
  it('dangling-file（登记有文件·磁盘无）', () => {
    const r = reconcile({ root, scope: 'shared' });
    const df = r.findings.filter((f) => f.type === 'dangling-file');
    expect(df.map((f) => f.位置)).toContain('shared:tex/missing');
    expect(df.some((f) => f.位置.includes('tex/tbf'))).toBe(false); // tbf 不误报
  });

  it('dangling-key（spec 贴图键指向不在册资产）', () => {
    const r = reconcile({ root, scope: 'shared' });
    const dk = r.findings.filter((f) => f.type === 'dangling-key');
    expect(dk.map((f) => f.位置)).toContain('shared:mat/bad.map');
    expect(dk.some((f) => f.位置.includes('mat/ok'))).toBe(false); // 键在册不报
  });

  it('orphan-file（磁盘有文件·无登记）', () => {
    const r = reconcile({ root, scope: 'shared' });
    const of = r.findings.filter((f) => f.type === 'orphan-file');
    expect(of.map((f) => f.位置)).toContain('shared:textures/orphan.png');
    expect(of.some((f) => f.位置.includes('a.png'))).toBe(false); // a.png 已登记不报
  });

  it('判词：有断链=FAIL·退出码语义（fails>0）', () => {
    const r = reconcile({ root, scope: 'shared' });
    expect(r.verdict).toBe('FAIL'); // 有 dangling-file/key
    expect(r.fails).toBeGreaterThan(0);
    expect(r.warns).toBeGreaterThan(0); // orphan
  });
});
