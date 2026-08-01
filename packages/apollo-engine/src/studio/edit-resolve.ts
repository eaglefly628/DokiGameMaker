import { editableFields, type Entities, type EditOp } from './edit-ops.js';

// ═══════════════════════════════════════════════════════════════
//  编辑解析器 (resolve) —— 模型鲁棒性层
//
//  把"松散/自然语言的编辑意图"(弱模型也能产)吸附成精确 EditOp：
//   ① 显式 "Component.field"  ② 高频别名表(重力→Acceleration.ay)
//   ③ schema 兜底:拿实体当前可改字段的 名字+describe 做模糊匹配(用自描述,不靠手表穷举)
//  正确性留在这里(确定性)，不赌模型。无法吸附则返回 error(带候选)，供 UI/模型重选。
// ═══════════════════════════════════════════════════════════════

export interface LooseEdit {
  entity: string;
  target: string; // "重力" / "gravity" / "speed" / "Acceleration.ay" / "颜色" / "变蓝"
  value?: unknown; // set 用
  factor?: number; // nudge 用（相对乘）
  delta?: number; // nudge 用（相对加）
}

// 高频别名（精度第一层）：NL → [组件, 字段]。
const ALIASES: Record<string, [string, string]> = {
  重力: ['Acceleration', 'ay'], gravity: ['Acceleration', 'ay'],
  速度: ['Controllable', 'speed'], speed: ['Controllable', 'speed'], 移动速度: ['Controllable', 'speed'],
  横速: ['Velocity', 'vx'], 竖速: ['Velocity', 'vy'], vx: ['Velocity', 'vx'], vy: ['Velocity', 'vy'],
  透明度: ['Color', 'alpha'], alpha: ['Color', 'alpha'], 不透明度: ['Color', 'alpha'],
  宽: ['Shape', 'width'], 宽度: ['Shape', 'width'], width: ['Shape', 'width'],
  高: ['Shape', 'height'], 高度: ['Shape', 'height'], height: ['Shape', 'height'],
  半径: ['Shape', 'radius'], radius: ['Shape', 'radius'],
  横向缩放: ['Transform', 'scaleX'], 纵向缩放: ['Transform', 'scaleY'],
};

// 颜色名 → hex number。
const COLORS: Record<string, number> = {
  红: 0xef4444, red: 0xef4444, 蓝: 0x3b82f6, blue: 0x3b82f6, 绿: 0x22c55e, green: 0x22c55e,
  黄: 0xfbbf24, yellow: 0xfbbf24, 白: 0xffffff, white: 0xffffff, 黑: 0x111111, black: 0x111111,
  紫: 0xa78bfa, purple: 0xa78bfa, 橙: 0xfb923c, orange: 0xfb923c, 粉: 0xff7aa2, pink: 0xff7aa2, 青: 0x22d3ee, cyan: 0x22d3ee,
};

