// 美术替换工作流大脑自检（REQ-DEMO-T1·工作流档 §六 部分口径的单测层）：
// 列表推导（kind/spec/编号确定性）· palette-snap · 批量 mock 生成 + 缓存续跑 · 对位替换。
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveLedger, batchGenerate, applyReplacements, dialectPrompt, cacheKey, paletteSnapRgb, deriveRequirements, resetRow, swapSlot, mergeLedger, deriveForGame, sizeForSpec, genSizeForTarget, resizeImageTo, errText, isPngBuffer, sniffImageFmt, backupOrigFile } from './art-replace.mjs';
import { encodePng } from './ai-gen.mjs';
import { decodePng } from './asset-matte.mjs';
import { STYLE_PACKS, STYLE_PACK_IDS } from './style-packs.mjs';

const MANIFEST = {
  capabilities: ['l2-color'],
  entities: {
    hero: { Sprite: { type: 'Sprite', textureKey: 'art:brave knight' }, Shape: { type: 'Shape', width: 48, height: 64 }, Transform: { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 2, scaleY: 2 } },
    slime: { Sprite: { type: 'Sprite', textureKey: 'art:green slime' }, Shape: { type: 'Shape', radius: 20 } },
    background: { Sprite: { type: 'Sprite', textureKey: 'art:forest' } },
    coin3d: { Model3D: { type: 'Model3D', modelKey: 'art:gold coin', scale: 0.5 } },
    silent: { Sprite: { type: 'Sprite', textureKey: 'hero_idle' } }, // 非 art: → 不入台账
  },
};
// 注意 await：fn 是 async 时若同步 finally，rmSync 会在测试跑到一半时把临时根删掉（预置文件消失的假阴/假阳）。
const withRoot = async (fn) => { const r = mkdtempSync(join(tmpdir(), 'artrep-')); try { return await fn(r); } finally { rmSync(r, { recursive: true, force: true }); } };

describe('T1 ① 列表推导', () => {
  it('只收 art: 槽位·编号按槽位标识确定性分配（重跑不漂移）', () => {
    const l = deriveLedger(MANIFEST, { game: 'g' });
    expect(l.rows).toHaveLength(4); // silent 的 hero_idle 非 art: → 不入
    expect(l.rows.map((r) => r.no)).toEqual(['art-01', 'art-02', 'art-03', 'art-04']);
    // 按 entity 名排序：background < coin3d < hero < slime
    expect(l.rows.map((r) => r.slot.entity)).toEqual(['background', 'coin3d', 'hero', 'slime']);
    expect(deriveLedger(MANIFEST, { game: 'g' }).rows.map((r) => r.no)).toEqual(l.rows.map((r) => r.no)); // 稳定
  });
  it('kind 从组件/字段推·spec 从组件数据推', () => {
    const l = deriveLedger(MANIFEST, { game: 'g' });
    const by = (e) => l.rows.find((r) => r.slot.entity === e);
    expect(by('coin3d').kind).toBe('model3d');
    expect(by('coin3d').spec).toMatchObject({ scale: 0.5, polyBudget: 5000 });
    expect(by('background').kind).toBe('bg');
    expect(by('background').spec.transparent).toBe(false);
    expect(by('hero').kind).toBe('sprite');
    expect(by('hero').spec).toMatchObject({ w: 48, h: 64, displayW: 96, displayH: 128, transparent: true }); // scaleX/Y=2
    expect(by('slime').spec).toMatchObject({ w: 40, h: 40 }); // radius 20 → 40
    expect(by('hero').placeholder).toEqual({ ref: 'art:brave knight', source: 'freelib' });
    expect(by('hero').status).toBe('placeholder');
  });
});

describe('T1 ③④ 风格方言 + 缓存 + palette-snap', () => {
  it('dialectPrompt：qwen 吃中文·tripo/meshy 吃英文', () => {
    const row = { kind: 'sprite', query: 'knight' };
    expect(dialectPrompt(row, STYLE_PACKS['pixel-retro'])).toContain('16 位像素风'); // qwen→中文
    const model3d = { kind: 'model3d', query: 'coin' };
    const enPack = { ...STYLE_PACKS['pixel-retro'], params: { ...STYLE_PACKS['pixel-retro'].params, provider: 'meshy' } };
    expect(dialectPrompt(model3d, enPack)).toContain('16-bit pixel art'); // meshy→英文
  });
  it('cacheKey 稳定且随 prompt/seed 变', () => {
    const p = STYLE_PACKS['pixel-retro'].params;
    expect(cacheKey('qwen', 'a', p)).toBe(cacheKey('qwen', 'a', p));
    expect(cacheKey('qwen', 'a', p)).not.toBe(cacheKey('qwen', 'b', p));
  });
  it('paletteSnap 把像素量化进调色板（同批共用一板→成套）', () => {
    const pal = [0x000000, 0xffffff];
    const rgb = Buffer.from([10, 10, 10, 240, 240, 240]);
    paletteSnapRgb(rgb, pal);
    expect([...rgb]).toEqual([0, 0, 0, 255, 255, 255]);
  });
});

