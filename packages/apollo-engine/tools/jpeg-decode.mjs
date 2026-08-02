// 纯 JS baseline JPEG (SOF0/SOF1) 解码器 —— provider（seedream/火山方舟）真图返回 JPEG，而管线只有 PNG 解码，
// 小图 scale-back 缩不了（owner 2026-07-27 实证「生成图为 JPEG」）。此处补 baseline 解码 → resizeImageTo 缩放 + 再编码 PNG。
// 支持：APPn/COM 跳过·DQT·DHT·SOF0/1·DRI/RSTn·SOS·灰度 + YCbCr·4:4:4 / 4:2:2 / 4:2:0 子采样·非 16 整除裁剪。
// 不支持：progressive(SOF2)/算术编码/lossless(SOF3) → 明确抛错（API 出图罕见）。返回 { w, h, rgba: Buffer(w*h*4) }。

const ZIGZAG = new Int32Array([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
]);

// 8×8 IDCT 基（M[u][x] = C(u)·cos((2x+1)uπ/16)）——分离式·行列各乘 0.5·DC-only=DC/8（配 solid 色块自检）。
const IDCT_M = (() => {
  const m = [];
  for (let u = 0; u < 8; u++) {
    const cu = u === 0 ? Math.SQRT1_2 : 1;
    const row = new Float64Array(8);
    for (let x = 0; x < 8; x++) row[x] = cu * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    m.push(row);
  }
  return m;
})();

function idct1d(inp, io, is, out, oo, os) {
  for (let x = 0; x < 8; x++) {
    let s = 0;
    for (let u = 0; u < 8; u++) s += IDCT_M[u][x] * inp[io + u * is];
    out[oo + x * os] = 0.5 * s;
  }
}
function idct8x8(coef, out) { // coef: Float64Array(64) 自然序·已反量化；out: Float64Array(64) 空间域
  const tmp = new Float64Array(64);
  for (let r = 0; r < 8; r++) idct1d(coef, r * 8, 1, tmp, r * 8, 1); // 行
  for (let c = 0; c < 8; c++) idct1d(tmp, c, 8, out, c, 8);          // 列
}

class BitReader {
  constructor(data, pos) { this.data = data; this.pos = pos; this.cur = 0; this.cnt = 0; this.marker = 0; }
  bit() {
    if (this.cnt === 0) {
      if (this.marker) return 0; // 撞上 marker 后补 0（scan 尾）
      let b = this.data[this.pos++];
      if (b === 0xFF) {
        const n = this.data[this.pos++];
        if (n === 0) { /* 0xFF00 = 字面 0xFF（byte-stuffing） */ }
        else { this.marker = n; b = 0; } // RSTn / EOI / 其它 marker → 停
      }
      this.cur = b; this.cnt = 8;
    }
    this.cnt--;
    return (this.cur >> this.cnt) & 1;
  }
  receive(t) { let v = 0; for (let i = 0; i < t; i++) v = (v << 1) | this.bit(); return v; }
  restart() { // DRI：字节对齐 + 吞掉 FFDx 重启标记 + 复位
    this.cnt = 0;
    while (this.pos < this.data.length - 1) {
      if (this.data[this.pos] === 0xFF && this.data[this.pos + 1] >= 0xD0 && this.data[this.pos + 1] <= 0xD7) { this.pos += 2; break; }
      this.pos++;
    }
    this.marker = 0;
  }
}
const extend = (v, t) => (t === 0 ? 0 : (v < (1 << (t - 1)) ? v - (1 << t) + 1 : v));

function buildHuff(counts, symbols) { // canonical → Map(len<<16|code → symbol)
  const map = new Map(); let code = 0, k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < counts[len - 1]; i++) { map.set((len << 16) | code, symbols[k++]); code++; }
    code <<= 1;
  }
  return map;
}
function decodeHuff(br, tbl) {
  let code = 0;
  for (let len = 1; len <= 16; len++) {
    code = (code << 1) | br.bit();
    const s = tbl.get((len << 16) | code);
    if (s !== undefined) return s;
  }
  throw new Error('jpeg: 坏 Huffman 码');
}

