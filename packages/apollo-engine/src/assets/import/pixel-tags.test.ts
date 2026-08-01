import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { decodePng } from './png-decode.js';
import { pixelTags, pixelStats, auditSemanticTags } from './pixel-tags.js';

// ── 合成 RGBA 画布 ──
function canvas(w: number, h: number, fill: [number, number, number, number]): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set(fill, i * 4);
  return px;
}
function blit(px: Uint8Array, w: number, x0: number, y0: number, bw: number, bh: number, fill: [number, number, number, number]): void {
  for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) px.set(fill, (y * w + x) * 4);
}

describe('pixel-tags — 事实标签', () => {
  it('全幅纯红：full_frame + red + vivid + warm_palette', () => {
    const { tags } = pixelTags(canvas(32, 32, [220, 30, 30, 255]), 32, 32);
    expect(tags).toContain('full_frame');
    expect(tags).toContain('red');
    expect(tags).toContain('vivid');
    expect(tags).toContain('warm_palette');
  });

  it('透明底上的 8×8 蓝色小块：small_subject + blue + cool_palette，不 full_frame', () => {
    const px = canvas(32, 32, [0, 0, 0, 0]);
    blit(px, 32, 12, 12, 8, 8, [40, 80, 230, 255]);
    const { tags, stats } = pixelTags(px, 32, 32);
    expect(stats.coverage).toBeCloseTo(64 / 1024, 5);
    expect(tags).toContain('small_subject');
    expect(tags).toContain('blue');
    expect(tags).toContain('cool_palette');
    expect(tags).not.toContain('full_frame');
  });

  it('半透明青色：translucent', () => {
    const px = canvas(16, 16, [0, 0, 0, 0]);
    blit(px, 16, 2, 2, 12, 12, [80, 220, 220, 128]);
    expect(pixelTags(px, 16, 16).tags).toContain('translucent');
  });

  it('暗灰全幅：gray + dark + monochrome', () => {
    const { tags } = pixelTags(canvas(16, 16, [50, 52, 55, 255]), 16, 16);
    expect(tags).toEqual(expect.arrayContaining(['full_frame', 'gray', 'dark', 'monochrome']));
  });

  it('高瘦主体：tall_shape；全透明图：零标签', () => {
    const px = canvas(32, 32, [0, 0, 0, 0]);
    blit(px, 32, 14, 4, 4, 24, [200, 200, 60, 255]);
    expect(pixelTags(px, 32, 32).tags).toContain('tall_shape');
    expect(pixelTags(canvas(8, 8, [0, 0, 0, 0]), 8, 8).tags).toEqual([]);
  });

  it('确定性：同输入同输出（定序）', () => {
    const px = canvas(32, 32, [0, 0, 0, 0]);
    blit(px, 32, 4, 4, 24, 24, [180, 60, 200, 255]);
    expect(pixelTags(px, 32, 32).tags).toEqual(pixelTags(px, 32, 32).tags);
  });
});

describe('pixel-tags — 语义对账（嫌疑单）', () => {
  it('声称 fire 但全图蓝色 → 嫌疑；声称 ice 则无嫌疑', () => {
    const stats = pixelStats(canvas(16, 16, [40, 90, 230, 255]), 16, 16);
    const sus = auditSemanticTags(['fire', 'boss'], stats);
    expect(sus).toHaveLength(1);
    expect(sus[0]).toMatchObject({ claim: 'fire' });
    expect(auditSemanticTags(['ice'], stats)).toHaveLength(0);
  });

  it('jellyfish 案：青色半透明 + 声称 electric → 命中嫌疑（yellow+cyan+white 其实够? 青色算 cyan）', () => {
    // electric 期望 yellow+cyan+white ≥ 0.10 —— 全青图其实"有色证"；真嫌疑的是 fire 类。
    const stats = pixelStats(canvas(16, 16, [80, 220, 220, 255]), 16, 16);
    expect(auditSemanticTags(['electric'], stats)).toHaveLength(0);
    expect(auditSemanticTags(['fire'], stats)).toHaveLength(1);
  });
});

describe('png-decode — 真字节解码', () => {
  function crc32(buf: Uint8Array): number {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  }
  function chunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }
  function buildPng(w: number, h: number, colorType: number, raw: Uint8Array, plte?: Uint8Array, trns?: Uint8Array): Uint8Array {
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, w);
    dv.setUint32(4, h);
    ihdr[8] = 8;
    ihdr[9] = colorType;
    const parts = [
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      ...(plte ? [chunk('PLTE', plte)] : []),
      ...(trns ? [chunk('tRNS', trns)] : []),
      chunk('IDAT', new Uint8Array(deflateSync(raw))),
      chunk('IEND', new Uint8Array(0)),
    ];
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  }

  it('RGBA 2×2（filter 0）解码出原像素', () => {
    // 行 = filter字节 + RGBA*2
    const raw = new Uint8Array([
      0, 255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 0, 255, 255, 255, 255, 255, 128,
    ]);
    const { w, h, px } = decodePng(buildPng(2, 2, 6, raw));
    expect([w, h]).toEqual([2, 2]);
    expect([...px.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...px.subarray(12, 16)]).toEqual([255, 255, 255, 128]);
  });

  it('调色板 + tRNS：索引透明生效；sub 滤波(1)重建', () => {
    const plte = new Uint8Array([255, 0, 0, 0, 255, 0]); // 0=红 1=绿
    const trns = new Uint8Array([255, 0]); // 索引1全透明
    const raw = new Uint8Array([1, 0, 1]); // filter=1(sub)：0, 0+1=1
    const { px } = decodePng(buildPng(2, 1, 3, raw, plte, trns));
    expect([...px.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect(px[7]).toBe(0); // 第二像素 alpha=0
  });

  it('非 PNG 抛错', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow(/png/);
  });
});

describe('png-decode — Adam7 隔行（真实仓库文件冒烟）', () => {
  it('elephant_old.png（隔行）解码出连贯主体而非噪点', async () => {
    const { readFileSync } = await import('node:fs');
    const buf = readFileSync('assets/FreeArtLib/monster/animals/elephant_old.png');
    expect(buf[28]).toBe(1); // IHDR interlace 标志确为 Adam7
    const { w, h, px } = decodePng(buf);
    expect([w, h]).toEqual([32, 32]);
    // 噪点的特征是几乎逐像素独立随机；正常精灵相邻像素高度相关。
    // 用「相邻像素完全相等的比例」做代理：解码正确时应显著 > 0.3。
    let same = 0, cnt = 0;
    for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) {
      const a = (y * w + x) * 4, b = (y * w + x - 1) * 4;
      cnt++;
      if (px[a] === px[b] && px[a + 1] === px[b + 1] && px[a + 2] === px[b + 2] && px[a + 3] === px[b + 3]) same++;
    }
    expect(same / cnt).toBeGreaterThan(0.3);
  });
});