describe('T2I 尺寸 + debug 回显（owner 2026-07-22「按钮渲成整场景·要知道传了什么」）', () => {
  it('genSizeForTarget：放大到面积 ≥ 921600（火山实测最低面积）·保长宽比·单边 ≤ 4096', () => {
    for (const [w, h] of [[64, 64], [48, 64], [256, 96], [1280, 720], [100, 100], [512, 512]]) {
      const g = genSizeForTarget(w, h);
      expect(g.w * g.h).toBeGreaterThanOrEqual(921600);           // 面积达标（否则火山 InvalidParameter 拒）
      expect(Math.max(g.w, g.h)).toBeLessThanOrEqual(4096);       // 单边顶
      expect(Math.abs(g.w / g.h - w / h)).toBeLessThan(0.1);      // 长宽比保持（round8 容差）
      expect(g.size).toBe(`${g.w}x${g.h}`);
    }
  });

  it('sizeForSpec：非场景 kind 面积达标·bg/splash/model/无 spec → null', () => {
    expect(sizeForSpec({ kind: 'bg', spec: { w: 1280, h: 720 } })).toBeNull();
    expect(sizeForSpec({ kind: 'splash', spec: { w: 1080, h: 1920 } })).toBeNull();
    expect(sizeForSpec({ kind: 'model3d', spec: { w: 100, h: 100 } })).toBeNull();
    expect(sizeForSpec({ kind: 'sprite' })).toBeNull();
    const [w, h] = sizeForSpec({ kind: 'sprite', spec: { w: 256, h: 96 } }).split('x').map(Number);
    expect(w * h).toBeGreaterThanOrEqual(921600);
  });

  it('resizeImageTo：真 PNG 缩到目标尺寸（scale-back）·目标≥源=原图·非 PNG=安全兜底', () => {
    // 造一张 200×80 RGB PNG（假图·像素随意）
    const big = encodePng(200, 80, Buffer.alloc(200 * 80 * 3, 128));
    const small = resizeImageTo(big, 100, 40);
    const dec = decodePng(small);
    expect([dec.w, dec.h]).toEqual([100, 40]);        // 真缩到目标
    expect(resizeImageTo(big, 400, 160)).toBe(big);   // 目标≥源→不放大·返回原 buffer
    expect(resizeImageTo(Buffer.from('not a png'), 10, 10)).toBeInstanceOf(Buffer); // decode 失败→原 buffer 不炸
  });

  it('batchGenerate summary.debug：每行回显完整 prompt + size + curl 命令行（mock 也带·key 打码）', () => withRoot(async (root) => {
    const l = deriveLedger(MANIFEST, { game: 'g' });
    const r = await batchGenerate(l, 'pixel-retro', { root, game: 'g', mock: true, provider: 'seedream' });
    expect(Array.isArray(r.summary.debug)).toBe(true);
    expect(r.summary.debug.length).toBeGreaterThan(0);
    const sp = r.summary.debug.find((d) => d.kind === 'sprite');
    expect(sp.prompt).toBeTruthy();                    // 完整提示词
    expect(sp.curl).toContain('ark.cn-beijing.volces.com'); // 完整命令行
    expect(sp.curl).toContain('Bearer $ARK_API_KEY');  // key 占位·不落真值
    expect(sp.curl).not.toMatch(/ark-[0-9a-f]{4}/);    // 无真 key 形态
    expect(sp.size).toBeTruthy();                       // 尺寸回显（非隐式）
  }));
});

describe('T1 ④ 批量生成 + 断点续跑', () => {
  it('mock 全生成·登记本地 index·provenance 硬字段·sfx/model 之外落 png', () => withRoot(async (root) => {
    const l = deriveLedger(MANIFEST, { game: 'g' });
    const r = await batchGenerate(l, 'pixel-retro', { root, game: 'g', mock: true, at: '2026-07-09T00:00:00Z' });
    expect(r.ok).toBe(true);
    expect(r.summary).toMatchObject({ total: 4, generated: 4, cached: 0, failed: 0 });
    expect(existsSync(join(root, 'public/games/g/art/gen/mock/art-03.png'))).toBe(true); // hero sprite（mock 独立命名空间）
    expect(existsSync(join(root, 'public/games/g/art/gen/mock/art-02.glb'))).toBe(true); // coin3d model
    const idx = JSON.parse(readFileSync(join(root, 'public/games/g/art/index.json'), 'utf8'));
    expect(idx.assets.some((a) => a.id === 'gen/mock/art-03')).toBe(true);
    const row = l.rows.find((x) => x.no === 'art-03');
    expect(row.status).toBe('generated');
    expect(row.provenance).toMatchObject({ date: '2026-07-09T00:00:00Z' });
    expect(row.provenance.model && row.provenance.prompt && row.provenance.license).toBeTruthy();
  }));
  it('首次生成存原始态快照 row.orig（供还原·owner 2026-07-21 报「还原变色块」修）', () => withRoot(async (root) => {
    const l = deriveLedger(MANIFEST, { game: 'g' });
    const before = l.rows.find((x) => x.no === 'art-03');
    expect('orig' in before).toBe(false); // 生成前无快照
    const beforeStatus = before.status ?? null;
    await batchGenerate(l, 'pixel-retro', { root, game: 'g', mock: true });
    const row = l.rows.find((x) => x.no === 'art-03');
    expect(row.orig).toBeTruthy(); // 覆盖前存了快照
    expect(row.orig.status).toBe(beforeStatus); // 快照=生成前状态（非生成后的 'generated'）
    expect(row.status).toBe('generated');
    // 二次生成不覆盖已存快照（保真正原始态·非上一次生成态）
    const origSnap = JSON.stringify(row.orig);
    await batchGenerate(l, 'cartoon-thick', { root, game: 'g', mock: true, only: 'art-03' });
    expect(JSON.stringify(l.rows.find((x) => x.no === 'art-03').orig)).toBe(origSnap);
  }));
  it('断点续跑：二次批处理全缓存命中·0 重生成（不重扣费）', () => withRoot(async (root) => {
    const l = deriveLedger(MANIFEST, { game: 'g' });
    await batchGenerate(l, 'pixel-retro', { root, game: 'g', mock: true });
    const r2 = await batchGenerate(l, 'pixel-retro', { root, game: 'g', mock: true });
    expect(r2.summary.cached).toBe(4);
    expect(r2.summary.generated).toBe(0);
  }));
  it('无 key 且非 mock → 凭证探针输出 + mock 占位（绝不静默顶替）', () => withRoot(async (root) => {
    const l = deriveLedger(MANIFEST, { game: 'g' });
    const r = await batchGenerate(l, 'pixel-retro', { root, game: 'g', mock: false, env: {} }); // 无 key
    expect(r.summary.probes.length).toBeGreaterThan(0);
    expect(r.summary.probes[0]).toMatchObject({ configured: false });
    expect(r.summary.mock).toBeGreaterThan(0); // 落 mock 占位
  }));
});

