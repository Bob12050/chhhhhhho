import { describe, expect, it } from 'vitest';
import { directionFromVector, directionVector } from '@/config/directions';
import {
  diagonalFrameIndex,
  frameIndex,
  shouldFlipX,
} from '@/paperdoll/pose-atlas';

describe('eight-way facing', () => {
  it.each([
    [1, 0, 'right'],
    [1, 1, 'down-right'],
    [0, 1, 'down'],
    [-1, 1, 'down-left'],
    [-1, 0, 'left'],
    [-1, -1, 'up-left'],
    [0, -1, 'up'],
    [1, -1, 'up-right'],
  ] as const)('maps (%s, %s) to %s', (x, y, expected) => {
    expect(directionFromVector(x, y)).toBe(expected);
  });

  it('returns no facing inside the movement dead zone', () => {
    expect(directionFromVector(0.03, -0.03)).toBeUndefined();
  });

  it('keeps the current direction near an octant boundary', () => {
    const angle = (Math.PI * 27) / 180;
    expect(directionFromVector(Math.cos(angle), Math.sin(angle), 'right')).toBe('right');
  });

  it('returns normalized diagonal vectors', () => {
    const vector = directionVector('up-left');
    expect(Math.hypot(vector.x, vector.y)).toBeCloseTo(1);
    expect(vector.x).toBeLessThan(0);
    expect(vector.y).toBeLessThan(0);
  });
});

describe('diagonal pose atlas', () => {
  it('indexes the two direction blocks independently', () => {
    expect(diagonalFrameIndex('down-left', 'walk', 2)).toBe(6);
    expect(diagonalFrameIndex('up-left', 'walk', 2)).toBe(18);
  });

  it('mirrors right-hand diagonal art', () => {
    expect(shouldFlipX('down-right')).toBe(true);
    expect(shouldFlipX('up-right')).toBe(true);
    expect(diagonalFrameIndex('down-right', 'attack', 3)).toBe(11);
  });

  it('can replace a contaminated diagonal walk row with the idle pair', () => {
    expect(diagonalFrameIndex('down-left', 'walk', 0, { walkUsesIdle: true })).toBe(0);
    expect(diagonalFrameIndex('down-left', 'walk', 3, { walkUsesIdle: true })).toBe(1);
    expect(diagonalFrameIndex('up-left', 'walk', 2, { walkUsesIdle: true })).toBe(12);
  });

  it('falls back to the side pose when no diagonal sheet is assigned', () => {
    expect(frameIndex('down-left', 'walk', 2)).toBe(frameIndex('left', 'walk', 2));
  });
});
