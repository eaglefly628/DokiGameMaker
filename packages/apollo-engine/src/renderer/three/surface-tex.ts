import * as THREE from 'three';
import type { SurfaceDetail } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  three/surface-tex —— 程序化表面贴图（TA Phase 5·render-only）。
//  据 `SurfaceDetail` 数据**生成** normal + roughness 贴图（DataTexture）——**零美术文件**，
//  同「天空盒按 Sky3D 程序化生成纹理」先例。确定性生成（无随机·同参数同图·稳定不闪）。
//  normal/roughness 是线性数据贴图（非 sRGB）→ DataTexture 默认 NoColorSpace 即对。
// ═══════════════════════════════════════════════════════════════

const RES = 128; // 贴图边长

// 整数 hash → [0,1)（确定性·无随机）。
function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t);
// value noise（双线性插值的格点 hash）。
function valNoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = smooth(x - xi), v = smooth(y - yi);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
// fbm（3 倍频叠加·~0..1）。
function fbm(x: number, y: number): number {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 3; i++) { s += a * valNoise(x * f, y * f); f *= 2; a *= 0.5; }
  return s / 0.875;
}

// 高度场 H(u,v)∈[0,1]（按 pattern·uv∈[0,1)·freq=格点数）。bumps 用整数周期 sin 保接缝无缝。
function height(pattern: SurfaceDetail['pattern'], u: number, v: number, freq: number): number {
  if (pattern === 'bumps') return 0.5 + 0.5 * Math.sin(u * freq * Math.PI * 2) * Math.sin(v * freq * Math.PI * 2); // 蛋格凸起
  if (pattern === 'scratches') return fbm(u * freq * 0.35, v * freq * 3); // 沿 v 拉长 → 各向异性划痕
  return fbm(u * freq, v * freq); // noise
}

// 据 SurfaceDetail 生成 { normalMap, roughnessMap }（DataTexture·RepeatWrapping·repeat=tiles）。
// 法线由高度场中央差分求得（环绕取样 → 平铺无缝）；roughness 由高度调制（凸处光、凹处哑·×材质 base）。
export function buildSurfaceMaps(s: SurfaceDetail, _baseRough: number): { normalMap: THREE.DataTexture; roughnessMap: THREE.DataTexture } {
  const N = RES;
  const freq = Math.max(1, Math.round((s.scale ?? 1) * 6));
  const roughAmt = Math.min(1, Math.max(0, s.rough ?? 0.3));
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = height(s.pattern, i / N, j / N, freq);
  const nrm = new Uint8Array(N * N * 4);
  const rgh = new Uint8Array(N * N * 4);
  const strength = 3; // 基准法线强度（可见浮雕）·细调交 material.normalScale
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const il = (i + N - 1) % N, ir = (i + 1) % N, ju = (j + N - 1) % N, jd = (j + 1) % N;
    const dx = (H[j * N + ir]! - H[j * N + il]!) * strength;
    const dy = (H[jd * N + i]! - H[ju * N + i]!) * strength;
    const len = Math.hypot(dx, dy, 1) || 1;
    const o = (j * N + i) * 4;
    nrm[o] = ((-dx / len) * 0.5 + 0.5) * 255; nrm[o + 1] = ((-dy / len) * 0.5 + 0.5) * 255; nrm[o + 2] = ((1 / len) * 0.5 + 0.5) * 255; nrm[o + 3] = 255;
    const r = Math.min(1, Math.max(0, 1 - roughAmt * (H[j * N + i]! - 0.5) * 2)); // 凸(H>0.5)→更光·凹→更哑
    const rv = r * 255; rgh[o] = rv; rgh[o + 1] = rv; rgh[o + 2] = rv; rgh[o + 3] = 255;
  }
  const tiles = Math.max(1, s.tiles ?? 3);
  const mk = (data: Uint8Array): THREE.DataTexture => {
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(tiles, tiles);
    t.needsUpdate = true;
    return t;
  };
  return { normalMap: mk(nrm), roughnessMap: mk(rgh) };
}