describe('T1 ⑤ 对位替换', () => {
  it('generated 行重钉 manifest 引用为本地 id·status→replaced·原 manifest 不改', () => withRoot(async (root) => {
    const l = deriveLedger(MANIFEST, { game: 'g' });
    await batchGenerate(l, 'pixel-retro', { root, game: 'g', mock: true });
    const rep = applyReplacements(MANIFEST, l, { allowMock: true }); // 机械验证：钉回路径本身（生产端点默认拒 mock）
    expect(rep.replaced).toBe(4);
    expect(rep.manifest.entities.hero.Sprite.textureKey).toBe('gen/mock/art-03'); // 不再是 art:（mock 钉的是 mock 命名空间）
    expect(rep.manifest.entities.coin3d.Model3D.modelKey).toBe('gen/mock/art-02');
    expect(rep.manifest.entities.silent.Sprite.textureKey).toBe('hero_idle'); // 非 art: 不动
    expect(MANIFEST.entities.hero.Sprite.textureKey).toBe('art:brave knight'); // 原 manifest 未改
    expect(l.rows.every((r) => r.status === 'replaced')).toBe(true);
  }));
  it('§六④ 编号稳定性：改一行重跑，其余行编号/资产不动', () => withRoot(async (root) => {
    const l = deriveLedger(MANIFEST, { game: 'g' });
    await batchGenerate(l, 'pixel-retro', { root, game: 'g', mock: true });
    const beforeNos = l.rows.map((r) => r.no);
    // 单槽优化（同风格包·改一行 prompt 重跑）：只该行新 cacheKey 重生成，其余命中缓存不动
    const target = l.rows.find((r) => r.no === 'art-03');
    target.status = 'placeholder'; target.query = 'dark knight'; target.gen = null;
    const r = await batchGenerate(l, 'pixel-retro', { root, game: 'g', mock: true });
    expect(l.rows.map((x) => x.no)).toEqual(beforeNos); // 编号全不动
    expect(r.summary.cached).toBe(3); // 其余 3 行命中缓存不动（不重扣费）
    expect(r.summary.generated).toBe(1); // 只重生成 art-03
  }));
});

describe('resetRow 非破坏性 + 点名 regen 恒重出（owner 2026-07-27「生成失败→图没了→色块」）', () => {
  it('resetRow 不再预清 status/gen/provenance（旧好图留到结果落定·失败可保住）', () => {
    const l = deriveLedger(MANIFEST, { game: 'g' });
    const row = l.rows.find((x) => x.no === 'art-03');
    row.status = 'generated';
    row.gen = { provider: 'qwen', servedPath: '/games/g/art/gen/art-03.png', cacheKey: 'ck1' };
    row.provenance = { model: 'm', prompt: 'p', date: 'd', license: 'l' };
    const rr = resetRow(l, 'art-03', { query: '新词' });
    expect(rr.ok).toBe(true);
    expect(row.status).toBe('generated');                // 没被清成 placeholder（否则失败=空槽/色块）
    expect(row.gen && row.gen.servedPath).toBeTruthy();  // 旧图指针还在
    expect(row.query).toBe('新词');                       // query 照常更新
  });
  it('点名 regen（only）恒重出·不吃缓存（同词也换新卷·非 only 批处理仍走缓存续跑）', () => withRoot(async (root) => {
    const l = deriveLedger(MANIFEST, { game: 'g' });
    await batchGenerate(l, 'pixel-retro', { root, game: 'g', mock: true });                          // 首生成
    const r2 = await batchGenerate(l, 'pixel-retro', { root, game: 'g', mock: true, only: 'art-03' }); // 点名重出
    expect(r2.summary.cached).toBe(0);    // only 行不吃缓存
    expect(r2.summary.generated).toBe(1); // 确实重出了
  }));
});

