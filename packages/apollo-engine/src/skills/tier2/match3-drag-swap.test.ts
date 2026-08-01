import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { MatchBoard, BoardCell, Signal, RandomSeed, InputQueue, Transform, Shape, Clickable } from '@engine/protocol/components.js';
import { match3DragSwapCapability, pickSwapTarget, DRAG_SWAP_THRESHOLD_CELLS, type NeighborCandidate } from './match3-drag-swap.js';
import { clickableCapability } from './clickable.js';
import { match3BoardCapability } from '../tier3/match3-board.js';

// ═══════════════════════════════════════════════════════════════
//  match3-drag-swap（REQ-INPUT-拖拽交换）测试。点名覆盖（图纸）：
//   ① 拖过阈值→交换信号（与点选两格产物逐字段同形）  ② 未过阈值→点选
//   ③ 斜向取主轴  ④ 触屏(touch)与鼠标(pointer)两路  ⑤ 既有点选消费零回归
// ═══════════════════════════════════════════════════════════════

const PITCH = 64;
const T = DRAG_SWAP_THRESHOLD_CELLS; // 0.4
const PASS = T * PITCH + 0.01; // 恰过阈值（25.6+）
const UNDER = T * PITCH - 0.01; // 恰不足阈值

// ── ① 纯函数 pickSwapTarget（主轴/阈值/越界/Y 朝向无关） ────────────────
describe('match3-drag-swap — pickSwapTarget（纯函数·确定性）', () => {
  // 中心格四邻 + 两个斜格（应被排除）。
  const cands: NeighborCandidate[] = [
    { eid: 'R', ox: PITCH, oy: 0 },
    { eid: 'L', ox: -PITCH, oy: 0 },
    { eid: 'D', ox: 0, oy: PITCH },
    { eid: 'U', ox: 0, oy: -PITCH },
    { eid: 'DR', ox: PITCH, oy: PITCH }, // 斜格
    { eid: 'UL', ox: -PITCH, oy: -PITCH },
  ];

  it('横向过阈值 → 取该侧紧邻格', () => {
    expect(pickSwapTarget(PASS, 0, cands, T)?.eid).toBe('R');
    expect(pickSwapTarget(-PASS, 0, cands, T)?.eid).toBe('L');
  });
  it('纵向过阈值 → 取该侧紧邻格（Y 正负两朝向都靠符号判定·不假设朝向）', () => {
    expect(pickSwapTarget(0, PASS, cands, T)?.eid).toBe('D'); // +y
    expect(pickSwapTarget(0, -PASS, cands, T)?.eid).toBe('U'); // -y
  });
  it('未过 0.4 格阈值 → null（视为点选）', () => {
    expect(pickSwapTarget(UNDER, 0, cands, T)).toBeNull();
    expect(pickSwapTarget(0, UNDER, cands, T)).toBeNull();
  });
  it('阈值边界（== 0.4 格）含入 → 交换', () => {
    expect(pickSwapTarget(T * PITCH, 0, cands, T)?.eid).toBe('R');
  });
  it('斜向取主轴：|dx|>|dy| 取横邻、|dy|>|dx| 取纵邻（不取斜格）', () => {
    expect(pickSwapTarget(PASS, PASS * 0.5, cands, T)?.eid).toBe('R'); // 横为主
    expect(pickSwapTarget(PASS * 0.5, PASS, cands, T)?.eid).toBe('D'); // 纵为主
    expect(pickSwapTarget(PASS, PASS - 1, cands, T)?.eid).toBe('R'); // 接近 45° 仍取略大轴
  });
  it('并列（|dx|==|dy|）取横轴主轴（确定）', () => {
    expect(pickSwapTarget(PASS, PASS, cands, T)?.eid).toBe('R');
  });
  it('越界方向无邻格 → null', () => {
    const onlyRight: NeighborCandidate[] = [{ eid: 'R', ox: PITCH, oy: 0 }];
    expect(pickSwapTarget(-PASS, 0, onlyRight, T)).toBeNull(); // 向左但无左邻
  });
  it('仅斜格（无正交邻格）→ null（斜格不入选）', () => {
    const onlyDiag: NeighborCandidate[] = [{ eid: 'DR', ox: PITCH, oy: PITCH }];
    expect(pickSwapTarget(PASS, 5, onlyDiag, T)).toBeNull();
  });
  it('零位移 → null', () => {
    expect(pickSwapTarget(0, 0, cands, T)).toBeNull();
  });
  it('间距最小者优先（跳过更远的同向格）', () => {
    const twoRight: NeighborCandidate[] = [
      { eid: 'far', ox: 2 * PITCH, oy: 0 },
      { eid: 'near', ox: PITCH, oy: 0 },
    ];
    expect(pickSwapTarget(PASS, 0, twoRight, T)?.eid).toBe('near');
  });
});

