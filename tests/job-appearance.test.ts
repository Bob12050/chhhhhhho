import { describe, expect, it } from 'vitest';
import { appearanceSafeDiagonalWalkMode } from '@/jobs/job-appearance';

describe('job appearance diagonal walk safety', () => {
  it('uses the authored walk rows for every rebuilt HD appearance', () => {
    expect(appearanceSafeDiagonalWalkMode('fighter', 'male')).toBeNull();
    expect(appearanceSafeDiagonalWalkMode('grand_magia', 'male')).toBeNull();
    expect(appearanceSafeDiagonalWalkMode('mage', 'male')).toBeNull();
    expect(appearanceSafeDiagonalWalkMode('ranger', 'male')).toBeNull();
    expect(appearanceSafeDiagonalWalkMode('mage', 'female')).toBeNull();
    expect(appearanceSafeDiagonalWalkMode(undefined, 'male')).toBeNull();
  });
});
