// 动态 AABB 树（Bullet btDbvt / Box2D b2DynamicTree 风格）—— 空间宽相位加速结构。
//
// 用法（每帧从组件重建，rollback 安全：纯派生、不跨帧持久化，故 snapshot/restore 不受影响）：
//   const tree = new DynamicAabbTree();
//   for (id of 按 id 升序) tree.insert(id, aabb);
//   tree.queryPairs()  // 所有 AABB 相交的叶子对
//   tree.query(box)    // 与 box 相交的叶子
//
// 确定性：调用方按 id 升序插入 → 树形确定；queryPairs/query 输出排序、每无序对只出一次。

export interface Aabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface TreeNode {
  box: Aabb;
  id: string | null; // 非 null = 叶子
  left: TreeNode | null;
  right: TreeNode | null;
  parent: TreeNode | null;
}

function area(b: Aabb): number {
  return (b.maxX - b.minX) * (b.maxY - b.minY);
}
function union(a: Aabb, b: Aabb): Aabb {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}
function overlaps(a: Aabb, b: Aabb): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export class DynamicAabbTree {
  private root: TreeNode | null = null;
  private leaves: TreeNode[] = [];

  clear(): void {
    this.root = null;
    this.leaves = [];
  }

  // 增量插入：从根下降，选"并入新盒后面积更小"的子树，到叶子处分裂出新内部节点，回溯 refit。
  insert(id: string, box: Aabb): void {
    const leaf: TreeNode = { box: { ...box }, id, left: null, right: null, parent: null };
    this.leaves.push(leaf);
    if (!this.root) {
      this.root = leaf;
      return;
    }
    let node = this.root;
    while (node.id === null) {
      const cl = area(union(node.left!.box, box));
      const cr = area(union(node.right!.box, box));
      node = cl <= cr ? node.left! : node.right!;
    }
    const oldParent = node.parent;
    const newParent: TreeNode = { box: union(node.box, box), id: null, left: node, right: leaf, parent: oldParent };
    node.parent = newParent;
    leaf.parent = newParent;
    if (oldParent) {
      if (oldParent.left === node) oldParent.left = newParent;
      else oldParent.right = newParent;
    } else {
      this.root = newParent;
    }
    for (let p: TreeNode | null = newParent.parent; p; p = p.parent) {
      p.box = union(p.left!.box, p.right!.box);
    }
  }

  // 所有 AABB 相交的叶子对，(idA<idB)，按 (idA,idB) 升序、每对只一次。
  queryPairs(): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    for (const leaf of this.leaves) this.collectPairs(this.root, leaf.box, leaf.id!, out);
    out.sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : p[1] < q[1] ? -1 : p[1] > q[1] ? 1 : 0));
    return out;
  }
  private collectPairs(node: TreeNode | null, box: Aabb, selfId: string, out: Array<[string, string]>): void {
    if (!node || !overlaps(node.box, box)) return;
    if (node.id !== null) {
      if (selfId < node.id) out.push([selfId, node.id]); // 只在较小 id 作为查询叶时出，天然去重
      return;
    }
    this.collectPairs(node.left, box, selfId, out);
    this.collectPairs(node.right, box, selfId, out);
  }

  // 与 box 相交的所有叶子 id（升序）。
  query(box: Aabb): string[] {
    const out: string[] = [];
    this.collect(this.root, box, out);
    out.sort();
    return out;
  }
  private collect(node: TreeNode | null, box: Aabb, out: string[]): void {
    if (!node || !overlaps(node.box, box)) return;
    if (node.id !== null) {
      out.push(node.id);
      return;
    }
    this.collect(node.left, box, out);
    this.collect(node.right, box, out);
  }
}