describe('backupOrigFile·原图备份（owner 2026-07-27「回退就没了这张图·要备份」）', () => {
  it('拷原图到 orig/<no>（独立命名空间·gen 覆盖不到·还原精确复原）', () => withRoot((root) => {
    const dir = join(root, 'public/games/g/art/gen'); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'art-01.png'), Buffer.from([1, 2, 3, 4]));
    const bak = backupOrigFile(root, 'g', 'art-01', '/games/g/art/gen/art-01.png');
    expect(bak).toBe('/games/g/art/orig/art-01.png');
    expect(readFileSync(join(root, 'public/games/g/art/orig/art-01.png'))).toEqual(Buffer.from([1, 2, 3, 4]));
    // 备份在 orig/ 命名空间·后续 gen 覆盖 gen/art-01.png 也顶不到备份
    writeFileSync(join(dir, 'art-01.png'), Buffer.from([9, 9]));
    expect(readFileSync(join(root, 'public/games/g/art/orig/art-01.png'))).toEqual(Buffer.from([1, 2, 3, 4]));
  }));
  it('原本无图片文件（程序化槽）=null·路径穿越拒绝', () => withRoot((root) => {
    expect(backupOrigFile(root, 'g', 'art-02', '/games/g/art/nope.png')).toBeNull();
    expect(backupOrigFile(root, 'g', 'art-03', '/games/g/art/../../../etc/passwd')).toBeNull();
    expect(backupOrigFile(root, 'g', 'art-04', null)).toBeNull();
  }));
});

describe('sniffImageFmt·非 PNG 不塞小槽（owner 2026-07-27「生成很大·没缩回 26×26·变巨大底色」）', () => {
  it('嗅探 PNG / JPEG 魔数（缩小前判格式·非 PNG 明确报错不静默塞大图）', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const jpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0]);
    expect(isPngBuffer(png)).toBe(true);
    expect(isPngBuffer(jpg)).toBe(false);
    expect(sniffImageFmt(png)).toBe('PNG');
    expect(sniffImageFmt(jpg)).toBe('JPEG');
  });
});

describe('errText 摊平 fetch 真因（owner 2026-07-27「fetch failed 看不出真因」）', () => {
  it('undici fetch failed → 带出 e.cause 的 code（网络类可分诊·非 key）', () => {
    const e = new TypeError('fetch failed');
    e.cause = Object.assign(new Error('getaddrinfo ENOTFOUND ark.cn-beijing.volces.com'), { code: 'ENOTFOUND' });
    const s = errText(e);
    expect(s).toContain('fetch failed');
    expect(s).toContain('ENOTFOUND'); // 关键：真因摊出来了，不再只剩 'fetch failed'
  });
  it('AggregateError（多次连接尝试）→ 取首个 error 的 code', () => {
    const e = new TypeError('fetch failed');
    e.cause = { errors: [Object.assign(new Error('connect ECONNREFUSED 1.2.3.4:443'), { code: 'ECONNREFUSED' })] };
    expect(errText(e)).toContain('ECONNREFUSED');
  });
  it('普通 Error 无 cause → 原样（含 HTTP 错误体的 code，如 ModelNotOpen）', () => {
    expect(errText(new Error('seedream: 无 image url {"error":{"code":"ModelNotOpen"}}'))).toContain('ModelNotOpen');
  });
});

describe('mock 永不写回（owner 2026-07-10「Mock 数据不该这样做」·生产默认）', () => {
  it('默认 applyReplacements 跳过 mock 行：manifest 保持原始 art: 引用·skippedMock 计数', () => withRoot(async (root) => {
    const l = deriveLedger(MANIFEST, { game: 'g' });
    await batchGenerate(l, 'pixel-retro', { root, game: 'g', mock: true });
    const rep = applyReplacements(MANIFEST, l); // 无 allowMock=生产语义
    expect(rep.replaced).toBe(0);
    expect(rep.skippedMock).toBe(4);
    expect(rep.manifest.entities.hero.Sprite.textureKey).toBe('art:brave knight'); // 观感=原始 placeholder
    expect(l.rows.every((r) => r.status === 'generated')).toBe(true); // 墙上可见（⚙MOCK）但不上画面
  }));
  it('mock 行不登记 skinKey 别名（编译期游戏画面不吃 mock）', () => withRoot(async (root) => {
    const SKINNED = { entities: { body: { Sprite: { type: 'Sprite', textureKey: 'q/hero', anchorX: 0.5, anchorY: 0.5, zOrder: 0 }, Shape: { type: 'Shape', width: 24, height: 24 }, Color: { type: 'Color', tint: 0x112233, alpha: 1 } } } };
    const l = deriveRequirements(SKINNED, { game: 'g' });
    await batchGenerate(l, 'pixel-retro', { root, game: 'g', mock: true, only: l.rows[0].no });
    const idx = JSON.parse(readFileSync(join(root, 'public', 'games', 'g', 'art', 'index.json'), 'utf8'));
    const ids = idx.assets.map((a) => a.id);
    expect(ids).toContain('gen/mock/' + l.rows[0].no); // 产物在（墙预览用·mock 命名空间）
    expect(ids).not.toContain('q/hero'); // 别名不登记 → 游戏保持原始观感
  }));
  it('mock 产物独立命名空间：绝不覆盖已存在的真图文件与 index 条目（后门回归）', () => withRoot(async (root) => {
    // 伪造一份"真图"占据 gen/art-03（已钉死游戏正在消费的文件与 id）
    const genDir = join(root, 'public', 'games', 'g', 'art', 'gen');
    mkdirSync(genDir, { recursive: true });
    writeFileSync(join(genDir, 'art-03.png'), 'REAL-ART-BYTES');
    const idxFile = join(root, 'public', 'games', 'g', 'art', 'index.json');
    writeFileSync(idxFile, JSON.stringify({ version: 1, assets: [{ id: 'gen/art-03', type: 'texture', description: '真图', path: '/games/g/art/gen/art-03.png', provenance: { mock: false } }] }));
    const l = deriveLedger(MANIFEST, { game: 'g' });
    await batchGenerate(l, 'pixel-retro', { root, game: 'g', mock: true });
    expect(readFileSync(join(genDir, 'art-03.png'), 'utf8')).toBe('REAL-ART-BYTES'); // 真图文件一字未动
    const idx = JSON.parse(readFileSync(idxFile, 'utf8'));
    const real = idx.assets.find((a) => a.id === 'gen/art-03');
    expect(real.description).toBe('真图'); // 真图 index 条目未被 mock 顶替
    expect(idx.assets.some((a) => a.id === 'gen/mock/art-03')).toBe(true); // mock 落在自己的命名空间
  }));
});

