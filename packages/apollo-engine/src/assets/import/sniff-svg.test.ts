import { describe, it, expect } from 'vitest';
import { sniffImage } from './sniff.js';

const enc = (s: string) => new TextEncoder().encode(s);

describe('sniffImage — SVG 矢量', () => {
  it('从 viewBox 取尺寸（game-icons 形态）', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z"/></svg>';
    expect(sniffImage(enc(svg))).toEqual({ format: 'svg', width: 512, height: 512, alpha: true });
  });

  it('无 viewBox 时回退 width/height 属性', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><rect/></svg>';
    const info = sniffImage(enc(svg))!;
    expect(info.format).toBe('svg');
    expect(info.width).toBe(64);
    expect(info.height).toBe(48);
  });

  it('带 <?xml 声明的 SVG 也认', () => {
    const svg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg viewBox="0 0 100 200"><g/></svg>';
    const info = sniffImage(enc(svg))!;
    expect(info.format).toBe('svg');
    expect(info.width).toBe(100);
    expect(info.height).toBe(200);
  });

  it('非 SVG 文本 → undefined（不误判）', () => {
    expect(sniffImage(enc('<html><body>not svg</body></html>'))).toBeUndefined();
    expect(sniffImage(enc('{"json":true}'))).toBeUndefined();
  });

  it('PNG 仍优先按二进制识别（不被 SVG 文本分支抢）', () => {
    const png = new Uint8Array(26);
    png.set([0x89, 0x50, 0x4e, 0x47], 0); // PNG 签名
    png[19] = 8; // width=8
    png[23] = 8; // height=8
    png[25] = 6; // colorType RGBA
    expect(sniffImage(png)?.format).toBe('png');
  });
});
