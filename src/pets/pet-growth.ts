/**
 * Pet growth math (pure, Vitest-covered). Pets level from shared kill exp
 * while active; levels scale their passive bonus and assist attack. Exp is
 * stored as a single lifetime total per pet — the level is derived, so saves
 * stay one number per pet.
 */

import type { DerivedStats } from '@/stats/stats';
import type { PetDef } from './pet-defs';

export const PET_MAX_LEVEL = 30;
/** Fraction of enemy exp the active pet absorbs. */
export const PET_EXP_SHARE = 0.3;
/** Exp granted when hatching a duplicate egg. */
export const DUPLICATE_EGG_EXP = 300;

/** Total exp required to REACH a level (level 1 = 0). Gentle quadratic. */
export function petTotalExpForLevel(level: number): number {
  const lv = Math.max(1, Math.min(PET_MAX_LEVEL, Math.floor(level)));
  return Math.round(20 * (lv - 1) * (lv + 2));
}

export function petLevelFromExp(exp: number): number {
  let lv = 1;
  while (lv < PET_MAX_LEVEL && exp >= petTotalExpForLevel(lv + 1)) lv++;
  return lv;
}

/** Exp still needed for the next level (0 at cap). */
export function petExpToNext(exp: number): number {
  const lv = petLevelFromExp(exp);
  if (lv >= PET_MAX_LEVEL) return 0;
  return petTotalExpForLevel(lv + 1) - exp;
}

/** Progress fraction toward the next level, 0..1 (1 at cap). */
export function petLevelProgress(exp: number): number {
  const lv = petLevelFromExp(exp);
  if (lv >= PET_MAX_LEVEL) return 1;
  const lo = petTotalExpForLevel(lv);
  const hi = petTotalExpForLevel(lv + 1);
  return (exp - lo) / (hi - lo);
}

/**
 * Passive bonus at a level: base values grow +8%/level, rounded away from
 * zero so a +1 def pet still improves eventually. Rate-like stats (crit/
 * drop/lifesteal/goldRate, 0..1 fractions) scale the same but unrounded.
 */
const FRACTION_KEYS = new Set(['critRate', 'dropRate', 'lifesteal', 'goldRate']);

export function scaledPassive(def: Pick<PetDef, 'passive'>, level: number): Partial<DerivedStats> {
  const out: Partial<DerivedStats> = {};
  const mult = 1 + 0.08 * (Math.max(1, level) - 1);
  for (const [k, v] of Object.entries(def.passive ?? {})) {
    const key = k as keyof DerivedStats;
    const scaled = (v as number) * mult;
    out[key] = FRACTION_KEYS.has(k) ? scaled : Math.round(scaled);
  }
  return out;
}

/** Assist attack damage at a level (atkBase from the pet def). */
export function petAttackDamage(atkBase: number, level: number): number {
  return Math.max(1, Math.round(atkBase * (1 + 0.12 * (Math.max(1, level) - 1))));
}
