import type { WorldSnapshot } from '@engine/core/types.js';

// ═══════════════════════════════════════════════════════════════
//  确定性守卫 — 世界状态指纹
// ═══════════════════════════════════════════════════════════════
//
//  对快照做"规范化序列化"(实体id/组件类型/字段名全部排序) 再求 FNV-1a 哈希。
//  关键性质：状态相同 → 哈希必然相同，**与插入顺序无关**。因此可以安全地
//  比较两个各自独立构建的对端世界——这正是 lockstep 检测 desync 的基础。
// ═══════════════════════════════════════════════════════════════

export function hashSnapshot(snap: WorldSnapshot): string {
  return fnv1a(canonical(snap));
}

// 纯表现/可由表现层重算的组件不进哈希：它们含浮点（zoom/offset），跨端 JIT/FMA 可能 1 ULP 漂移，
// 若纳入校验会误判 desync（Gemini Q2）。Camera 即此类——逻辑不读它，渲染期每帧由 camera-follow 重算。
const NON_DETERMINISTIC = new Set<string>(['Camera', 'Camera3D', 'Transform3D', 'Sky3D', 'Model3D', 'AnimState3D', 'Anim3D', 'Pivot3D', 'Light3D', 'Post3D', 'Fog3D', 'Material3D', 'Vfx3D', 'Trail3D', 'Line3D', 'Decal3D', 'Path3D', 'Billboard3D', 'WorldUI3D', 'Diegetic3D', 'RigidBody3D', 'Impulse3D', 'Joint3D', 'Glow3D', 'Pickable3D', 'ScoreTrace']);

function canonical(snap: WorldSnapshot): string {
  const parts: string[] = [];
  for (const entityId of Object.keys(snap).sort()) {
    const comps = snap[entityId];
    for (const type of Object.keys(comps).sort()) {
      if (NON_DETERMINISTIC.has(type)) continue; // 跳过纯表现组件
      const comp = comps[type] as unknown as Record<string, unknown>;
      const fields = Object.keys(comp)
        .sort()
        .map((k) => `${k}=${stableValue(comp[k])}`);
      parts.push(`${entityId}|${type}|${fields.join(',')}`);
    }
  }
  return parts.join(';');
}

function stableValue(v: unknown): string {
  if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v); // -0 与 0 视为同
  if (v === null || typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return `[${v.map(stableValue).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${k}:${stableValue(o[k])}`)
    .join(',')}}`;
}

// FNV-1a 32-bit → 8 位十六进制。纯整数运算，跨机一致。
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