/** 解析颜色：#rrggbb / 0xRRGGBB / 颜色名（中文 includes）。失败返回 null。 */
export function parseColor(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (/^#?[0-9a-f]{6}$/.test(t)) return parseInt(t.replace('#', ''), 16);
  if (/^0x[0-9a-f]{6}$/.test(t)) return parseInt(t, 16);
  for (const [k, v] of Object.entries(COLORS)) if (s.includes(k)) return v;
  return null;
}

export type ResolveResult = { ok: true; op: EditOp } | { ok: false; reason: string; candidates?: string[] };

/** 把一条 LooseEdit 吸附成精确 EditOp。 */
export function resolveEdit(entities: Entities, e: LooseEdit): ResolveResult {
  const ent = entities[e.entity];
  if (!ent) return { ok: false, reason: `实体 "${e.entity}" 不存在` };
  const raw = e.target.trim();
  const norm = raw.toLowerCase();

  // 颜色：目标或值命中颜色 → setColor（需实体有 Color）。
  const colorFromValue = typeof e.value === 'string' ? parseColor(e.value) : null;
  const colorFromTarget = parseColor(raw);
  const looksColor = /颜色|color|变/.test(raw) || colorFromValue !== null;
  if (looksColor) {
    const tint = colorFromValue ?? colorFromTarget;
    if (tint === null) return { ok: false, reason: `认不出颜色（试试 红/蓝/#3b82f6）` };
    if (!ent.Color) return { ok: false, reason: `实体 "${e.entity}" 没有 Color 组件` };
    return { ok: true, op: { op: 'setColor', entity: e.entity, tint } };
  }

  const fields = editableFields(entities, e.entity);
  const mk = (component: string, field: string): ResolveResult => {
    if (e.factor !== undefined || e.delta !== undefined) {
      return { ok: true, op: { op: 'nudge', entity: e.entity, component, field, factor: e.factor, delta: e.delta } };
    }
    return { ok: true, op: { op: 'set', entity: e.entity, component, field, value: e.value } };
  };
  const present = (component: string, field: string) => fields.some((f) => f.component === component && f.field === field);

  // ① 显式 "Component.field"
  if (raw.includes('.')) {
    const [component, field] = raw.split('.');
    if (present(component, field)) return mk(component, field);
    return { ok: false, reason: `实体 "${e.entity}" 没有 ${raw}`, candidates: fields.map((f) => `${f.component}.${f.field}`) };
  }

  // ② 别名表（命中且该实体确有此组件字段）
  const alias = ALIASES[raw] ?? ALIASES[norm];
  if (alias && present(alias[0], alias[1])) return mk(alias[0], alias[1]);

  // ③ schema 兜底：字段名精确 / describe 或字段名包含 target → 取最优
  const exactField = fields.find((f) => f.field.toLowerCase() === norm);
  if (exactField) return mk(exactField.component, exactField.field);
  const fuzzy = fields.find((f) => f.describe.includes(raw) || f.field.toLowerCase().includes(norm) || norm.includes(f.field.toLowerCase()));
  if (fuzzy) return mk(fuzzy.component, fuzzy.field);

  return { ok: false, reason: `认不出 "${raw}" 指哪个字段`, candidates: fields.map((f) => `${f.component}.${f.field}`) };
}

/** 批量：逐条解析（失败的收集起来），返回成功 op 列表 + 失败原因。供 applyEditOps 消费。 */
export function resolveEdits(entities: Entities, edits: readonly LooseEdit[]): { ops: EditOp[]; errors: string[] } {
  const ops: EditOp[] = [];
  const errors: string[] = [];
  for (const e of edits) {
    const r = resolveEdit(entities, e);
    if (r.ok) ops.push(r.op);
    else errors.push(`[${e.entity} · ${e.target}] ${r.reason}${r.candidates ? `（可改：${r.candidates.join(', ')}）` : ''}`);
  }
  return { ops, errors };
}

// ── UI 命令行解析（确定性 mini-grammar，给透视器的「自然语言编辑」框用）──
// 支持："<实体> <目标> <值>"（set）｜"<实体> <目标> *1.5 / x1.5"（nudge 乘）｜
//       "<实体> <目标> +3 / -2"（nudge 加）｜"<实体> 变蓝 / <实体> 颜色 蓝"（setColor）。
// LLM 接入后只需产 LooseEdit[]，复用同一 resolve/apply，本解析器是它的零模型对照实现。
export function parseCommand(line: string): LooseEdit | { error: string } {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  if (toks.length < 2) return { error: '格式：<实体> <目标> <值>，如 "player 重力 0.9" / "player 速度 x1.5" / "platform1 变蓝"' };
  const entity = toks[0];
  // "变X" / "颜色 X"
  if (/^变/.test(toks[1]) || toks[1] === '颜色' || toks[1].toLowerCase() === 'color') {
    const colorTok = toks[1] === '颜色' || toks[1].toLowerCase() === 'color' ? toks.slice(2).join('') : toks[1];
    return { entity, target: '颜色', value: colorTok };
  }
  const target = toks[1];
  const valTok = toks.slice(2).join(' ');
  if (!valTok) return { error: `缺少值：${entity} ${target} <值>` };
  const m = valTok.match(/^[x*]\s*(-?\d+(?:\.\d+)?)$/i);
  if (m) return { entity, target, factor: Number(m[1]) };
  if (/^[+\-]\d/.test(valTok)) return { entity, target, delta: Number(valTok) };
  return { entity, target, value: valTok };
}