describe('需求推导（retrofit·色块游戏无 art: 槽位时）', () => {
  const Q_MANIFEST = {
    entities: {
      base: { Mesh3D: { shape: 'sphere' }, Color: { tint: 0x8effc9 }, Material3D: { emissive: 0x8effc9 } },
      hidden: { Shape: { kind: 'box', width: 50, height: 50 }, Visibility: { visible: false } }, // 隐形碰撞体不计
      logic: { Resource: { id: 'gold', current: 0 } }, // 纯逻辑不计
      'pad-0-p': { Mesh3D: { shape: 'cylinder', frontTint: 0x2b6f86 } },
      'pad-1-p': { Mesh3D: { shape: 'cylinder', frontTint: 0x2b6f86 } },
      'pad-2-p': { Mesh3D: { shape: 'cylinder', frontTint: 0x2b6f86 } },
      lib: { PrefabLibrary: { templates: { enemy_basic: { entities: { body: { Mesh3D: { shape: 'sphere', frontTint: 0xff0000 }, Material3D: { emissive: 0xff0000 } } } } } } },
    },
  };
  it('扫视觉实体+预制模板·归并结构等价实例·跳过隐形/纯逻辑', () => {
    const r = deriveRequirements(Q_MANIFEST, { game: 'q' });
    expect(r.mode).toBe('requirements');
    expect(r.instances).toBe(5); // base + 3 pads + prefab body（hidden/logic 不计）
    expect(r.count).toBe(3); // base · pad-p(×3 归一) · prefab enemy body
    const pad = r.rows.find((x) => x.query.includes('pad'));
    expect(pad.placeholder.count).toBe(3); // 3 个 pad 归成一条
    expect(r.rows.every((x) => x.kind === 'model3d')).toBe(true); // 全 Mesh3D → model3d
    expect(r.rows.every((x) => x.status === 'needs-art' && x.context.includes('美术需求'))).toBe(true);
  });
});

describe('T2 单槽重解析地基（点名优化/三式替换）', () => {
  it('resetRow：改 query·留 history·非破坏（旧图保留·owner 2026-07-27 修「失败→图没了→色块」）', () => {
    const l = deriveLedger(MANIFEST, { game: 'g' });
    l.rows[0].status = 'generated'; l.rows[0].gen = { cacheKey: 'x', servedPath: '/g/x.png' };
    const r = resetRow(l, l.rows[0].no, { query: 'new prompt' });
    expect(r.ok).toBe(true);
    expect(l.rows[0].query).toBe('new prompt');
    expect(l.rows[0].status).toBe('generated'); // 非破坏：不再预清成 placeholder（否则失败=空槽/色块）
    expect(l.rows[0].gen && l.rows[0].gen.servedPath).toBeTruthy(); // 旧图保留·生成成功才覆盖
    expect(l.rows[0].history[0].action).toBe('regen');
    expect(resetRow(l, 'art-99', {}).ok).toBe(false); // 无此编号
  });
  it('swapSlot：把某槽引用直接钉到已存在资产 id·status→replaced·原 manifest 不改', () => {
    const l = deriveLedger(MANIFEST, { game: 'g' });
    const heroRow = l.rows.find((x) => x.slot.entity === 'hero');
    const r = swapSlot(MANIFEST, l, heroRow.no, 'dungeon/knight_blue', { source: 'library' });
    expect(r.ok).toBe(true);
    expect(r.manifest.entities.hero.Sprite.textureKey).toBe('dungeon/knight_blue');
    expect(MANIFEST.entities.hero.Sprite.textureKey).toBe('art:brave knight'); // 原不改
    expect(heroRow.status).toBe('replaced');
    expect(heroRow.gen.source).toBe('library');
    expect(heroRow.history.some((h) => h.action === 'swap-library')).toBe(true);
  });
});

describe('T1 风格包库', () => {
  it('至少 3 包·各带双语 prompt/palette/params(provider)', () => {
    expect(STYLE_PACK_IDS.length).toBeGreaterThanOrEqual(3);
    for (const id of STYLE_PACK_IDS) {
      const p = STYLE_PACKS[id];
      expect(p.promptZh && p.promptEn).toBeTruthy();
      expect(Array.isArray(p.palette) && p.palette.length).toBeTruthy();
      expect(['qwen', 'tripo', 'meshy']).toContain(p.params.provider);
    }
  });
});

