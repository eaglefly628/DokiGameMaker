// 零漂移守护：atoms 的规范 seededShuffle 必须与各游戏原先各自手搓的洗牌**逐字节等价**，
// 否则收敛会改牌序/turnHash。这里内联 game-g(seededShuffleArr) 与 game-e(mulberry32+shuffle) 的**原实现**对照。
import { describe, it, expect } from 'vitest';
import { seededShuffle, mulberry32 } from './index.js';

// game-g/game-g-build.ts 原 seededShuffleArr（t += C 无 |0 形）
function oldGameG<T>(xs: readonly T[], seed: number): T[] {
  const arr = [...xs]; let t = seed >>> 0;
  const rnd = (): number => { t += 0x6d2b79f5; let x = t; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
// game-e/deck.ts 原 mulberry32 + shuffle（a = (a+C)|0 形）
function oldGameEMul(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function oldGameE<T>(cards: readonly T[], seed: number): T[] {
  const out = [...cards]; const rng = oldGameEMul(seed);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

const SEEDS = [1, 5, 42, 12345, 0x9e37, 0x51ed, (1 * 2654435761) >>> 0, (5 * 2654435761) >>> 0, (3 * 2654435761) >>> 0];
const SIZES = [16, 36, 52];

describe('atoms · seededShuffle 零漂移（== game-g / game-e 原手搓实现）', () => {
  it('对各 seed × size：atoms.seededShuffle === game-g 原 seededShuffleArr === game-e 原 shuffle', () => {
    for (const size of SIZES) {
      const base = Array.from({ length: size }, (_, i) => i);
      for (const seed of SEEDS) {
        const a = seededShuffle(base, seed);
        expect(a, `seed=${seed} size=${size} vs game-g`).toEqual(oldGameG(base, seed));
        expect(a, `seed=${seed} size=${size} vs game-e`).toEqual(oldGameE(base, seed));
      }
    }
  });
  it('mulberry32 序列 == game-e 原工厂（前 50 取数）', () => {
    for (const seed of SEEDS) {
      const r1 = mulberry32(seed); const r2 = oldGameEMul(seed);
      for (let i = 0; i < 50; i++) expect(r1()).toBe(r2());
    }
  });
  it('不改原数组', () => { const base = [0, 1, 2, 3, 4]; const copy = [...base]; seededShuffle(base, 7); expect(base).toEqual(copy); });
});
