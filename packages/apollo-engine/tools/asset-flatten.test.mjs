// asset-flatten 自检：透明底精灵 → 压不透明底 albedo（source-over 正确·确定性·幂等·尺寸守卫）。
import { describe, it, expect } from 'vitest';
import { flatten, compositeOver, solidCanvas, transparentPct, hexToRgb } from './asset-flatten.mjs';

// 造 4×1：像素0=不透明红·像素1=半透明蓝(a=128)·像素2,3=全透明
function glyph4() {
  const rgba = Buffer.from([200, 0, 0, 255, 0, 0, 200, 128, 0, 0, 0, 0, 0, 0, 0, 0]);
  return { w: 4, h: 1, rgba };
}
const px = (img, i) => [img.rgba[i * 4], img.rgba[i * 4 + 1], img.rgba[i * 4 + 2], img.rgba[i * 4 + 3]];

describe('asset-flatten · 透明→不透明 albedo', () => {
  it('hexToRgb 解析', () => { expect(hexToRgb('#faf4e4')).toEqual([250, 244, 228]); });

  it('压底后 100% 不透明（全 alpha=255）', () => {
    const out = flatten(glyph4(), { bg: [255, 255, 255] });
    expect(transparentPct(out)).toBe(0);
    for (let i = 0; i < 4; i++) expect(px(out, i)[3]).toBe(255);
  });

  it('source-over 混色正确：不透明留原·半透明混·全透明=底', () => {
    const out = flatten(glyph4(), { bg: [255, 255, 255] });
    expect(px(out, 0)).toEqual([200, 0, 0, 255]);            // 不透明红原样
    expect(px(out, 1)).toEqual([127, 127, 227, 255]);        // 蓝[0,0,200] a=128/255 叠白：R/G=round(255*(1-128/255))=127·B=round(200*128/255+255*127/255)=227
    expect(px(out, 2)).toEqual([255, 255, 255, 255]);        // 全透明→底色白
  });

  it('确定性：同输入两次逐字节一致', () => {
    const a = flatten(glyph4(), { bg: [250, 244, 228] }).rgba;
    const b = flatten(glyph4(), { bg: [250, 244, 228] }).rgba;
    expect(Buffer.compare(a, b)).toBe(0);
  });

  it('幂等：已不透明图再压底像素不变', () => {
    const opaque = flatten(glyph4(), { bg: [250, 244, 228] });
    const again = flatten(opaque, { bg: [10, 20, 30] }); // 底色变了也无所谓——全不透明遮住底
    expect(Buffer.compare(opaque.rgba, again.rgba)).toBe(0);
  });

  it('base 图先叠：底 → base → glyph', () => {
    const base = solidCanvas(4, 1, [0, 100, 0]);   // 绿 base
    const g = { w: 4, h: 1, rgba: Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }; // 全透明
    const out = flatten(g, { base, bg: [255, 0, 0] });
    expect(px(out, 0)).toEqual([0, 100, 0, 255]);  // glyph 透明→露 base 绿（非底红）
  });

  it('尺寸不一致守卫', () => {
    expect(() => compositeOver(solidCanvas(2, 1, [0, 0, 0]), solidCanvas(3, 1, [0, 0, 0]))).toThrow(/尺寸/);
  });
});
