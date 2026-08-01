// 平台无关布局求解器：LayoutNode + 约束 → 盒子坐标。用确定性 measure stub 钉死各排布行为，
// 作为「逻辑/视觉分离」逻辑核的回归基线（Canvas 后端 import 它·照本批行为）。
import { describe, it, expect } from 'vitest';
import { solveLayout, type MeasureFn } from './layout-solver.js';
import type { LayoutNode } from './types.js';

// 叶子尺寸 stub：按 id 给定，未列出的默认 20×10。
const sized = (map: Record<string, [number, number]>): MeasureFn => (n) => {
  const s = map[n.id]; return s ? { w: s[0], h: s[1] } : { w: 20, h: 10 };
};
const leaf = (id: string): LayoutNode => ({ type: 'Label', id, props: { text: id } });

describe('UI Components · solveLayout 平台无关布局核', () => {
  it('column：固定高 + gap + padding 顺序堆叠；align=stretch 撑满交叉轴', () => {
    const tree: LayoutNode = {
      type: 'Panel', id: 'root', props: {}, layout: { direction: 'column', gap: 10, padding: 0 },
      children: [leaf('a'), leaf('b')],
    };
    const r = solveLayout(tree, { w: 100, h: 100 }, sized({ a: [20, 10], b: [20, 10] }));
    expect(r.get('a')).toEqual({ x: 0, y: 0, w: 100, h: 10 });   // stretch → w=100
    expect(r.get('b')).toEqual({ x: 0, y: 20, w: 100, h: 10 });  // y=10+gap10
  });

  it('row + flex：固定项占内在宽，flex 项吃剩余主轴', () => {
    const tree: LayoutNode = {
      type: 'Panel', id: 'root', props: {}, layout: { direction: 'row', gap: 0, padding: 0 },
      children: [
        { type: 'Label', id: 'fix', props: { text: 'f' } },
        { type: 'Label', id: 'grow', props: { text: 'g' }, layout: { flex: 1 } },
      ],
    };
    const r = solveLayout(tree, { w: 100, h: 30 }, sized({ fix: [20, 10], grow: [5, 10] }));
    expect(r.get('fix')!.w).toBe(20);                 // 固定
    expect(r.get('grow')).toMatchObject({ x: 20, w: 80 }); // 吃掉 100-20
  });

  it('grid：按 minCol 定列数，等宽列，逐行下移', () => {
    const tree: LayoutNode = {
      type: 'Panel', id: 'root', props: {}, layout: { direction: 'grid', minCol: 40, gap: 0, padding: 0 },
      children: [leaf('c0'), leaf('c1'), leaf('c2')],
    };
    const r = solveLayout(tree, { w: 100, h: 100 }, sized({ c0: [0, 10], c1: [0, 10], c2: [0, 10] }));
    // 100/40 → 2 列，列宽 50
    expect(r.get('c0')).toEqual({ x: 0, y: 0, w: 50, h: 10 });
    expect(r.get('c1')).toEqual({ x: 50, y: 0, w: 50, h: 10 });
    expect(r.get('c2')).toEqual({ x: 0, y: 10, w: 50, h: 10 }); // 换行
  });

  it('align=center：交叉轴居中', () => {
    const tree: LayoutNode = {
      type: 'Panel', id: 'root', props: {}, layout: { direction: 'row', gap: 0, padding: 0, align: 'center' },
      children: [leaf('m')],
    };
    const r = solveLayout(tree, { w: 100, h: 40 }, sized({ m: [20, 10] }));
    expect(r.get('m')).toMatchObject({ y: 15, h: 10 }); // (40-10)/2=15·不撑高
  });

  it('绝对定位 x/y：相对父盒左上偏移', () => {
    const tree: LayoutNode = {
      type: 'Panel', id: 'root', props: {}, layout: { padding: 0 },
      children: [{ type: 'Label', id: 'pin', props: { text: 'p' }, layout: { x: 12, y: 7 } }],
    };
    const r = solveLayout(tree, { w: 100, h: 100 }, sized({ pin: [20, 10] }));
    expect(r.get('pin')).toEqual({ x: 12, y: 7, w: 20, h: 10 });
  });

  it('padding：内容从 padding 内缘起算', () => {
    const tree: LayoutNode = {
      type: 'Panel', id: 'root', props: {}, layout: { direction: 'column', gap: 0, padding: 16 },
      children: [leaf('x')],
    };
    const r = solveLayout(tree, { w: 100, h: 100 }, sized({ x: [20, 10] }));
    expect(r.get('x')).toMatchObject({ x: 16, y: 16, w: 68 }); // 内缘 16·宽 100-32
  });

  it('根节点默认占满 viewport', () => {
    const r = solveLayout(leaf('solo'), { w: 320, h: 240 }, sized({}));
    expect(r.get('solo')).toEqual({ x: 0, y: 0, w: 320, h: 240 });
  });
});
