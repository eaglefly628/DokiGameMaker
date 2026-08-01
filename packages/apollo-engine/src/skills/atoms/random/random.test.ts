import { describe, it, expect } from 'vitest';
import { randomCapability, nextRandom, randomInt } from './index.js';
import type { RandomSeed } from '@engine/protocol/components.js';

function seed(s: number): RandomSeed {
  return { type: 'RandomSeed', seed: s, sequence: 0 };
}

describe('random atom', () => {
  it('is a world-service atom with no per-tick system', () => {
    expect(randomCapability.systems).toHaveLength(0);
  });

  it('produces a deterministic sequence for the same seed', () => {
    const a = seed(42);
    const b = seed(42);
    const seqA = [nextRandom(a), nextRandom(a), nextRandom(a)];
    const seqB = [nextRandom(b), nextRandom(b), nextRandom(b)];
    expect(seqA).toEqual(seqB);
  });

  it('different seeds diverge', () => {
    expect(nextRandom(seed(1))).not.toBe(nextRandom(seed(2)));
  });

  it('returns values in [0, 1) and advances sequence', () => {
    const s = seed(7);
    for (let i = 0; i < 100; i++) {
      const v = nextRandom(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(s.sequence).toBe(100);
  });

  it('randomInt stays within [min, max)', () => {
    const s = seed(123);
    for (let i = 0; i < 200; i++) {
      const n = randomInt(s, 5, 10);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThan(10);
    }
  });
});
