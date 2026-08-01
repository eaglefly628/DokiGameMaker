import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { BlockGrid, BlockTrayPiece, PlaceBlockIntent, InputQueue, Transform, Shape } from '@engine/protocol/components.js';
import { gridDragSquareCapability, squarePointToCell } from './grid-drag-square.js';
import { blockGridCapability } from '../tier3/block-grid.js';

// ── 纯吸附 helper ──────────────────────────────────────────────
describe('grid-drag-square — squarePointToCell', () => {
  it('原点 → (0,0)；+cellSize → (1,0)/(0,1)', () => {
    expect(squarePointToCell(0, 0, 48, 0, 0)).toEqual({ col: 0, row: 0 });
    expect(squarePointToCell(0, 0, 48, 48, 0)).toEqual({ col: 1, row: 0 });
    expect(squarePointToCell(0, 0, 48, 0, 96)).toEqual({ col: 0, row: 2 });
  });
  it('就近取整（半格内归本格）', () => {
    expect(squarePointToCell(0, 0, 48, 60, 0)).toEqual({ col: 1, row: 0 });   // 60/48=1.25→1
    expect(squarePointToCell(0, 0, 48, 72, 0)).toEqual({ col: 2, row: 0 });   // 72/48=1.5→2
  });
  it('带 origin 偏移', () => {
    expect(squarePointToCell(100, 200, 40, 180, 240)).toEqual({ col: 2, row: 1 });
  });
});

// ── 集成：拖托盘块 → 吸附 → PlaceBlockIntent → block-grid 落子 ──────────────
describe('grid-drag-square — 拖放落子（接 block-grid）', () => {
  function setup(): World {
    const w = new World();
    for (const s of gridDragSquareCapability.systems) w.addSystem(s);
    for (const s of blockGridCapability.systems) w.addSystem(s);
    // 3×3 棋盘·方格几何：格(0,0)中心=世界(0,0)·cellSize 48。单格形状。
    w.createEntity('board');
    w.addComponent('board', {
      type: 'BlockGrid', cols: 3, rows: 3, cells: new Array(9).fill(-1),
      shapes: [{ id: 'single', cells: [0, 0], tint: 0x55 }], tray: [0, -1, -1], traySize: 3,
      originX: 0, originY: 0, cellSize: 48,
    } as BlockGrid);
    // 托盘块实体（slot 0）：像素 (300, 300)·48×48 命中体。
    w.createEntity('piece0');
    w.addComponent('piece0', { type: 'BlockTrayPiece', boardId: 'board', slot: 0 } as BlockTrayPiece);
    w.addComponent('piece0', { type: 'Transform', x: 300, y: 300, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('piece0', { type: 'Shape', kind: 'box', width: 48, height: 48 } as Shape);
    return w;
  }
  const bg = (w: World): BlockGrid => w.getComponent<BlockGrid>('board', 'BlockGrid')!;
  function dragFromTo(w: World, fx: number, fy: number, tx: number, ty: number): void {
    w.createEntity('q');
    w.addComponent('q', { type: 'InputQueue', actions: [{ source: 'p1', key: 'drag', x: fx, y: fy, values: [tx, ty], phase: 'drag' }] } as InputQueue);
  }

  it('拖起点命中托盘块 + 终点吸附 (2,0) → 落子该格', () => {
    const w = setup();
    dragFromTo(w, 300, 300, 96, 0); // 起点=piece0；终点 (96,0)→格(2,0)
    w.tick();
    // grid-drag-square 写 PlaceBlockIntent{slot:0,col:2,row:0} → block-place 同拍消费落子
    expect(bg(w).cells[2]).toBe(0x55);      // 格(2,0)=idx2 被填
    expect(bg(w).tray[0]).toBe(-1);         // slot0 用掉
    expect(w.hasComponent('piece0', 'PlaceBlockIntent')).toBe(false); // 意图被消费清除
  });

  it('起点没命中任何托盘块 → 不产意图（不落子）', () => {
    const w = setup();
    dragFromTo(w, 10, 10, 96, 0); // 起点 (10,10) 离 piece0(300,300) 很远
    w.tick();
    expect(bg(w).cells.every((v) => v === -1)).toBe(true);
    expect(bg(w).tray[0]).toBe(0); // 槽没消耗
  });

  it('棋盘无方格几何 → 不吸附（安全 no-op）', () => {
    const w = setup();
    const b = bg(w); delete b.originX; delete b.cellSize; // 去掉几何
    dragFromTo(w, 300, 300, 96, 0);
    w.tick();
    expect(bg(w).cells.every((v) => v === -1)).toBe(true);
  });
});
