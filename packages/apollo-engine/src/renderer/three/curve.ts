import type { Curve, Gradient } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  TA 地基（Phase 0）—— 曲线 / 渐变采样（render util·纯函数）。
//  关键点按 t 升序；t 夹到 [首,尾]。曲线给标量、渐变给颜色(rgb 0..1)+alpha。供 VFX/灯/材质复用。
// ═══════════════════════════════════════════════════════════════

// 曲线在 t 处的标量值（无曲线 → def）。mode：linear(默认)/step(取左)/smooth(smoothstep)。
export function sampleCurve(c: Curve | undefined, t: number, def = 1): number {
  if (!c || c.keys.length === 0) return def;
  const k = c.keys;
  if (t <= k[0]!.t) return k[0]!.v;
  if (t >= k[k.length - 1]!.t) return k[k.length - 1]!.v;
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i]!, b = k[i + 1]!;
    if (t >= a.t && t <= b.t) {
      if (c.mode === 'step') return a.v;
      const span = b.t - a.t;
      let f = span > 0 ? (t - a.t) / span : 0;
      if (c.mode === 'smooth') f = f * f * (3 - 2 * f);
      return a.v + (b.v - a.v) * f;
    }
  }
  return k[k.length - 1]!.v;
}

export interface Rgba { r: number; g: number; b: number; a: number; }

const unpack = (hex: number): { r: number; g: number; b: number } => ({
  r: ((hex >> 16) & 0xff) / 255, g: ((hex >> 8) & 0xff) / 255, b: (hex & 0xff) / 255,
});

// 渐变在 t 处的颜色(rgb 0..1)+alpha（无渐变 → 用 fallback 单色 + a=1）。
export function sampleGradient(g: Gradient | undefined, t: number, fallback = 0xffffff): Rgba {
  if (!g || g.stops.length === 0) { const c = unpack(fallback); return { r: c.r, g: c.g, b: c.b, a: 1 }; }
  const s = g.stops;
  const at = (i: number): Rgba => { const c = unpack(s[i]!.color); return { r: c.r, g: c.g, b: c.b, a: s[i]!.alpha ?? 1 }; };
  if (t <= s[0]!.t) return at(0);
  if (t >= s[s.length - 1]!.t) return at(s.length - 1);
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i]!, b = s[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      const f = span > 0 ? (t - a.t) / span : 0;
      const ca = at(i), cb = at(i + 1);
      return { r: ca.r + (cb.r - ca.r) * f, g: ca.g + (cb.g - ca.g) * f, b: ca.b + (cb.b - ca.b) * f, a: ca.a + (cb.a - ca.a) * f };
    }
  }
  return at(s.length - 1);
}
