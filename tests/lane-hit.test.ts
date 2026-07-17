import { describe, expect, it } from 'vitest';
import { circleIntersectsLane, pointToSegmentDistance } from '@/combat/lane-hit';

describe('lane collision', () => {
  it('uses the finite segment rather than an infinite warning line', () => {
    expect(pointToSegmentDistance(50, 8, 0, 0, 100, 0)).toBeCloseTo(8);
    expect(pointToSegmentDistance(140, 0, 0, 0, 100, 0)).toBeCloseTo(40);
  });

  it('includes both the lane width and the player radius', () => {
    expect(circleIntersectsLane(50, 19, 5, 0, 0, 100, 0, 30)).toBe(true);
    expect(circleIntersectsLane(50, 21, 5, 0, 0, 100, 0, 30)).toBe(false);
  });
});
