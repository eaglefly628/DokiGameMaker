// 像素级确定性打标（纯函数）—— 程序能诚实读出的「事实层」标签：
// 颜色构成 / 明暗 / 鲜艳度 / 透明半透明 / 主体体量与形状 / 暖冷调。
// 不做主体识别（"这是骷髅战士"属于语义层：文件名结构 + artlib-tags + 可选视觉标注）。
// 宣言尺子：同一张图永远产出同一组标签（无随机、无 I/O、定序输出），可单测可审计。

export interface PixelStats {
  /** 非透明像素占画布比例（alpha ≥ 8）。 */
  readonly coverage: number;
  /** 半透明像素占非透明像素比例（alpha 16..239）。 */
  readonly translucency: number;
  /** 主体包围盒占画布面积比例。 */
  readonly fillRatio: number;
  readonly boxW: number;
  readonly boxH: number;
  /** 各色桶占非透明像素的比例（含消色差桶 white/gray/black）。 */
  readonly colors: Readonly<Record<ColorBucket, number>>;
  /** 彩色（非消色差）像素占比。 */
  readonly chromatic: number;
  readonly lumAvg: number;
  readonly satAvg: number;
}

export type ColorBucket =
  | 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'magenta'
  | 'brown' | 'white' | 'gray' | 'black';

/** 定序的色桶表（统计与输出顺序的唯一来源）。 */
export const COLOR_BUCKETS: readonly ColorBucket[] = [
  'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta',
  'brown', 'white', 'gray', 'black',
];

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function bucketOf(h: number, s: number, v: number): ColorBucket {
  if (s < 0.16) return v > 0.82 ? 'white' : v < 0.2 ? 'black' : 'gray';
  // 棕色：暖色相 + 偏暗（像素美术里大量木头/皮革/泥土）
  if (h >= 15 && h < 50 && v < 0.45) return 'brown';
  if (h >= 345 || h < 15) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 160) return 'green';
  if (h < 200) return 'cyan';
  if (h < 250) return 'blue';
  if (h < 290) return 'purple';
  return 'magenta';
}

/** 统计一张 RGBA 图（全透明图返回零值统计）。 */
export function pixelStats(px: Uint8Array, w: number, h: number): PixelStats {
  const counts = Object.fromEntries(COLOR_BUCKETS.map((b) => [b, 0])) as Record<ColorBucket, number>;
  let opaque = 0;
  let partial = 0;
  let chromatic = 0;
  let lumSum = 0;
  let satSum = 0;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = px[i + 3];
      if (a < 8) continue;
      opaque++;
      if (a >= 16 && a <= 239) partial++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const { h: hue, s, v } = rgbToHsv(px[i], px[i + 1], px[i + 2]);
      const bucket = bucketOf(hue, s, v);
      counts[bucket]++;
      if (bucket !== 'white' && bucket !== 'gray' && bucket !== 'black') chromatic++;
      lumSum += v;
      satSum += s;
    }
  }

  const colors = Object.fromEntries(
    COLOR_BUCKETS.map((b) => [b, opaque ? counts[b] / opaque : 0]),
  ) as Record<ColorBucket, number>;
  const boxW = maxX >= minX ? maxX - minX + 1 : 0;
  const boxH = maxY >= minY ? maxY - minY + 1 : 0;
  return {
    coverage: opaque / (w * h),
    translucency: opaque ? partial / opaque : 0,
    fillRatio: (boxW * boxH) / (w * h),
    boxW,
    boxH,
    colors,
    chromatic: opaque ? chromatic / opaque : 0,
    lumAvg: opaque ? lumSum / opaque : 0,
    satAvg: opaque ? satSum / opaque : 0,
  };
}

