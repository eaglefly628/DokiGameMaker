// asset-matte 自检：确定性 flood 抠图（背景去、主体留、主体内同色不误删）+ despill + png 编解码 + rembg mock。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encodePngRGBA, decodePng, floodMatte, matteFile } from './asset-matte.mjs';

// 造图：绿背景(0,200,0) + 红主体(200,0,0·8..23) + 主体内部一块绿(13..18)
const W = 32, H = 32;
function subjectImg() {
  const rgba = Buffer.alloc(W * H * 4);
  const set = (x, y, r, g, b) => { const o = (y * W + x) * 4; rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, 0, 200, 0);
  for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) set(x, y, 200, 0, 0);
  for (let y = 13; y < 19; y++) for (let x = 13; x < 19; x++) set(x, y, 0, 200, 0);
  return { w: W, h: H, rgba };
}
const alphaAt = (d, x, y) => d.rgba[(y * W + x) * 4 + 3];

describe('asset-matte · 确定性 flood 抠图', () => {
  it('背景去(alpha0)·主体留(255)·主体内同色被包住不误删', () => {
    const m = floodMatte(subjectImg(), { tolerance: 40 });
    expect(m.bg).toEqual([0, 200, 0]);
    expect(m.rgba[(0 * W + 0) * 4 + 3]).toBe(0);          // 背景角透明
    expect(m.rgba[(10 * W + 10) * 4 + 3]).toBe(255);       // 红主体不透明
    expect(m.rgba[(16 * W + 16) * 4 + 3]).toBe(255);       // 主体内部绿·flood 进不去→保留
    expect(m.removed).toBe(W * H - 16 * 16);               // 只去背景(1024-256=768)
  });

  it('确定性：同输入两次跑结果一致', () => {
    const a = floodMatte(subjectImg(), { tolerance: 40 });
    const b = floodMatte(subjectImg(), { tolerance: 40 });
    expect(Buffer.compare(a.rgba, b.rgba)).toBe(0);
  });

  it('png 编解码往返：RGBA 无损', () => {
    const img = subjectImg();
    const d = decodePng(encodePngRGBA(img.w, img.h, img.rgba));
    expect(d.w).toBe(W); expect(d.h).toBe(H);
    expect(Buffer.compare(d.rgba, img.rgba)).toBe(0);
  });
});

describe('asset-matte · rembg 兜底档（mock 门控）', () => {
  let dir, inPath;
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'matte-')); inPath = join(dir, 'in.png'); const i = subjectImg(); writeFileSync(inPath, encodePngRGBA(i.w, i.h, i.rgba)); });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('无 rembg → mock：产合法 RGBA png + provenance 标 mock（不静默顶替）', () => {
    const res = matteFile(inPath, { mode: 'rembg', mock: true });
    expect(res.provenance).toMatchObject({ matte: 'rembg', mock: true });
    const d = decodePng(res.buffer);
    expect(d.w).toBe(W); expect(d.h).toBe(H); // 合法可解码
  });

  it('flood 档 matteFile：provenance 记方式/背景色/去背像素', () => {
    const res = matteFile(inPath, { mode: 'flood', tolerance: 40 });
    expect(res.provenance).toMatchObject({ matte: 'flood-fill', bg: [0, 200, 0] });
    expect(res.provenance.removedPx).toBe(768);
  });
});
