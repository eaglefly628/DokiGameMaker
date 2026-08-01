// 程序化表面贴图（normal/roughness·render-only·零美术文件）：确定性生成 + 法线编码合理。
import { describe, it, expect } from 'vitest';
import { buildSurfaceMaps } from './surface-tex.js';
import type { SurfaceDetail } from '@engine/protocol/components.js';

const N = 128;

describe('surface-tex：程序化 normal/roughness 贴图', () => {
  it('生成 normal + roughness DataTexture（128² RGBA·RepeatWrapping·repeat=tiles）', () => {
    const s: SurfaceDetail = { pattern: 'noise', tiles: 4, normal: 1, rough: 0.4 };
    const { normalMap, roughnessMap } = buildSurfaceMaps(s, 0.8);
    expect(normalMap.image.width).toBe(N);
    expect(normalMap.image.height).toBe(N);
    expect((normalMap.image.data as Uint8Array).length).toBe(N * N * 4);
    expect(normalMap.repeat.x).toBe(4);
    expect(roughnessMap.repeat.y).toBe(4);
    expect(normalMap.wrapS).toBe(1000); // THREE.RepeatWrapping === 1000
  });

  it('法线 Z 分量恒朝外（编码 >0.5·正切空间法线指向表面外）', () => {
    const { normalMap } = buildSurfaceMaps({ pattern: 'bumps', normal: 1 }, 0.5);
    const d = normalMap.image.data as Uint8Array;
    let minB = 255;
    for (let i = 0; i < d.length; i += 4) minB = Math.min(minB, d[i + 2]!); // B = nz 编码
    expect(minB).toBeGreaterThan(127); // nz>0 → 编码 >0.5*255
  });

  it('确定性：同参数两次生成逐字节一致（无随机·稳定不闪）', () => {
    const s: SurfaceDetail = { pattern: 'scratches', tiles: 3, normal: 0.6, rough: 0.5, scale: 1.2 };
    const a = buildSurfaceMaps(s, 0.7).normalMap.image.data as Uint8Array;
    const b = buildSurfaceMaps(s, 0.7).normalMap.image.data as Uint8Array;
    expect(Array.from(a.slice(0, 64))).toEqual(Array.from(b.slice(0, 64)));
  });

  it('bumps 图有真实浮雕（nx 横向法线起伏·非全平 127）', () => {
    // 注：normal 控的是 material.normalScale（运行时·不改图）；图本身按固定基准强度烤出浮雕。
    const d = buildSurfaceMaps({ pattern: 'bumps', scale: 1 }, 0.5).normalMap.image.data as Uint8Array;
    let m = 0, m2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { m += d[i]!; m2 += d[i]! * d[i]!; n++; } // R = nx 编码
    const variance = m2 / n - (m / n) ** 2;
    expect(variance).toBeGreaterThan(50); // 蛋格凸起 → 法线横偏明显（平面方差≈0）
    expect(Math.round(m / n)).toBeGreaterThan(110); // 均值≈127（左右对称偏移抵消）
  });
});