describe('编号 append-only（owner 07-09「ID 错位」定案·mergeLedger）', () => {
  it('加槽位重跑：旧号全不动·新槽位取 max+1 顺延', () => {
    const prev = deriveLedger(MANIFEST, { game: 'g' }); // art-01..04
    const bigger = JSON.parse(JSON.stringify(MANIFEST));
    bigger.entities.aaa_new = { Sprite: { type: 'Sprite', textureKey: 'art:new thing' }, Shape: { type: 'Shape', width: 8, height: 8 } };
    const merged = mergeLedger(prev, deriveLedger(bigger, { game: 'g' }));
    // aaa_new 排序在最前，但编号必须是 art-05（追加），background 保持 art-01
    expect(merged.rows.find((r) => r.slot.entity === 'aaa_new').no).toBe('art-05');
    expect(merged.rows.find((r) => r.slot.entity === 'background').no).toBe('art-01');
    expect(merged.rows.map((r) => r.no)).toEqual(['art-01', 'art-02', 'art-03', 'art-04', 'art-05']);
  });
  it('删槽位重跑：墓碑 retired 保号·编号不复用；再加新槽位继续顺延', () => {
    const prev = deriveLedger(MANIFEST, { game: 'g' });
    const smaller = JSON.parse(JSON.stringify(MANIFEST));
    delete smaller.entities.hero; // hero 原 art-03
    const merged = mergeLedger(prev, deriveLedger(smaller, { game: 'g' }));
    const hero = merged.rows.find((r) => r.slot.entity === 'hero');
    expect(hero.status).toBe('retired'); // 墓碑
    expect(hero.no).toBe('art-03'); // 保号
    const withNew = JSON.parse(JSON.stringify(smaller));
    withNew.entities.zzz = { Sprite: { type: 'Sprite', textureKey: 'art:late comer' }, Shape: { type: 'Shape', width: 8, height: 8 } };
    const m2 = mergeLedger(merged, deriveLedger(withNew, { game: 'g' }));
    expect(m2.rows.find((r) => r.slot.entity === 'zzz').no).toBe('art-05'); // max(4)+1·不占 hero 的 3
  });
  it('已生成状态/provenance/prompt 在重跑合并后保留', async () => {
    await withRoot(async (root) => {
      const prev = deriveLedger(MANIFEST, { game: 'g' });
      await batchGenerate(prev, 'pixel-retro', { root, game: 'g', mock: true });
      prev.rows[0].prompt = '手工精调提示词';
      const merged = mergeLedger(prev, deriveLedger(MANIFEST, { game: 'g' }));
      expect(merged.rows[0].status).toBe('generated');
      expect(merged.rows[0].prompt).toBe('手工精调提示词');
      expect(merged.rows[0].provenance?.model).toBeTruthy();
    });
  });
});

describe('皮肤槽写回（编译期游戏线·R2 ①）', () => {
  const SKINNED = {
    entities: {
      body: { Sprite: { type: 'Sprite', textureKey: 'q/hero', anchorX: 0.5, anchorY: 0.5, zOrder: 0 }, Shape: { type: 'Shape', width: 24, height: 24 }, Color: { type: 'Color', tint: 0x112233, alpha: 1 } },
    },
  };
  it('deriveRequirements 识别皮肤槽 → 行带 skinKey', () => {
    const l = deriveRequirements(SKINNED, { game: 'g' });
    expect(l.rows).toHaveLength(1);
    expect(l.rows[0].skinKey).toBe('q/hero');
    expect(l.rows[0].placeholder.current).toContain('皮肤槽 q/hero');
  });
  it('batchGenerate 对带 skinKey 的行双登记：gen id + 皮肤别名（写回=登记别名·机械验证 allowMock）', async () => {
    await withRoot(async (root) => {
      const l = deriveRequirements(SKINNED, { game: 'g' });
      const res = await batchGenerate(l, 'pixel-retro', { root, game: 'g', mock: true, only: l.rows[0].no, allowMock: true });
      expect(res.summary.generated).toBe(1);
      const idx = JSON.parse(readFileSync(join(root, 'public', 'games', 'g', 'art', 'index.json'), 'utf8'));
      const ids = idx.assets.map((a) => a.id);
      expect(ids).toContain('gen/mock/' + l.rows[0].no);
      expect(ids).toContain('q/hero'); // 别名=游戏消费的皮肤 key
      expect(idx.assets.find((a) => a.id === 'q/hero').tags).toContain('skin');
    });
  });
  it('dialectPrompt：行内 prompt（手拼回填）整体替代 query 作主体', () => {
    const pack = STYLE_PACKS['pixel-retro'];
    const row = { no: 'art-01', kind: 'sprite', query: 'hero', prompt: 'a very specific hand-tuned prompt' };
    expect(dialectPrompt(row, pack)).toContain('a very specific hand-tuned prompt');
    expect(dialectPrompt(row, pack)).not.toMatch(/^hero,/);
  });
});

