// 图像文件头嗅探 —— 纯字节解析，不依赖 canvas/Image（可在 Node/vitest 跑，确定性）。
// 导入器用它做规格侦测（宽高/格式/透明通道），写进 AssetIndexEntry.spec。
// 覆盖：PNG / JPEG / WebP(VP8X·VP8·VP8L) / GIF / SVG(矢量，取 viewBox 尺寸)。

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'svg';

export interface ImageInfo {
  readonly format: ImageFormat;
  readonly width: number;
  readonly height: number;
  /** 是否带透明通道；undefined = 该格式无法从头部断定（如 GIF 的逐帧透明色）。 */
  readonly alpha?: boolean;
}

function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
function u16be(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}
function u16le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}
function u24le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
}
function u32le(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}
function ascii(b: Uint8Array, o: number, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(b[o + i]);
  return s;
}

function sniffPng(b: Uint8Array): ImageInfo | undefined {
  // 签名 + IHDR：w@16 h@20 (u32BE)，bitDepth@24，colorType@25。
  if (b.length < 26) return undefined;
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  const colorType = b[25];
  // colorType 4(灰+α)/6(RGBA) 必有 α；0/2 无；3(调色板) 看是否有 tRNS 块。
  let alpha = colorType === 4 || colorType === 6;
  if (colorType === 3) {
    let pos = 8;
    while (pos + 8 <= b.length) {
      const size = u32be(b, pos);
      const type = ascii(b, pos + 4, 4);
      if (type === 'tRNS') {
        alpha = true;
        break;
      }
      if (type === 'IDAT' || type === 'IEND') break;
      pos += 12 + size; // len(4)+type(4)+data+crc(4)
    }
  }
  return { format: 'png', width, height, alpha };
}

function sniffJpeg(b: Uint8Array): ImageInfo | undefined {
  // 扫 marker 找 SOFn（C0–CF，除 C4/C8/CC）：payload = len(2) precision(1) h(2) w(2)。
  let pos = 2;
  while (pos + 9 < b.length) {
    if (b[pos] !== 0xff) {
      pos++;
      continue;
    }
    const m = b[pos + 1];
    if (m === 0xff) {
      pos++; // 填充 FF
      continue;
    }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { format: 'jpeg', width: u16be(b, pos + 7), height: u16be(b, pos + 5), alpha: false };
    }
    if ((m >= 0xd0 && m <= 0xd9) || m === 0x01) {
      pos += 2; // 独立 marker 无 payload
      continue;
    }
    pos += 2 + u16be(b, pos + 2);
  }
  return undefined;
}

function sniffWebp(b: Uint8Array): ImageInfo | undefined {
  if (b.length < 30) return undefined;
  const cc = ascii(b, 12, 4);
  if (cc === 'VP8X') {
    // 扩展头：flags@20（bit4=alpha），画布 w-1@24 h-1@27（u24LE）。
    const alpha = (b[20] & 0x10) !== 0;
    return { format: 'webp', width: u24le(b, 24) + 1, height: u24le(b, 27) + 1, alpha };
  }
  if (cc === 'VP8 ') {
    // 有损：keyframe 起始码 9D 01 2A @23，w@26 h@28（u16LE 低 14 位）。
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return undefined;
    return { format: 'webp', width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff, alpha: false };
  }
  if (cc === 'VP8L') {
    // 无损：sig 0x2F@20，随后 u32LE：bits0-13=w-1，14-27=h-1，28=alpha。
    if (b[20] !== 0x2f) return undefined;
    const v = u32le(b, 21);
    return { format: 'webp', width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1, alpha: ((v >> 28) & 1) === 1 };
  }
  return undefined;
}

function sniffGif(b: Uint8Array): ImageInfo | undefined {
  if (b.length < 10) return undefined;
  return { format: 'gif', width: u16le(b, 6), height: u16le(b, 8), alpha: undefined };
}

function sniffSvg(b: Uint8Array): ImageInfo | undefined {
  // SVG 是文本：解码开头一段，从 <svg ...> 的 viewBox（优先）或 width/height 取尺寸。
  const head = ascii(b, 0, Math.min(b.length, 1024));
  const tag = head.match(/<svg\b[^>]*>/i)?.[0];
  if (!tag) return undefined;
  let width = 0;
  let height = 0;
  const vb = tag.match(/viewBox\s*=\s*["']\s*[\d.+-]+\s+[\d.+-]+\s+([\d.+-]+)\s+([\d.+-]+)/i);
  if (vb) {
    width = Math.round(parseFloat(vb[1]));
    height = Math.round(parseFloat(vb[2]));
  }
  if (!width) width = Math.round(parseFloat(tag.match(/\bwidth\s*=\s*["']?\s*([\d.]+)/i)?.[1] ?? '0'));
  if (!height) height = Math.round(parseFloat(tag.match(/\bheight\s*=\s*["']?\s*([\d.]+)/i)?.[1] ?? '0'));
  return { format: 'svg', width, height, alpha: true }; // 矢量默认含透明背景
}

/** 嗅探图像字节 → 格式/宽高/透明。不认识的格式返回 undefined（导入器据此标"未侦测"）。 */
export function sniffImage(bytes: Uint8Array): ImageInfo | undefined {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return sniffPng(b);
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return sniffJpeg(b);
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return sniffWebp(b);
  if (b.length >= 6 && ascii(b, 0, 4) === 'GIF8') return sniffGif(b);
  // SVG（文本，放最后）：开头 ~512 字节里出现 <svg 即按矢量解析。
  if (/<svg[\s>]/i.test(ascii(b, 0, Math.min(b.length, 512)))) return sniffSvg(b);
  return undefined;
}

/** FNV-1a 32 位内容哈希（十六进制）—— 导入器重复文件检测用；非加密用途。 */
export function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
