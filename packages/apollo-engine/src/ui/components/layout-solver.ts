// 平台无关布局求解 —— 「逻辑/视觉分离」的**逻辑核**。
//
// LayoutNode 树 + LayoutConstraints → 各节点盒子 {x,y,w,h}。纯函数·无 DOM·无 CSS。
//
// · HTML 后端：靠 CSS flex/grid 免费算布局，**不用本模块**（故 render.ts 不动·零回归）。
// · Canvas / 微信小游戏等**无 CSS** 的后端：import 本模块即得布局，只需自己写"画"(视觉)。
//
// 契约边界：求解器按 LayoutConstraints 排「容器 → children」的**通用**布局
// （direction row/column/grid、gap、align、flex、padding、绝对定位 x/y）。
// 控件**内部**结构（Table 行/Tabs 页/Stepper ± 钮/Segmented 段…）由各后端的绘制函数
// 在分到的盒子内自排——求解器只给外框 + 通用容器排布。叶子内在尺寸由注入的 measure 提供
// （后端相关：Canvas 用 ctx.measureText + 控件内边距规则；测试用 stub）。

import type { LayoutNode } from './types.js';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Size { w: number; h: number }
/** 叶子/控件内在尺寸（注入·后端相关）。容器尺寸由布局算，不调用本函数。 */
export type MeasureFn = (node: LayoutNode) => Size;

const DEF_GAP = 8;
const DEF_PAD = 16;
const hasKids = (n: LayoutNode): n is LayoutNode & { children: LayoutNode[] } =>
  Array.isArray(n.children) && n.children.length > 0;
const isAbs = (n: LayoutNode): boolean => n.layout?.x !== undefined || n.layout?.y !== undefined;

// —— 第一趟：内在尺寸（自底向上）——
function intrinsic(node: LayoutNode, measure: MeasureFn): Size {
  const c = node.layout ?? {};
  if (!hasKids(node)) return { w: c.width ?? measure(node).w, h: c.height ?? measure(node).h };

  const dir = c.direction ?? 'column';
  const gap = c.gap ?? DEF_GAP;
  const pad = c.padding ?? DEF_PAD;
  const kids = node.children.map((k) => intrinsic(k, measure));
  const sum = (pick: (s: Size) => number): number => kids.reduce((s, k) => s + pick(k), 0) + gap * Math.max(0, kids.length - 1);
  const max = (pick: (s: Size) => number): number => kids.reduce((m, k) => Math.max(m, pick(k)), 0);

  let w: number, h: number;
  if (dir === 'row') { w = sum((s) => s.w); h = max((s) => s.h); }
  else { w = max((s) => s.w); h = sum((s) => s.h); } // column 与 grid 内在同（grid 真实列数在 arrange 用分到的宽算）
  return { w: c.width ?? w + pad * 2, h: c.height ?? h + pad * 2 };
}

// —— 第二趟：分配位置（自顶向下）——
function arrange(node: LayoutNode, rect: Rect, measure: MeasureFn, out: Map<string, Rect>): void {
  out.set(node.id, rect);
  if (!hasKids(node)) return;

  const c = node.layout ?? {};
  const dir = c.direction ?? 'column';
  const gap = c.gap ?? DEF_GAP;
  const pad = c.padding ?? DEF_PAD;
  const align = c.align ?? 'stretch';
  const innerX = rect.x + pad, innerY = rect.y + pad;
  const innerW = rect.w - pad * 2, innerH = rect.h - pad * 2;
  const kids = node.children;
  const sizes = kids.map((k) => intrinsic(k, measure));

  if (dir === 'grid') {
    const minCol = c.minCol ?? 96;
    const cols = Math.max(1, Math.floor((innerW + gap) / (minCol + gap)));
    const colW = (innerW - gap * (cols - 1)) / cols;
    const rows = Math.ceil(kids.length / cols);
    const rowH = Array.from({ length: rows }, (_, r) => {
      let mh = 0;
      for (let ci = 0; ci < cols; ci++) { const idx = r * cols + ci; if (idx < kids.length) mh = Math.max(mh, sizes[idx]!.h); }
      return mh;
    });
    kids.forEach((k, i) => {
      const r = Math.floor(i / cols), ci = i % cols;
      const x = innerX + ci * (colW + gap);
      let y = innerY;
      for (let rr = 0; rr < r; rr++) y += rowH[rr]! + gap;
      arrange(k, { x, y, w: colW, h: sizes[i]!.h }, measure, out);
    });
    return;
  }

  // 绝对定位的孩子：相对父盒左上 + x/y，尺寸取内在/显式
  kids.forEach((k, i) => {
    if (!isAbs(k)) return;
    arrange(k, { x: rect.x + (k.layout?.x ?? 0), y: rect.y + (k.layout?.y ?? 0), w: sizes[i]!.w, h: sizes[i]!.h }, measure, out);
  });

  // 流式（row/column）：flex 分主轴 · align 排交叉轴
  const flow = kids.map((k, i) => ({ k, i })).filter(({ k }) => !isAbs(k));
  const mainOf = (s: Size): number => (dir === 'row' ? s.w : s.h);
  const crossAvail = dir === 'row' ? innerH : innerW;
  const mainAvail = dir === 'row' ? innerW : innerH;
  const totalGap = gap * Math.max(0, flow.length - 1);
  const fixedMain = flow.reduce((s, { k, i }) => s + (k.layout?.flex ? 0 : mainOf(sizes[i]!)), 0);
  const totalFlex = flow.reduce((s, { k }) => s + (k.layout?.flex ?? 0), 0);
  const freeMain = Math.max(0, mainAvail - totalGap - fixedMain);

  let cursor = dir === 'row' ? innerX : innerY;
  flow.forEach(({ k, i }) => {
    const flex = k.layout?.flex ?? 0;
    const mainSize = flex > 0 ? (freeMain * flex) / totalFlex : mainOf(sizes[i]!);
    const intrinsicCross = dir === 'row' ? sizes[i]!.h : sizes[i]!.w;
    const crossSize = align === 'stretch' ? crossAvail : intrinsicCross;
    const crossOff = align === 'center' ? (crossAvail - intrinsicCross) / 2 : align === 'end' ? crossAvail - intrinsicCross : 0;
    const r: Rect = dir === 'row'
      ? { x: cursor, y: innerY + crossOff, w: mainSize, h: crossSize }
      : { x: innerX + crossOff, y: cursor, w: crossSize, h: mainSize };
    arrange(k, r, measure, out);
    cursor += mainSize + gap;
  });
}

/**
 * 解出整棵树的盒子坐标。根节点默认占满 viewport（除非显式 width/height）。
 * @returns Map<节点 id, {x,y,w,h}>（绝对坐标·像素）
 */
export function solveLayout(root: LayoutNode, viewport: Size, measure: MeasureFn): Map<string, Rect> {
  const out = new Map<string, Rect>();
  const c = root.layout ?? {};
  arrange(root, { x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? viewport.w, h: c.height ?? viewport.h }, measure, out);
  return out;
}