describe('owner 07-09 review 四条修正', () => {
  it('① deriveDesc：行为角色/形体/色值/视角进详细描述（deriveLedger 与 deriveRequirements 都带 desc）', () => {
    const l = deriveLedger(MANIFEST, { game: 'g' });
    expect(l.rows.find((r) => r.slot.entity === 'hero').desc).toContain('rectangular shape');
    const REQ = { entities: { turret: { Shape: { type: 'Shape', radius: 10 }, Color: { type: 'Color', tint: 0x38bdf8 }, Perception: { targetTag: 1, sightRadius: 100 } } } };
    const r = deriveRequirements(REQ, { game: 'g' }).rows[0];
    expect(r.desc).toContain('defensive turret');
    expect(r.desc).toContain('#38bdf8');
    // 无手拼 prompt 时，desc 拼进生成主体
    expect(dialectPrompt(r, STYLE_PACKS['pixel-retro'])).toContain('defensive turret');
  });
  it('② 每游戏风格锚：ledger.artStyle.stylePrompt 拼进 prompt·merge 保留', () => {
    const pack = STYLE_PACKS['pixel-retro'];
    const row = { no: 'art-01', kind: 'sprite', query: 'hero' };
    expect(dialectPrompt(row, pack, '暗黑哥特风，血红铁灰')).toContain('暗黑哥特风');
    const prev = deriveLedger(MANIFEST, { game: 'g' });
    prev.artStyle = { stylePrompt: '暗黑哥特风' };
    const merged = mergeLedger(prev, deriveLedger(MANIFEST, { game: 'g' }));
    expect(merged.artStyle?.stylePrompt).toBe('暗黑哥特风');
  });
  it('④ provider 点名覆盖：3D 行认 tripo/meshy 切换·2D 行不吃 3D 覆盖', async () => {
    await withRoot(async (root) => {
      const l = deriveLedger(MANIFEST, { game: 'g' });
      const res = await batchGenerate(l, 'pixel-retro', { root, game: 'g', mock: true, provider: 'tripo' });
      expect(res.ok).toBe(true);
      const m3d = l.rows.find((r) => r.kind === 'model3d');
      expect(m3d.gen.provider).toBe('tripo'); // 默认 meshy → 点名 tripo
      const spr = l.rows.find((r) => r.kind === 'sprite');
      expect(spr.gen.provider).toBe('qwen'); // 2D 行不吃 3D 覆盖·回默认
    });
  });
});

describe('mergeLedger 带 manifest：slot 还在只是已钉死 ≠ 墓碑（REQ-WORKSHOP C1 回归·PUT 自动 derive 撞出）', () => {
  it('generated(mock) 行 + 槽位已钉死（非 art:）→ 保留原行；实体真删 → 仍墓碑', async () => {
    await withRoot(async (root) => {
      const prev = deriveLedger(MANIFEST, { game: 'g' });
      await batchGenerate(prev, 'pixel-retro', { root, game: 'g', mock: true }); // 全行 generated·mock
      const pinned = applyReplacements(JSON.parse(JSON.stringify(MANIFEST)), JSON.parse(JSON.stringify(prev)), { allowMock: true }).manifest;
      // 场景：manifest 已钉死（refs 非 art:），行还停在 generated（= mock regen 等真图的生产态）
      const merged = mergeLedger(prev, deriveLedger(pinned, { game: 'g' }), pinned);
      expect(merged.rows.find((r) => r.slot.entity === 'hero').status).toBe('generated'); // 不墓碑
      expect(merged.rows.find((r) => r.slot.entity === 'hero').gen?.mock).toBe(true); // 生成信息保留
      // 实体真删：即使带 manifest 也墓碑
      const smaller = JSON.parse(JSON.stringify(pinned));
      delete smaller.entities.hero;
      const merged2 = mergeLedger(prev, deriveLedger(smaller, { game: 'g' }), smaller);
      expect(merged2.rows.find((r) => r.slot.entity === 'hero').status).toBe('retired');
    });
  });
  it('prefab 模板内槽位同享判定（钉死不墓碑）', () => {
    const PRE = { entities: { lib: { PrefabLibrary: { templates: { coat: { entities: { body: { Sprite: { type: 'Sprite', textureKey: 'art:red coat' }, Shape: { type: 'Shape', width: 8, height: 8 } } } } } } } } };
    const prev = deriveLedger(PRE, { game: 'g' });
    prev.rows[0].status = 'generated'; prev.rows[0].gen = { mock: true, localId: 'gen/mock/art-01' };
    const pinned = JSON.parse(JSON.stringify(PRE));
    pinned.entities.lib.PrefabLibrary.templates.coat.entities.body.Sprite.textureKey = 'gen/mock/art-01';
    const merged = mergeLedger(prev, deriveLedger(pinned, { game: 'g' }), pinned);
    expect(merged.rows[0].status).toBe('generated'); // prefab 槽位仍在 → 保留
  });
});

describe('已替换槽位 re-derive 不墓碑（game-m 撞出·2026-07-09）', () => {
  it('replace 钉死后重推导：replaced 行保留原状·不标 retired', async () => {
    await withRoot(async (root) => {
      const prev = deriveLedger(MANIFEST, { game: 'g' });
      await batchGenerate(prev, 'pixel-retro', { root, game: 'g', mock: true });
      const rep = applyReplacements(JSON.parse(JSON.stringify(MANIFEST)), prev, { allowMock: true });
      // 重推导：替换后的 manifest 里 art: 引用已消失
      const merged = mergeLedger(prev, deriveLedger(rep.manifest, { game: 'g' }));
      const hero = merged.rows.find((r) => r.slot.entity === 'hero');
      expect(hero.status).toBe('replaced'); // 不是 retired
      expect(hero.gen?.localId).toBeTruthy(); // 生成信息保留
    });
  });
});

