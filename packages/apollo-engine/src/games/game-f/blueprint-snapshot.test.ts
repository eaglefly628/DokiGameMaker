import { describe, it, expect } from 'vitest';
import { buildGameFBlueprint } from './blueprint.js';

// 去腐安全网（runbook 片0）：把 buildGameFBlueprint() 的输出结构钉成基线。
// 「平移片」（band/visSwap/chrome/makeRoundFlow 展平等行为零变的改动）改完，本摘要必须不变；
// 变了即说明平移破坏了语义（实体集/字段漂移）→ 回退。redesign 片（商店脉冲/壳层）会改行为，届时另调基线。
// 用 canonical（键排序、-0 归一）序列化 + FNV-1a 摘要，避免巨大 .snap 文件。
function canon(v: unknown): string {
  if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`;
}
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

describe('blueprint 去腐安全网（结构基线）', () => {
  it('默认 pacing 输出结构摘要钉死（平移片改完须不变）', () => {
    const bp = buildGameFBlueprint();
    const entKeys = Object.keys(bp.entities).sort();
    const digest = fnv1a(canon({ entities: bp.entities, capN: bp.capabilities.length }));
    // 实体数 + 摘要双钉：任何平移漂移即触发。
    expect({ entityCount: entKeys.length, digest }).toMatchInlineSnapshot(`
      {
        "digest": "258974a8",
        "entityCount": 449,
      }
    `);
  });
});
