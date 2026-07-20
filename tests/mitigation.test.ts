import { describe, it, expect } from 'vitest';
import { mitigateDamage, MITIGATION_K } from '@/combat/mitigation';

describe('damage mitigation (防御/魔防)', () => {
  it('zero defense passes damage through', () => {
    expect(mitigateDamage(40, 0)).toBe(40);
  });
  it('K defense halves damage', () => {
    expect(mitigateDamage(40, MITIGATION_K)).toBe(20);
  });
  it('diminishing returns, never below 1', () => {
    expect(mitigateDamage(40, 30)).toBe(39);
    expect(mitigateDamage(40, 10_000)).toBe(3);
    expect(mitigateDamage(40, 10_000_000)).toBe(1);
    expect(mitigateDamage(2, 10_000)).toBe(1);
  });
  it('negative defense is clamped (no amplification)', () => {
    expect(mitigateDamage(40, -50)).toBe(40);
  });
});
