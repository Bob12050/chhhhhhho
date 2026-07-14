import type { Direction } from '@/config/layers';

const DIRECTION_ANGLE: Record<Direction, number> = {
  right: 0,
  'down-right': Math.PI / 4,
  down: Math.PI / 2,
  'down-left': (Math.PI * 3) / 4,
  left: Math.PI,
  'up-left': (-Math.PI * 3) / 4,
  up: -Math.PI / 2,
  'up-right': -Math.PI / 4,
};

const DIAGONAL_COMPONENT = Math.SQRT1_2;
const DIRECTION_VECTOR: Record<Direction, { x: number; y: number }> = {
  right: { x: 1, y: 0 },
  'down-right': { x: DIAGONAL_COMPONENT, y: DIAGONAL_COMPONENT },
  down: { x: 0, y: 1 },
  'down-left': { x: -DIAGONAL_COMPONENT, y: DIAGONAL_COMPONENT },
  left: { x: -1, y: 0 },
  'up-left': { x: -DIAGONAL_COMPONENT, y: -DIAGONAL_COMPONENT },
  up: { x: 0, y: -1 },
  'up-right': { x: DIAGONAL_COMPONENT, y: -DIAGONAL_COMPONENT },
};

const OCTANTS: readonly Direction[] = [
  'right',
  'down-right',
  'down',
  'down-left',
  'left',
  'up-left',
  'up',
  'up-right',
];

const OCTANT = Math.PI / 4;
const HALF_OCTANT = OCTANT / 2;
const HYSTERESIS = (Math.PI * 7) / 180;

function angularDistance(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

/** Resolve an input vector to one of eight facings without boundary flicker. */
export function directionFromVector(
  vx: number,
  vy: number,
  current?: Direction,
): Direction | undefined {
  if (Math.hypot(vx, vy) < 0.08) return undefined;
  const angle = Math.atan2(vy, vx);
  if (current && angularDistance(angle, DIRECTION_ANGLE[current]) <= HALF_OCTANT + HYSTERESIS) {
    return current;
  }
  const octant = Math.round(angle / OCTANT);
  return OCTANTS[(octant + OCTANTS.length) % OCTANTS.length];
}

/** Unit vector for movement, attacks, rolls and directional effects. */
export function directionVector(dir: Direction): { x: number; y: number } {
  return DIRECTION_VECTOR[dir];
}

export function isDiagonalDirection(dir: Direction): boolean {
  return dir.includes('-');
}
