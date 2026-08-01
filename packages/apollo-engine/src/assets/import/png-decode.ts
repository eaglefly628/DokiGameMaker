// PNG 解码（纯函数，零依赖）—— 像素扫描/打标的输入端。
// 支持 bitDepth 8 的全部常见 colorType（灰/RGB/调色板/灰+α/RGBA），DCSS 与一般 2D 贴图均在此范围。
// 注：scripts/contact-sheet.mjs 内含同源的独立副本（它是零依赖单文件审计工具，不进 src 构建）。
import { inflateSync } from 'node:zlib';

export interface DecodedPng {
  readonly w: number;
  readonly h: number;
  /** RGBA，每像素 4 字节。 */
  readonly px: Uint8Array;
}

function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
function ascii(b: Uint8Array, o: number, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(b[o + i]);
  return s;
}

const paeth = (a: number, b: number, c: number): number => {
  const pa = Math.abs(b - c);
  const pb = Math.abs(a - c);
  const pc = Math.abs(a + b - 2 * c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** 解滤波一个子图（宽 w × 高 h，CH 通道），从 raw[offset] 起读，返回重建字节与新偏移。 */
function unfilter(raw: Uint8Array, offset: number, w: number, h: number, CH: number): { data: Uint8Array; next: number } {
  const stride = w * CH;
  const out = new Uint8Array(h * stride);
  let p = offset;
  for (let y = 0; y < h; y++) {
    const ft = raw[p++];
    const prevOff = (y - 1) * stride;
    const curOff = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= CH ? out[curOff + x - CH] : 0;
      const b = y > 0 ? out[prevOff + x] : 0;
      const c = x >= CH && y > 0 ? out[prevOff + x - CH] : 0;
      let v = raw[p + x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) v += paeth(a, b, c);
      out[curOff + x] = v & 0xff;
    }
    p += stride;
  }
  return { data: out, next: p };
}

// Adam7 七趟：起点 (x0,y0) 与步长 (dx,dy)。
const ADAM7: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
];

/** 解码 PNG 字节 → RGBA。支持顺序与 Adam7 隔行；非 PNG / 不支持的位深抛错（调用方决定跳过策略）。 */
export function decodePng(buf: Uint8Array): DecodedPng {
  if (buf.length < 8 || u32be(buf, 0) !== 0x89504e47) throw new Error('not a png');
  let w = 0;
  let h = 0;
  let depth = 0;
  let color = 0;
  let interlace = 0;
  let plte: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  for (let p = 8; p + 8 <= buf.length; ) {
    const len = u32be(buf, p);
    const type = ascii(buf, p + 4, 4);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = u32be(data, 0);
      h = u32be(data, 4);
      depth = data[8];
      color = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
  const CH = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color];
  if (!CH) throw new Error(`unsupported color type ${color}`);

  const total = idat.reduce((n, d) => n + d.length, 0);
  const joined = new Uint8Array(total);
  let off = 0;
  for (const d of idat) {
    joined.set(d, off);
    off += d.length;
  }
  const raw = inflateSync(joined);

  const stride = w * CH;
  let out: Uint8Array;
  if (interlace === 1) {
    // Adam7：逐趟解滤波后按步长散布回全图（曾因忽略此标志把隔行图渲染成噪点）。
    out = new Uint8Array(h * stride);
    let pos = 0;
    for (const [x0, y0, dx, dy] of ADAM7) {
      const pw = Math.ceil((w - x0) / dx);
      const ph = Math.ceil((h - y0) / dy);
      if (pw <= 0 || ph <= 0) continue;
      const { data, next } = unfilter(raw, pos, pw, ph, CH);
      pos = next;
      for (let j = 0; j < ph; j++) {
        for (let i = 0; i < pw; i++) {
          const src = (j * pw + i) * CH;
          const dst = ((y0 + j * dy) * w + (x0 + i * dx)) * CH;
          for (let ch = 0; ch < CH; ch++) out[dst + ch] = data[src + ch];
        }
      }
    }
  } else {
    out = unfilter(raw, 0, w, h, CH).data;
  }

  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let r = 0;
    let g = 0;
    let bl = 0;
    let al = 255;
    if (color === 6) {
      r = out[i * 4];
      g = out[i * 4 + 1];
      bl = out[i * 4 + 2];
      al = out[i * 4 + 3];
    } else if (color === 2) {
      r = out[i * 3];
      g = out[i * 3 + 1];
      bl = out[i * 3 + 2];
    } else if (color === 3) {
      const idx = out[i];
      if (plte) {
        r = plte[idx * 3];
        g = plte[idx * 3 + 1];
        bl = plte[idx * 3 + 2];
      }
      al = trns && idx < trns.length ? trns[idx] : 255;
    } else if (color === 0) {
      r = g = bl = out[i];
    } else {
      r = g = bl = out[i * 2];
      al = out[i * 2 + 1];
    }
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = bl;
    px[i * 4 + 3] = al;
  }
  return { w, h, px };
}
