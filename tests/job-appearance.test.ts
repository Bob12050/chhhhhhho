import { describe, expect, it } from 'vitest';
import { appearanceUsesSafeDiagonalWalk } from '@/jobs/job-appearance';

describe('job appearance diagonal walk safety', () => {
  it('guards male sheets whose walk cells contain attack or cast poses', () => {
    expect(appearanceUsesSafeDiagonalWalk('mage', 'male')).toBe(true);
    expect(appearanceUsesSafeDiagonalWalk('grand_magia', 'male')).toBe(true);
    expect(appearanceUsesSafeDiagonalWalk('ranger', 'male')).toBe(true);
  });

  it('leaves clean male and all female walk rows untouched', () => {
    expect(appearanceUsesSafeDiagonalWalk('fighter', 'male')).toBe(false);
    expect(appearanceUsesSafeDiagonalWalk('mage', 'female')).toBe(false);
    expect(appearanceUsesSafeDiagonalWalk(undefined, 'male')).toBe(false);
  });
});
