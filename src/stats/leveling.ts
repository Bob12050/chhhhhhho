/**
 * Leveling curve. Exp required to advance FROM the given level. Centralized and
 * pure so progression is testable and tunable in one place.
 */
export function expToNext(level: number): number {
  return Math.floor(20 + level * level * 8);
}

/** Total exp to reach a target level from level 1. */
export function totalExpForLevel(level: number): number {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += expToNext(l);
  return sum;
}