// ── 集成脚手架：clickable + match3-drag-swap + match3-board 全链 ──────────
// 3×3 视图格 · 格 idx=r*3+c 位于世界 (c*PITCH, r*PITCH) · box 命中体 · Clickable{action:'cell',phase:'down'}。
function setup(): World {
  const w = new World();
  for (const s of clickableCapability.systems) w.addSystem(s);
  for (const s of match3DragSwapCapability.systems) w.addSystem(s);
  for (const s of match3BoardCapability.systems) w.addSystem(s);

  w.createEntity('board');
  w.addComponent('board', {
    type: 'MatchBoard', cols: 3, rows: 3, kindCount: 3, cells: [0, 1, 2, 1, 2, 0, 2, 0, 1],
    kindResource: ['red', 'grn', 'blu'], matAmount: 1, coinResource: '', coinPerTile: 0,
    kindTint: [0xff0000, 0x00ff00, 0x0000ff], kindLabel: ['R', 'G', 'B'],
    phase: 'idle', selIndex: -1, swapA: -1, swapB: -1, stepTimer: 0, stepDelay: 0, selectAction: 'cell',
  } as MatchBoard);
  w.addComponent('board', { type: 'RandomSeed', seed: 12345, sequence: 0 } as RandomSeed);

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const id = `bc${idx}`;
      w.createEntity(id);
      w.addComponent(id, { type: 'BoardCell', boardId: 'board', index: idx } as BoardCell);
      w.addComponent(id, { type: 'Transform', x: c * PITCH, y: r * PITCH, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
      w.addComponent(id, { type: 'Shape', kind: 'box', width: PITCH, height: PITCH } as Shape);
      w.addComponent(id, { type: 'Clickable', action: 'cell', phase: 'down' } as Clickable);
    }
  }
  w.createEntity('iq');
  w.addComponent('iq', { type: 'InputQueue', actions: [] } as InputQueue);
  return w;
}
const board = (w: World): MatchBoard => w.getComponent<MatchBoard>('board', 'MatchBoard')!;
function setInput(w: World, actions: InputQueue['actions']): void {
  w.getComponent<InputQueue>('iq', 'InputQueue')!.actions = actions;
}
// 指针按下（选中起点格·走 clickable）。
function press(w: World, x: number, y: number): void {
  setInput(w, [{ source: 'm', x, y, phase: 'down' }]);
  w.tick();
}
// 壳层合成的拖拽抬起（本能力消费）。source 区分鼠标/触屏两路（capability 层等价）。
function dragUp(w: World, fx: number, fy: number, tx: number, ty: number, source = 'm'): void {
  setInput(w, [{ source, key: 'drag', x: fx, y: fy, values: [tx, ty], phase: 'drag' }]);
  w.tick();
}
const cellCenter = (idx: number): { x: number; y: number } => ({ x: (idx % 3) * PITCH, y: Math.floor(idx / 3) * PITCH });