/** 统计 → 事实标签（定序输出）。 */
export function statsToTags(s: PixelStats): string[] {
  const tags: string[] = [];
  if (s.coverage === 0) return tags;

  // 体量/形态
  if (s.coverage >= 0.97) tags.push('full_frame');
  else if (s.fillRatio <= 0.3) tags.push('small_subject');
  else if (s.fillRatio >= 0.85) tags.push('large_subject');
  if (s.boxW > 0 && s.boxH / s.boxW >= 1.5) tags.push('tall_shape');
  if (s.boxH > 0 && s.boxW / s.boxH >= 1.5) tags.push('wide_shape');
  if (s.translucency > 0.22) tags.push('translucent');

  // 颜色：≥22% 的全部 + 最大桶（若 ≥12%），按桶表定序
  const dominant = COLOR_BUCKETS.reduce((a, b) => (s.colors[b] > s.colors[a] ? b : a), COLOR_BUCKETS[0]);
  for (const b of COLOR_BUCKETS) {
    if (s.colors[b] >= 0.22 || (b === dominant && s.colors[b] >= 0.12)) tags.push(b);
  }

  // 明暗/鲜艳
  if (s.lumAvg < 0.26) tags.push('dark');
  else if (s.lumAvg > 0.72) tags.push('bright');
  if (s.chromatic >= 0.3 && s.satAvg >= 0.5) tags.push('vivid');
  if (s.chromatic < 0.12) tags.push('monochrome');
  if (COLOR_BUCKETS.filter((b) => b !== 'white' && b !== 'gray' && b !== 'black' && s.colors[b] >= 0.1).length >= 4)
    tags.push('multicolor');

  // 暖冷调（彩色像素里的占比）
  if (s.chromatic >= 0.25) {
    const warm = s.colors.red + s.colors.orange + s.colors.yellow + s.colors.brown;
    const cool = s.colors.cyan + s.colors.blue;
    if (warm / s.chromatic >= 0.65) tags.push('warm_palette');
    else if (cool / s.chromatic >= 0.65) tags.push('cool_palette');
  }
  return tags;
}

/** 一步到位：RGBA → {tags, stats}。 */
export function pixelTags(px: Uint8Array, w: number, h: number): { tags: string[]; stats: PixelStats } {
  const stats = pixelStats(px, w, h);
  return { tags: statsToTags(stats), stats };
}

// ── 语义标签 ↔ 像素事实 对账（嫌疑单：声称的元素在画面里找不到对应色证）──

export interface TagSuspicion {
  readonly claim: string;
  readonly expect: string;
  readonly actual: number;
}

/** 元素类语义声称 → 期望的色证（占非透明像素比例下限）。 */
const ELEMENT_EVIDENCE: ReadonlyArray<{ claims: readonly string[]; expect: string; min: number; sum: (c: Readonly<Record<ColorBucket, number>>) => number }> = [
  { claims: ['fire', 'flame', 'lava'], expect: 'warm(red+orange+yellow)', min: 0.1, sum: (c) => c.red + c.orange + c.yellow },
  { claims: ['ice', 'frost'], expect: 'cool(cyan+blue+white)', min: 0.12, sum: (c) => c.cyan + c.blue + c.white },
  { claims: ['poison', 'acid'], expect: 'green+purple+magenta', min: 0.08, sum: (c) => c.green + c.purple + c.magenta },
  { claims: ['lightning', 'electric'], expect: 'yellow+cyan+white', min: 0.1, sum: (c) => c.yellow + c.cyan + c.white },
  { claims: ['purple'], expect: 'purple+magenta', min: 0.06, sum: (c) => c.purple + c.magenta },
  // 注意只审「视觉性」声称：holy 是画面气质（圣光白金）；divine/religion 是功能语义（祭坛属神），不审。
  { claims: ['holy'], expect: 'white+yellow+gold', min: 0.1, sum: (c) => c.white + c.yellow },
];

/** 对一组语义标签做色证对账，返回站不住的声称（空数组 = 无矛盾）。 */
export function auditSemanticTags(semanticTags: readonly string[], stats: PixelStats): TagSuspicion[] {
  if (stats.coverage === 0) return [];
  const out: TagSuspicion[] = [];
  const set = new Set(semanticTags.map((t) => t.toLowerCase()));
  for (const rule of ELEMENT_EVIDENCE) {
    const hit = rule.claims.find((cl) => set.has(cl));
    if (!hit) continue;
    const actual = rule.sum(stats.colors);
    if (actual < rule.min) out.push({ claim: hit, expect: rule.expect, actual: Math.round(actual * 1000) / 1000 });
  }
  return out;
}
