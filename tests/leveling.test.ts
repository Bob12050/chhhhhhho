import { describe, it, expect } from 'vitest';
import { expToNext, totalExpForLevel } from '@/stats/leveling';

describe('leveling curve', () => {
  it('is monotonically increasing', () => {
    for (let l = 1; l < 50; l++) {
      expect(expToNext(l + 1)).toBeGreaterThan(expToNext(l));
    }
  });

  it('totalExpForLevel sums the curve', () => {
    expect(totalExpForLevel(1)).toBe(0);
    expect(totalExpForLevel(3)).toBe(expToNext(1) + expToNext(2));
  });
});
