import { describe, it, expect } from 'vitest';
import { sniffImage, fnv1a } from './sniff.js';

// 手工构造各格式最小文件头，验证纯字节嗅探（无 canvas/Image 依赖）。

function pngBytes(w: number, h: number, colorType: number, withTrns = false): Uint8Array {
  const out: number[] = [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // 签名
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, // IHDR len+type
    (w >>> 24) & 0xff, (w >>> 16) & 0xff, (w >>> 8) & 0xff, w & 0xff,
    (h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff,
    8, colorType, 0, 0, 0, // bitDepth colorType compression filter interlace
    0, 0, 0, 0, // crc（不校验）
  ];
  if (withTrns) out.push(0, 0, 0, 1, 0x74, 0x52, 0x4e, 0x53, 0x80, 0, 0, 0, 0); // tRNS len=1
  out.push(0, 0, 0, 0, 0x49, 0x44, 0x41, 0x54, 0, 0, 0, 0); // IDAT len=0
  return new Uint8Array(out);
}

describe('sniffImage — PNG', () => {
  it('RGBA(colorType 6) → alpha true', () => {
    expect(sniffImage(pngBytes(320, 200, 6))).toEqual({ format: 'png', width: 320, height: 200, alpha: true });
  });
  it('RGB(colorType 2) → alpha false', () => {
    expect(sniffImage(pngBytes(32, 32, 2))).toEqual({ format: 'png', width: 32, height: 32, alpha: false });
  });
  it('调色板(colorType 3) + tRNS → alpha true', () => {
    expect(sniffImage(pngBytes(16, 8, 3, true))?.alpha).toBe(true);
  });
  it('调色板无 tRNS → alpha false', () => {
    expect(sniffImage(pngBytes(16, 8, 3))?.alpha).toBe(false);
  });
});

describe('sniffImage — JPEG / WebP / GIF', () => {
  it('JPEG SOF0 读出宽高，alpha=false', () => {
    const b = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0 len=4
      0xff, 0xc0, 0x00, 0x0b, 8, 0x02, 0xd0, 0x05, 0x00, 3, 0, 0, 0, // SOF0: h=720 w=1280
    ]);
    expect(sniffImage(b)).toEqual({ format: 'jpeg', width: 1280, height: 720, alpha: false });
  });

  it('WebP VP8X 扩展头（带 alpha 位）', () => {
    const b = new Uint8Array(32);
    b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
    b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
    b.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
    b[16] = 10; // chunk size LE
    b[20] = 0x10; // flags: alpha
    b[24] = 99; // w-1=99 → 100
    b[27] = 49; // h-1=49 → 50
    expect(sniffImage(b)).toEqual({ format: 'webp', width: 100, height: 50, alpha: true });
  });

  it('WebP VP8L 无损（位打包宽高 + alpha hint）', () => {
    const v = (33 - 1) | ((17 - 1) << 14) | (1 << 28);
    const b = new Uint8Array(32);
    b.set([0x52, 0x49, 0x46, 0x46], 0);
    b.set([0x57, 0x45, 0x42, 0x50], 8);
    b.set([0x56, 0x50, 0x38, 0x4c], 12); // VP8L
    b[20] = 0x2f;
    b[21] = v & 0xff; b[22] = (v >> 8) & 0xff; b[23] = (v >> 16) & 0xff; b[24] = (v >> 24) & 0xff;
    expect(sniffImage(b)).toEqual({ format: 'webp', width: 33, height: 17, alpha: true });
  });

  it('GIF 宽高 LE，alpha 不可断定(undefined)', () => {
    const b = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xc8, 0x00, 0, 0]);
    expect(sniffImage(b)).toEqual({ format: 'gif', width: 320, height: 200, alpha: undefined });
  });

  it('不认识的字节 → undefined', () => {
    expect(sniffImage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeUndefined();
  });
});

describe('fnv1a', () => {
  it('确定且区分内容', () => {
    const a = fnv1a(new Uint8Array([1, 2, 3]));
    expect(a).toBe(fnv1a(new Uint8Array([1, 2, 3])));
    expect(a).not.toBe(fnv1a(new Uint8Array([1, 2, 4])));
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });
});
