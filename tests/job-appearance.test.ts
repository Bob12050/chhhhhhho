import { describe, expect, it } from 'vitest';
import { appearanceSafeDiagonalWalkMode } from '@/jobs/job-appearance';

describe('job appearance diagonal walk safety', () => {
  it('guards male sheets whose walk cells contain attack or cast poses', () => {
    expect(appearanceSafeDiagonalWalkMode('mage', 'male')).toBe('down');
    expect(appearanceSafeDiagonalWalkMode('ranger', 'male')).toBe('down');
  });

  it('leaves clean male and all female walk rows untouched', () => {
    expect(appearanceSafeDiagonalWalkMode('fighter', 'male')).toBeNull();
    expect(appearanceSafeDiagonalWalkMode('grand_magia', 'male')).toBeNull();
    expect(appearanceSafeDiagonalWalkMode('mage', 'female')).toBeNull();
    expect(appearanceSafeDiagonalWalkMode(undefined, 'male')).toBeNull();
  });
});
