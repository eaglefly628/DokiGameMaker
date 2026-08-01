// 导入抠图去背核心（REQ-ASSET-导入抠图·PST 导入向导选项）：matteImportFiles 逐图过 /api/assets/matte、
// 用抠好的图替换入库负载、provenance 记 matte 步、任一失败整批中止。fetch mock，不依赖真 apollo/rembg。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { matteImportFiles } from './AssetImportWizard.js';

afterEach(() => vi.unstubAllGlobals());

function stubMatte(map: Record<string, { success: boolean; dataBase64?: string; provenance?: unknown; error?: string }>) {
  const calls: Array<{ dataBase64: string; mode: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, opt: { body: string }) => {
    const body = JSON.parse(opt.body) as { dataBase64: string; mode: string };
    calls.push(body);
    return { ok: true, json: async () => map[body.dataBase64] ?? { success: false, error: 'no-stub' } };
  }));
  return calls;
}

const entry = (id: string) => ({ id, type: 'texture' as const, description: id, status: 'filled' as const, path: `texture/${id}.png`, provenance: { method: 'import-loose' } });

describe('matteImportFiles（导入抠图去背核心）', () => {
  it('逐图过 matte·用抠好的图替换·provenance 记 matte 步·顺序保持', async () => {
    stubMatte({ AAA: { success: true, dataBase64: 'aaaMATTE', provenance: { matte: 'flood-fill', removedPx: 12 } },
      BBB: { success: true, dataBase64: 'bbbMATTE', provenance: { matte: 'flood-fill' } } });
    const files = [{ path: 'texture/a.png', dataBase64: 'AAA' }, { path: 'texture/b.png', dataBase64: 'BBB' }];
    const out = await matteImportFiles(files, [entry('a'), entry('b')], 'flood', 'http://x');
    expect(out.files.map((f) => f.dataBase64)).toEqual(['aaaMATTE', 'bbbMATTE']); // 用抠好的图
    expect(out.files.map((f) => f.path)).toEqual(['texture/a.png', 'texture/b.png']); // 路径/顺序不变
    const p0 = out.entries[0].provenance as Record<string, unknown>;
    expect(p0.method).toBe('import-loose'); // 原 provenance 保留
    expect((p0.matte as Record<string, unknown>).mode).toBe('flood'); // matte 步记进 provenance
    expect((p0.matte as Record<string, unknown>).removedPx).toBe(12); // 端点 provenance 合并
  });

  it('不改输入（纯函数·返回新数组）', async () => {
    stubMatte({ AAA: { success: true, dataBase64: 'aaaMATTE' } });
    const files = [{ path: 'texture/a.png', dataBase64: 'AAA' }];
    const entries = [entry('a')];
    await matteImportFiles(files, entries, 'flood', 'http://x');
    expect(files[0].dataBase64).toBe('AAA'); // 原输入未被改
  });

  it('任一图抠图失败 → 整批中止（抛错·绝不静默入原图）', async () => {
    stubMatte({ AAA: { success: true, dataBase64: 'aaaMATTE' }, BAD: { success: false, error: 'rembg 未装' } });
    const files = [{ path: 'texture/a.png', dataBase64: 'AAA' }, { path: 'texture/bad.png', dataBase64: 'BAD' }];
    await expect(matteImportFiles(files, [entry('a'), entry('bad')], 'rembg', 'http://x'))
      .rejects.toThrow(/抠图失败（texture\/bad\.png）/);
  });

  it('onProgress 逐图回调（done/total）', async () => {
    stubMatte({ AAA: { success: true, dataBase64: 'm1' }, BBB: { success: true, dataBase64: 'm2' } });
    const seen: Array<[number, number]> = [];
    await matteImportFiles([{ path: 'a', dataBase64: 'AAA' }, { path: 'b', dataBase64: 'BBB' }], [entry('a'), entry('b')], 'flood', 'http://x', (d, t) => seen.push([d, t]));
    expect(seen).toEqual([[1, 2], [2, 2]]);
  });
});