export function decodeJpeg(buf) {
  if (!(buf && buf.length > 2 && buf[0] === 0xFF && buf[1] === 0xD8)) throw new Error('jpeg: 非 JPEG（无 SOI）');
  let pos = 2;
  const quant = {};      // id → Int32Array(64)（zigzag 序）
  const huffDC = {}, huffAC = {};
  let frame = null, restartInterval = 0;
  const u16 = (p) => (buf[p] << 8) | buf[p + 1];

  while (pos < buf.length) {
    if (buf[pos] !== 0xFF) { pos++; continue; }
    let marker = buf[pos + 1]; pos += 2;
    if (marker === 0xD9) break;                       // EOI
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue; // TEM/RST（无长度）
    const len = u16(pos); const seg = pos + 2, segEnd = pos + len; pos = segEnd;
    if (marker === 0xDB) { // DQT（可多表）
      let p = seg;
      while (p < segEnd) {
        const pq = buf[p] >> 4, tq = buf[p] & 15; p++;
        const t = new Int32Array(64);
        for (let i = 0; i < 64; i++) { t[i] = pq ? u16(p) : buf[p]; p += pq ? 2 : 1; }
        quant[tq] = t;
      }
    } else if (marker === 0xC0 || marker === 0xC1) { // SOF0/1 baseline
      const precision = buf[seg]; if (precision !== 8) throw new Error('jpeg: 仅支持 8-bit');
      const h = u16(seg + 1), w = u16(seg + 3), nc = buf[seg + 5];
      const comps = [];
      for (let i = 0; i < nc; i++) {
        const o = seg + 6 + i * 3;
        comps.push({ id: buf[o], h: buf[o + 1] >> 4, v: buf[o + 1] & 15, q: buf[o + 2] });
      }
      frame = { w, h, comps, hmax: Math.max(...comps.map((c) => c.h)), vmax: Math.max(...comps.map((c) => c.v)) };
    } else if (marker === 0xC2 || marker === 0xC3 || (marker >= 0xC5 && marker <= 0xCF && marker !== 0xC8)) {
      throw new Error(`jpeg: 不支持的 SOF 0x${marker.toString(16)}（progressive/lossless/算术编码）——让 provider 出 baseline JPEG 或 PNG`);
    } else if (marker === 0xC4) { // DHT（可多表）
      let p = seg;
      while (p < segEnd) {
        const tc = buf[p] >> 4, th = buf[p] & 15; p++;
        const counts = []; let total = 0;
        for (let i = 0; i < 16; i++) { counts.push(buf[p + i]); total += buf[p + i]; }
        p += 16;
        const symbols = []; for (let i = 0; i < total; i++) symbols.push(buf[p + i]);
        p += total;
        (tc ? huffAC : huffDC)[th] = buildHuff(counts, symbols);
      }
    } else if (marker === 0xDD) { // DRI
      restartInterval = u16(seg);
    } else if (marker === 0xDA) { // SOS → 熵解码
      if (!frame) throw new Error('jpeg: SOS 前无 SOF');
      const ns = buf[seg]; const scan = [];
      for (let i = 0; i < ns; i++) {
        const cid = buf[seg + 1 + i * 2], td = buf[seg + 2 + i * 2] >> 4, ta = buf[seg + 2 + i * 2] & 15;
        const comp = frame.comps.find((c) => c.id === cid);
        scan.push({ comp, td, ta });
      }
      const dataStart = seg + 1 + ns * 2 + 3; // 跳 Ss/Se/AhAl
      return entropyDecode(buf, dataStart, frame, scan, quant, huffDC, huffAC, restartInterval);
    }
  }
  throw new Error('jpeg: 未找到扫描数据（SOS）');
}

function entropyDecode(buf, dataStart, frame, scan, quant, huffDC, huffAC, restartInterval) {
  const { w, h, comps, hmax, vmax } = frame;
  const mcuW = 8 * hmax, mcuH = 8 * vmax;
  const mcusX = Math.ceil(w / mcuW), mcusY = Math.ceil(h / mcuH);
  // 每分量的整幅平面（MCU 对齐分辨率·Uint8 0..255）
  for (const c of comps) {
    c.pw = mcusX * c.h * 8; c.ph = mcusY * c.v * 8;
    c.plane = new Uint8ClampedArray(c.pw * c.ph);
    c.pred = 0;
  }
  const br = new BitReader(buf, dataStart);
  const coef = new Float64Array(64), spatial = new Float64Array(64);

  const decodeBlock = (s, cx, cy) => { // cx,cy = 块在分量平面里的块坐标
    const c = s.comp;
    coef.fill(0);
    const t = decodeHuff(br, huffDC[s.td]);
    c.pred += extend(br.receive(t), t);
    coef[0] = c.pred * quant[c.q][0];
    let k = 1;
    while (k < 64) {
      const rs = decodeHuff(br, huffAC[s.ta]); const r = rs >> 4, sz = rs & 15;
      if (sz === 0) { if (r === 15) { k += 16; continue; } break; } // ZRL / EOB
      k += r; if (k >= 64) break;
      coef[ZIGZAG[k]] = extend(br.receive(sz), sz) * quant[c.q][k];
      k++;
    }
    idct8x8(coef, spatial);
    const px0 = cx * 8, py0 = cy * 8;
    for (let y = 0; y < 8; y++) {
      const row = (py0 + y) * c.pw + px0;
      for (let x = 0; x < 8; x++) c.plane[row + x] = spatial[y * 8 + x] + 128; // level shift + clamp
    }
  };

  let mcu = 0;
  for (let my = 0; my < mcusY; my++) {
    for (let mx = 0; mx < mcusX; mx++) {
      if (restartInterval && mcu > 0 && mcu % restartInterval === 0) { br.restart(); for (const c of comps) c.pred = 0; }
      for (const s of scan) {
        for (let by = 0; by < s.comp.v; by++) for (let bx = 0; bx < s.comp.h; bx++) {
          decodeBlock(s, mx * s.comp.h + bx, my * s.comp.v + by);
        }
      }
      mcu++;
    }
  }

  // 组装 RGBA（YCbCr→RGB·最近邻上采样·裁到 w×h）
  const rgba = Buffer.alloc(w * h * 4);
  const gray = comps.length === 1;
  const Y = comps[0], Cb = comps[1], Cr = comps[2];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const yv = Y.plane[((y * Y.v / vmax) | 0) * Y.pw + ((x * Y.h / hmax) | 0)];
      let R, G, B;
      if (gray) { R = G = B = yv; }
      else {
        const cbv = Cb.plane[((y * Cb.v / vmax) | 0) * Cb.pw + ((x * Cb.h / hmax) | 0)] - 128;
        const crv = Cr.plane[((y * Cr.v / vmax) | 0) * Cr.pw + ((x * Cr.h / hmax) | 0)] - 128;
        R = yv + 1.402 * crv;
        G = yv - 0.344136 * cbv - 0.714136 * crv;
        B = yv + 1.772 * cbv;
      }
      const o = (y * w + x) * 4;
      rgba[o] = R < 0 ? 0 : R > 255 ? 255 : R;
      rgba[o + 1] = G < 0 ? 0 : G > 255 ? 255 : G;
      rgba[o + 2] = B < 0 ? 0 : B > 255 ? 255 : B;
      rgba[o + 3] = 255;
    }
  }
  return { w, h, rgba };
}
