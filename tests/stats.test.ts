import { describe, it, expect } from 'vitest';
import { computeDerived, type BaseStats } from '@/stats/stats';

const base: BaseStats = { STR: 5, VIT: 5, INT: 5, DEX: 5, LUK: 5 };

describe('computeDerived', () => {
  it('computes derived stats from base stats deterministically', () => {
    const d = computeDerived(base);
    expect(d.maxHp).toBe(30 + 5 * 8 + 5); // 75
    expect(d.physAtk).toBe(2 + 5 * 2 + Math.floor(5 * 0.5)); // 14
    expect(d.moveSpeed).toBe(90);
  });

  it('applies base-stat modifiers before the formula', () => {
    const d = computeDerived(base, [{ base: { STR: 5 } }]);
    expect(d.physAtk).toBe(2 + 10 * 2 + Math.floor(5 * 0.5)); // 24
  });

  it('applies additive derived modifiers (equipment)', () => {
    const d = computeDerived(base, [{ derived: { physAtk: 4, def: 3 } }]);
    const baseD = computeDerived(base);
    expect(d.physAtk).toBe(baseD.physAtk + 4);
    expect(d.def).toBe(baseD.def + 3);
  });

  it('clamps crit rate to [0,1] and hp to >=1', () => {
    const d = computeDerived(base, [{ derived: { critRate: 5, maxHp: -1000 } }]);
    expect(d.critRate).toBeLessThanOrEqual(1);
    expect(d.maxHp).toBeGreaterThanOrEqual(1);
  });
});
