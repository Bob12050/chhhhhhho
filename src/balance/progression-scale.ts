import type { DerivedStats } from '@/stats/stats';

/**
 * The original vertical slice used intentionally small combat numbers. The
 * finished progression needs enough numerical room for levels, gear, skills,
 * and pets to each create a visible step without resorting to decimals.
 */
export const CORE_STAT_SCALE = 2;
export const ENEMY_HP_SCALE = 2.5;
export const ENEMY_DAMAGE_SCALE = 2;
export const POWER_SCALE_SAVE_FLAG = '_combat_power_scale_v2';

const FLAT_COMBAT_STATS = new Set<keyof DerivedStats>([
  'maxHp',
  'physAtk',
  'magAtk',
  'def',
  'magDef',
]);

export function scaleCoreStat(value: number): number {
  return Math.round(value * CORE_STAT_SCALE);
}

/** Scale flat combat bonuses while leaving rates, speed, and MP economy alone. */
export function scaleFlatCombatStats(
  derived: Partial<DerivedStats>,
  multiplier = CORE_STAT_SCALE,
): Partial<DerivedStats> {
  const next = { ...derived };
  for (const key of FLAT_COMBAT_STATS) {
    const value = next[key];
    if (value != null) next[key] = Math.round(value * multiplier);
  }
  return next;
}
