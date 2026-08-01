import { describe, it, expect } from 'vitest';
import { DynamicAabbTree } from './aabb-tree.js';
import type { Aabb } from './aabb-tree.js';

// 与树解耦的暴力参照：所有 AABB 相交的 (idA<idB) 对，排序输出。
function brutePairs(boxes: Array<{ id: string; box: Aabb }>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.box.minX <= b.box.maxX && a.box.maxX >= b.box.minX && a.box.minY <= b.box.maxY && a.box.maxY >= b.box.minY) {
        const lo = a.id < b.id ? a.id : b.id;
        const hi = a.id < b.id ? b.id : a.id;
        out.push([lo, hi]);
      }
    }
  }
  out.sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : p[1] < q[1] ? -1 : p[1] > q[1] ? 1 : 0));
  return out;
}
function buildTree(boxes: Array<{ id: string; box: Aabb }>): DynamicAabbTree {
  const tree = new DynamicAabbTree();
  for (const { id, box } of [...boxes].sort((a, b) => (a.id < b.id ? -1 : 1))) tree.insert(id, box);
  return tree;
}
// 确定性 LCG，给随机场景用。
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('DynamicAabbTree — 基本', () => {
  it('相交对/不相交对', () => {
    const tree = buildTree([
      { id: 'a', box: { minX: 0, minY: 0, maxX: 10, maxY: 10 } },
      { id: 'b', box: { minX: 5, minY: 5, maxX: 15, maxY: 15 } }, // 与 a 交
      { id: 'c', box: { minX: 100, minY: 100, maxX: 110, maxY: 110 } }, // 远离
    ]);
    expect(tree.queryPairs()).toEqual([['a', 'b']]);
    expect(tree.query({ minX: 4, minY: 4, maxX: 6, maxY: 6 }).sort()).toEqual(['a', 'b']);
    expect(tree.query({ minX: 200, minY: 200, maxX: 201, maxY: 201 })).toEqual([]);
  });

  it('空树 / 单叶', () => {
    expect(new DynamicAabbTree().queryPairs()).toEqual([]);
    const t = buildTree([{ id: 'x', box: { minX: 0, minY: 0, maxX: 1, maxY: 1 } }]);
    expect(t.queryPairs()).toEqual([]);
  });
});

describe('DynamicAabbTree — golden：树 === 暴力（50 随机场景）', () => {
  it('随机盒子集，queryPairs 与暴力逐一致', () => {
    const rnd = lcg(12345);
    for (let scene = 0; scene < 50; scene++) {
      const n = 2 + Math.floor(rnd() * 30);
      const boxes: Array<{ id: string; box: Aabb }> = [];
      for (let i = 0; i < n; i++) {
        const x = rnd() * 100;
        const y = rnd() * 100;
        const w = 1 + rnd() * 20;
        const h = 1 + rnd() * 20;
        boxes.push({ id: `e${String(i).padStart(2, '0')}`, box: { minX: x, minY: y, maxX: x + w, maxY: y + h } });
      }
      expect(buildTree(boxes).queryPairs()).toEqual(brutePairs(boxes));
    }
  });
});
