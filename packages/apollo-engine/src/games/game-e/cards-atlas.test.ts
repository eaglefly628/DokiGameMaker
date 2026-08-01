import { describe, it, expect } from 'vitest';
import { cardSheetIndex, cardCell, cardRect, COLS, ROWS, CELL_W, CELL_H, SHEET_W, SHEET_H } from './cards-atlas.js';
import { STANDARD_DECK } from './deck.js';

// cards.png 8 列 × 7 行（格 71×96）网格 UV 切片自洽：52 张牌索引唯一、矩形不越界。
describe('game-e · cards 精灵表 UV', () => {
  it('整图与网格一致：8 列 × 7 行，格 71×96', () => {
    expect(COLS).toBe(8);
    expect(ROWS).toBe(7);
    expect(CELL_W).toBe(71);
    expect(CELL_H).toBe(96);
    expect(CELL_W * COLS).toBe(SHEET_W);
    expect(CELL_H * ROWS).toBe(SHEET_H);
  });

  it('52 张牌帧索引唯一、落在 [0, 8×7)', () => {
    const idx = STANDARD_DECK.map((c) => cardSheetIndex(c.suit, c.rank));
    expect(idx.length).toBe(52);
    expect(new Set(idx).size).toBe(52);
    for (const i of idx) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(COLS * ROWS);
    }
  });

  it('定点校验：A♥=0、A♠=3、K♥=4、K♠=7、8♠=47、7♠=51', () => {
    expect(cardSheetIndex('hearts', 'A')).toBe(0); // 左半 col0 row0
    expect(cardSheetIndex('spades', 'A')).toBe(3); // 左半 col3 row0
    expect(cardSheetIndex('hearts', 'K')).toBe(4); // 右半 col4 row0
    expect(cardSheetIndex('spades', 'K')).toBe(7); // 右半 col7 row0
    expect(cardSheetIndex('spades', '8')).toBe(5 * 8 + 7); // 右半 col7 row5 = 47
    expect(cardSheetIndex('spades', '7')).toBe(6 * 8 + 3); // 左半 col3 row6 = 51
  });

  it('矩形不越界', () => {
    for (const c of STANDARD_DECK) {
      const r = cardRect(c.suit, c.rank);
      expect(r.x + r.w).toBeLessThanOrEqual(SHEET_W);
      expect(r.y + r.h).toBeLessThanOrEqual(SHEET_H);
    }
    expect(cardCell('hearts', 'A')).toEqual({ col: 0, row: 0 });
  });
});
