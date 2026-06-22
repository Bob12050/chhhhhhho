import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/rng';

describe('Rng (seedable, deterministic)', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('weightedIndex respects weights over many rolls', () => {
    const rng = new Rng(7);
    const weights = [1, 3]; // index 1 ~3x as likely
    const counts = [0, 0];
    for (let i = 0; i < 4000; i++) counts[rng.weightedIndex(weights)]++;
    expect(counts[1]).toBeGreaterThan(counts[0]);
  });

  it('weightedIndex returns -1 for zero total', () => {
    expect(new Rng(1).weightedIndex([0, 0])).toBe(-1);
  });

  it('drop roll with fixed seed is reproducible', () => {
    const roll = (): boolean => new Rng(42).chance(0.5);
    expect(roll()).toBe(roll());
  });
});
