import type { IWorld } from '@engine/core/types.js';
import type { Coachmark, Flag } from '@engine/protocol/components.js';
import { findByComponentId } from '@engine/core/query.js';

// ═══════════════════════════════════════════════════════════════
//  coachmark —— 新手引导高亮（OnboardingOverlay）的**纯**核：collect 激活项 + 几何 + SVG 出帧。
//  无 DOM / 无 three → node 可测（确定性表现层，同 three-projection/frame-svg 先例）。
//  live DOM 解释器在 `@ui/onboarding-overlay`（薄胶水，用本模块的 collect/几何）。
//  红线：只读 world（Coachmark + visibleWhen 的 Flag）+ 锚点几何，**不写 sim、不进 hash**。
// ═══════════════════════════════════════════════════════════════

export interface Rect { x: number; y: number; w: number; h: number; } // 锚点 / 视口矩形（DOM getBoundingClientRect 或测试给定）
export interface Viewport { w: number; h: number; }

// 激活的引导项：有 visibleWhen 则其 Flag 须 active；无 visibleWhen 则总显示。锚点 rect 由调用方在渲染时解析（DOM/测试）。
export function collectActiveCoachmarks(world: IWorld): Coachmark[] {
  const out: Coachmark[] = [];
  for (const [id] of world.query('Coachmark')) {
    const m = world.getComponent<Coachmark>(id, 'Coachmark');
    if (!m) continue;
    if (m.visibleWhen) {
      const fe = findByComponentId(world, 'Flag', 'id', m.visibleWhen);
      if (!(fe && (world.getComponent<Flag>(fe, 'Flag')?.active ?? false))) continue;
    }
    out.push(m);
  }
  return out;
}

export interface CoachmarkGeometry {
  cutout: { x: number; y: number; w: number; h: number; r: number; shape: 'rect' | 'circle' };
  bubble: { x: number; y: number; w: number; h: number };
  placement: 'top' | 'bottom' | 'left' | 'right';
}

const BUBBLE_W = 240, BUBBLE_H = 56, GAP = 12;

// 纯几何：锚点 rect + 视口 + 形/外扩/朝向 → 镂空 + 气泡位置。auto=锚点上下空间择大者；气泡夹进视口。node 可测。
export function coachmarkGeometry(
  anchor: Rect, vp: Viewport,
  mark: { shape?: 'rect' | 'circle'; pad?: number; placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto'; bubbleW?: number; bubbleH?: number },
): CoachmarkGeometry {
  const pad = mark.pad ?? 8;
  const shape = mark.shape ?? 'rect';
  const cx = anchor.x - pad, cy = anchor.y - pad, cw = anchor.w + 2 * pad, ch = anchor.h + 2 * pad;
  const r = shape === 'circle' ? Math.max(cw, ch) / 2 : 0;
  const bw = mark.bubbleW ?? BUBBLE_W, bh = mark.bubbleH ?? BUBBLE_H;
  let place = mark.placement ?? 'auto';
  if (place === 'auto') place = vp.h - (cy + ch) >= cy ? 'bottom' : 'top'; // 下方空间≥上方 → 放下方
  const acx = cx + cw / 2, acy = cy + ch / 2;
  let bx: number, by: number;
  if (place === 'bottom') { bx = acx - bw / 2; by = cy + ch + GAP; }
  else if (place === 'top') { bx = acx - bw / 2; by = cy - GAP - bh; }
  else if (place === 'right') { bx = cx + cw + GAP; by = acy - bh / 2; }
  else { bx = cx - GAP - bw; by = acy - bh / 2; } // left
  bx = Math.max(GAP, Math.min(bx, vp.w - bw - GAP)); // 夹进视口
  by = Math.max(GAP, Math.min(by, vp.h - bh - GAP));
  return { cutout: { x: cx, y: cy, w: cw, h: ch, r, shape }, bubble: { x: bx, y: by, w: bw, h: bh }, placement: place };
}

export interface CoachmarkItem { mark: Coachmark; anchor: Rect; }

const hex = (t: number): string => `#${(t & 0xffffff).toString(16).padStart(6, '0')}`;
const esc = (s: string): string => s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
const n = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(2));

// 纯 SVG 出帧：全屏 dim（mask 在锚点处打孔镂空）+ 气泡(框+文案)。headless golden / 任意端出帧，无 DOM、确定。
export function coachmarkSvg(vp: Viewport, items: readonly CoachmarkItem[]): string {
  if (items.length === 0) return '';
  let holes = '', bubbles = '';
  for (const it of items) {
    const g = coachmarkGeometry(it.anchor, vp, it.mark);
    const c = g.cutout;
    holes += c.shape === 'circle'
      ? `<circle cx="${n(c.x + c.w / 2)}" cy="${n(c.y + c.h / 2)}" r="${n(c.r)}" fill="#000"/>`
      : `<rect x="${n(c.x)}" y="${n(c.y)}" width="${n(c.w)}" height="${n(c.h)}" rx="6" fill="#000"/>`;
    const b = g.bubble;
    bubbles += `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="10" fill="#1b1822" stroke="#e0973a"/>` +
      `<text x="${n(b.x + 14)}" y="${n(b.y + b.h / 2 + 5)}" font-family="sans-serif" font-size="14" fill="#ece6f5">${esc(it.mark.text)}</text>`;
  }
  const d = items[0].mark;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${vp.w}" height="${vp.h}">` +
    `<defs><mask id="coach-hole"><rect width="${vp.w}" height="${vp.h}" fill="#fff"/>${holes}</mask></defs>` +
    `<rect width="${vp.w}" height="${vp.h}" fill="${hex(d.dimColor ?? 0x000000)}" fill-opacity="${d.dimAlpha ?? 0.6}" mask="url(#coach-hole)"/>` +
    bubbles + `</svg>`;
}