// ── ② 拖过阈值 → 交换（与点选两格逐字段同形） ─────────────────────────
describe('match3-drag-swap — 拖过阈值发起交换', () => {
  it('按住 idx4 向右滑过阈值 → 与右邻 idx5 交换（phase→swapped, swapA/B）', () => {
    const w = setup();
    const a = cellCenter(4);
    press(w, a.x, a.y); // 按下选中起点格
    expect(board(w).selIndex).toBe(4);
    dragUp(w, a.x, a.y, a.x + PASS, a.y); // 向右滑过阈值
    expect(board(w).phase).toBe('swapped');
    expect(board(w).swapA).toBe(4);
    expect(board(w).swapB).toBe(5);
    // 邻格 B 上的选中 Signal 与「点 B」逐字段同形。
    expect(w.getComponent<Signal>('bc5', 'Signal')).toEqual({ type: 'Signal', name: 'cell', source: 'bc5' });
  });

  it('拖拽交换 ≡ 点选两格：swapA/B/phase 与被换格逐字段一致', () => {
    // 拖拽路径。
    const wd = setup();
    const a = cellCenter(4);
    press(wd, a.x, a.y);
    dragUp(wd, a.x, a.y, a.x + PASS, a.y);
    // 点选两格路径（同盘同格·纯 clickable 两次按下）。
    const wc = setup();
    press(wc, a.x, a.y); // 点 idx4
    const b = cellCenter(5);
    press(wc, b.x, b.y); // 点 idx5
    // 交换结果逐字段一致。
    expect(board(wd).phase).toBe(board(wc).phase);
    expect(board(wd).swapA).toBe(board(wc).swapA);
    expect(board(wd).swapB).toBe(board(wc).swapB);
    expect(board(wd).cells).toEqual(board(wc).cells);
    // 触发交换的邻格 Signal 逐字段一致。
    expect(w2sig(wd)).toEqual(w2sig(wc));
  });
  const w2sig = (w: World): Signal | undefined => w.getComponent<Signal>('bc5', 'Signal');

  it('向下滑 → 与下邻 idx7 交换（纵轴·Y 朝向由几何定）', () => {
    const w = setup();
    const a = cellCenter(4);
    press(w, a.x, a.y);
    dragUp(w, a.x, a.y, a.x, a.y + PASS);
    expect(board(w).phase).toBe('swapped');
    expect(board(w).swapA).toBe(4);
    expect(board(w).swapB).toBe(7);
  });

  it('斜向（右下·右分量更大）取横轴主轴 → 与右邻 idx5 交换', () => {
    const w = setup();
    const a = cellCenter(4);
    press(w, a.x, a.y);
    dragUp(w, a.x, a.y, a.x + PASS, a.y + PASS * 0.5);
    expect(board(w).phase).toBe('swapped');
    expect(board(w).swapB).toBe(5);
  });
});

// ── ③ 未过阈值 → 视为点选（起点格仍选中·不交换） ───────────────────────
describe('match3-drag-swap — 未过阈值视为点选', () => {
  it('滑动不足 0.4 格 → 不发邻格信号·起点格仍选中·停在 idle', () => {
    const w = setup();
    const a = cellCenter(4);
    press(w, a.x, a.y);
    dragUp(w, a.x, a.y, a.x + UNDER, a.y); // 不足阈值
    expect(board(w).phase).toBe('idle');
    expect(board(w).selIndex).toBe(4); // 仍选中起点格 = 点选
    expect(w.hasComponent('bc5', 'Signal')).toBe(false);
  });
  it('滑向棋盘外（越界方向无邻格）→ 不交换·起点格仍选中', () => {
    const w = setup();
    const corner = cellCenter(0); // 左上角格·左/上均越界
    press(w, corner.x, corner.y);
    dragUp(w, corner.x, corner.y, corner.x - PASS, corner.y); // 向左（无左邻）
    expect(board(w).phase).toBe('idle');
    expect(board(w).selIndex).toBe(0);
  });
});

// ── ④ 触屏 / 鼠标两路（capability 层对 source 无关，等价发起交换） ────────
describe('match3-drag-swap — 触屏/鼠标两路等价', () => {
  it('触屏 drag（source=touch）与鼠标 drag（source=mouse）同样发起交换', () => {
    for (const src of ['touch', 'mouse']) {
      const w = setup();
      const a = cellCenter(4);
      press(w, a.x, a.y);
      dragUp(w, a.x, a.y, a.x + PASS, a.y, src);
      expect(board(w).phase, `route=${src}`).toBe('swapped');
      expect(board(w).swapB, `route=${src}`).toBe(5);
    }
  });
});

// ── ⑤ 既有点选消费零回归（本能力在场不干扰纯点选两格交换） ───────────────
describe('match3-drag-swap — 既有点选路零回归', () => {
  it('本能力已装载时·纯点选两格仍正常交换（drag 未参与则完全不介入）', () => {
    const w = setup(); // 三系统全在场
    const a = cellCenter(4);
    const b = cellCenter(5);
    press(w, a.x, a.y); // 点 idx4
    expect(board(w).selIndex).toBe(4);
    press(w, b.x, b.y); // 点相邻 idx5
    expect(board(w).phase).toBe('swapped');
    expect(board(w).swapA).toBe(4);
    expect(board(w).swapB).toBe(5);
  });
  it('再点同一格 = 取消选中（本能力不影响）', () => {
    const w = setup();
    const a = cellCenter(4);
    press(w, a.x, a.y);
    expect(board(w).selIndex).toBe(4);
    press(w, a.x, a.y); // 再点自己
    expect(board(w).selIndex).toBe(-1);
    expect(board(w).phase).toBe('idle');
  });
});
