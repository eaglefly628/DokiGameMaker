// 孤儿行审计自检（REQ-ART-可消费槽铁律）：契约分类 · manifest art: 深扫 · 单游戏审计 · scope。
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyRow, collectManifestArtRefs, auditGame, auditAll, discoverGames } from './ledger-audit.mjs';

const withRoot = (fn) => { const r = mkdtempSync(join(tmpdir(), 'ledger-audit-')); try { return fn(r); } finally { rmSync(r, { recursive: true, force: true }); } };
function seedLedger(root, game, ledger, manifest) {
  const dir = join(root, 'public', 'games', game, 'art');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'art-ledger.json'), JSON.stringify(ledger));
  if (manifest) writeFileSync(join(root, 'public', 'games', game, 'manifest.json'), JSON.stringify(manifest));
}

describe('REQ-ART · 孤儿行审计', () => {
  it('classifyRow：非空 skinKey = 编译期契约（consumable）', () => {
    expect(classifyRow({ skinKey: 'game-g/hero/sA' })).toBe('skinKey');
    expect(classifyRow({ skinKey: '  x  ' })).toBe('skinKey');
  });

  it('classifyRow：空/缺 skinKey 且无 manifest art: = 孤儿', () => {
    expect(classifyRow({ skinKey: '' })).toBe('orphan');
    expect(classifyRow({ skinKey: '   ' })).toBe('orphan');
    expect(classifyRow({})).toBe('orphan');
    // 有 slot/ref 声明但无 skinKey、无 manifest 契约 → 仍是孤儿（声明≠可机读消费键）
    expect(classifyRow({ slot: { entity: 'bg/menu', component: 'Image', field: 'src' } })).toBe('orphan');
  });

  it('classifyRow：manifest art: 契约（artRef 命中）= consumable，未命中 = 孤儿', () => {
    const refs = new Set(['tile.grass', 'hero.idle']);
    expect(classifyRow({ artRef: 'art:tile.grass' }, refs)).toBe('manifest-art');
    expect(classifyRow({ artRef: 'tile.grass' }, refs)).toBe('manifest-art'); // 免前缀也认
    expect(classifyRow({ artRef: 'art:not.in.manifest' }, refs)).toBe('orphan');
    expect(classifyRow({ artRef: 'art:tile.grass' }, new Set())).toBe('orphan'); // 无 manifest=空集
  });

  it('collectManifestArtRefs：深扫嵌套结构收集 art: 引用并剥前缀', () => {
    const manifest = {
      entities: [
        { render: { component: 'Sprite', art: 'art:tile.grass' } },
        { nested: { deep: ['art:hero.idle', 'not-a-ref', 42] } },
      ],
      bg: 'art:scene.bg',
    };
    const refs = collectManifestArtRefs(manifest);
    expect(refs).toEqual(new Set(['tile.grass', 'hero.idle', 'scene.bg']));
  });

  it('auditGame：混合台账正确统计有槽/孤儿并列出孤儿编号', () => withRoot((root) => {
    seedLedger(root, 'game-x', {
      mode: 'requirements',
      rows: [
        { no: 'art-01', skinKey: 'game-x/a', kind: 'sprite', desc: '有槽的' },
        { no: 'art-02', skinKey: '', kind: 'texture', desc: '孤儿背景' },
        { no: 'art-03', slot: { field: 'src' }, kind: 'sprite', desc: '只有 slot 声明' },
      ],
    });
    const r = auditGame(root, 'game-x');
    expect(r.total).toBe(3);
    expect(r.consumable).toBe(1);
    expect(r.orphans.map((o) => o.no)).toEqual(['art-02', 'art-03']);
    expect(r.mode).toBe('requirements');
  }));

  it('auditGame：manifest art: 命中的行不算孤儿', () => withRoot((root) => {
    seedLedger(root, 'game-cart',
      { mode: 'library', rows: [
        { no: 'art-01', artRef: 'art:tile.grass', desc: '卡带 art 引用' },
        { no: 'art-02', artRef: 'art:missing', desc: '引用不在 manifest' },
      ] },
      { entities: [{ render: { art: 'art:tile.grass' } }] },
    );
    const r = auditGame(root, 'game-cart');
    expect(r.consumable).toBe(1);
    expect(r.orphans.map((o) => o.no)).toEqual(['art-02']);
  }));

  it('auditGame：无台账 → missing', () => withRoot((root) => {
    expect(auditGame(root, 'nope').missing).toBe(true);
  }));

  it('discoverGames + auditAll：只扫带台账的游戏·全净 = 零孤儿', () => withRoot((root) => {
    seedLedger(root, 'game-clean', { rows: [{ no: 'art-01', skinKey: 'k1' }, { no: 'art-02', skinKey: 'k2' }] });
    seedLedger(root, 'game-dirty', { rows: [{ no: 'art-01', skinKey: '' }] });
    mkdirSync(join(root, 'public', 'games', 'no-ledger'), { recursive: true }); // 无台账目录不入列
    expect(discoverGames(root)).toEqual(['game-clean', 'game-dirty']);
    const all = auditAll(root);
    expect(all.map((r) => r.game)).toEqual(['game-clean', 'game-dirty']);
    expect(all.find((r) => r.game === 'game-clean').orphans).toHaveLength(0);
    expect(all.find((r) => r.game === 'game-dirty').orphans).toHaveLength(1);
  }));
});
