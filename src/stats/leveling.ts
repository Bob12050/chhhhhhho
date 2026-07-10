/**
 * Leveling curve. Exp required to advance FROM the given level. Centralized and
 * pure so progression is testable and tunable in one place.
 *
 * Shape: quadratic early (levels feel fast through the story's first acts) +
 * a small cubic term that dominates late. The cubic coefficient is tuned by
 * tools/balance-sim.ts's story-time model so the main story lands at roughly
 * 25〜35 hours (0.22 ≈ 30h) — raise it to lengthen the endgame, lower it to
 * shorten. Old saves keep their stored level; only future exp-to-next changes.
 */
export function expToNext(level: number): number {
  return Math.floor(20 + level * level * 8 + 0.22 * level ** 3);
}

/** Total exp to reach a target level from level 1. */
export function totalExpForLevel(level: number): number {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += expToNext(l);
  return sum;
}