describe('deriveForGame：art: 槽为主，纯色块生成游戏回退需求推导（owner 2026-07-11「生成的游戏美术库空」）', () => {
  it('有 art: 皮肤槽 → 走 deriveLedger（不回退）', () => {
    const led = deriveForGame(MANIFEST, 'g');
    // MANIFEST 有 4 个 art: 槽（hero/slime/background/coin3d）→ deriveLedger 出 4 行、非空
    expect(led.rows.length).toBe(deriveLedger(MANIFEST, { game: 'g' }).rows.length);
    expect(led.rows.length).toBeGreaterThan(0);
  });
  it('纯色块（无 art: 无 Sprite 引用）→ deriveLedger 空 → 回退 deriveRequirements 出需求行', () => {
    const shapeOnly = { entities: {
      player: { Transform: { x: 1, y: 1 }, Shape: { kind: 'rect', width: 20, height: 20 }, Color: { tint: 0x38bdf8 } },
      enemy: { Transform: { x: 5, y: 1 }, Shape: { kind: 'circle', radius: 8 }, Color: { tint: 0xef4444 } },
      score: { Resource: { value: 0 } }, // 纯逻辑实体不算视觉
    } };
    expect(deriveLedger(shapeOnly, { game: 'g' }).rows.length).toBe(0);           // 老路：空
    const led = deriveForGame(shapeOnly, 'g');
    expect(led.rows.length).toBe(2);                                              // 回退：player + enemy（score 不计）
    expect(led.rows.every((r) => r.slot && r.slot.entity)).toBe(true);
  });
});

describe('台账按素材去重（owner 2026-07-12「100 平台共图却出 40 行」）', () => {
  // 100 个平台共用同一 art: 查询 + 1 个玩家 → 台账 2 行，不是 101 行。
  const many = () => {
    const entities = { player: { Sprite: { type: 'Sprite', textureKey: 'art:pixel hero' }, Shape: { type: 'Shape', width: 32, height: 32 } } };
    for (let i = 0; i < 100; i++) {
      entities['f' + i] = { Sprite: { type: 'Sprite', textureKey: 'art:stone brick platform' }, Shape: { type: 'Shape', width: 96, height: 16 } };
    }
    return { capabilities: ['l2-color'], entities };
  };

  it('同 (kind·组件·字段·query) 归并为一行·slots 背全量槽位·context 标共用数', () => {
    const l = deriveLedger(many(), { game: 'g' });
    expect(l.rows).toHaveLength(2);
    const plat = l.rows.find((r) => r.query === 'stone brick platform');
    expect(plat.slots).toHaveLength(100);
    expect(plat.slot).toEqual(plat.slots[0]); // 代表槽位=首槽（编号身份不漂移）
    expect(plat.context).toContain('共 100 处槽位共用');
    const hero = l.rows.find((r) => r.query === 'pixel hero');
    expect(hero.slots).toHaveLength(1);
  });

  it('applyReplacements 对去重行扇出：一张图写回全部 100 个槽位', () => {
    const mf = many();
    const l = deriveLedger(mf, { game: 'g' });
    const plat = l.rows.find((r) => r.query === 'stone brick platform');
    plat.status = 'generated';
    plat.gen = { localId: 'gen/art-01', mock: false };
    const res = applyReplacements(mf, l, { allowMock: false });
    expect(res.replaced).toBe(100);
    expect(res.manifest.entities.f0.Sprite.textureKey).toBe('gen/art-01');
    expect(res.manifest.entities.f99.Sprite.textureKey).toBe('gen/art-01');
    expect(res.manifest.entities.player.Sprite.textureKey).toBe('art:pixel hero'); // 别行不动
  });

  it('mergeLedger 吸收旧重复行：40 行旧账并进去重推导 → 收敛，零资产旧行不留墓碑', () => {
    const mf = many();
    // 旧世界：每槽位一行（模拟去重前的台账·全 placeholder）
    const prevRows = Object.keys(mf.entities).sort().map((eid, i) => ({
      no: 'art-' + String(i + 1).padStart(2, '0'), kind: 'sprite',
      slot: { entity: eid, component: 'Sprite', field: 'textureKey' },
      query: eid === 'player' ? 'pixel hero' : 'stone brick platform',
      spec: {}, desc: '', context: '', status: 'placeholder', gen: null, provenance: null,
    }));
    const merged = mergeLedger({ version: 1, game: 'g', rows: prevRows }, deriveLedger(mf, { game: 'g' }), mf);
    expect(merged.rows).toHaveLength(2); // 101 行旧账收敛到 2
    expect(merged.rows.every((r) => r.status !== 'retired')).toBe(true); // 吸收=删，不是墓碑
    // 已生成的旧重复行不吸收（有资产投入·保留待人裁）
    const prev2 = prevRows.map((r) => (r.no === 'art-05' ? { ...r, status: 'generated', gen: { localId: 'gen/x', mock: false } } : r));
    const merged2 = mergeLedger({ version: 1, game: 'g', rows: prev2 }, deriveLedger(mf, { game: 'g' }), mf);
    expect(merged2.rows.some((r) => r.gen && r.gen.localId === 'gen/x')).toBe(true);
  });
});
