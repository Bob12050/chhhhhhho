import type { EquipmentDef } from '@/data/items';
import { normalizeRank } from '@/data/rarity';
import type { DerivedStats } from '@/stats/stats';

/**
 * Rank is the main equipment progression axis. Every step is intentionally
 * visible: early ranks establish the build, R4-R6 are large upgrades, and
 * R7-R10 change the scale of the character. Authored values still preserve
 * each item's identity inside its rank.
 */
export const OFFENSE_MULTIPLIER = [0, 3, 4.5, 6.5, 9, 12.5, 17, 23, 30, 39, 50] as const;
export const DEFENSE_MULTIPLIER = [0, 2.4, 3.2, 4.3, 5.7, 7.5, 9.8, 12.8, 16.6, 21.5, 28] as const;
export const HEALTH_MULTIPLIER = [0, 2, 2.7, 3.6, 4.8, 6.4, 8.5, 11.2, 14.8, 19.5, 25.5] as const;
export const RESOURCE_MULTIPLIER = [0, 1.2, 1.6, 2.1, 2.7, 3.5, 4.5, 5.8, 7.4, 9.4, 12] as const;
export const UTILITY_MULTIPLIER = [0, 1, 1.15, 1.35, 1.6, 1.9, 2.25, 2.65, 3.1, 3.6, 4.2] as const;
export const RATE_MULTIPLIER = [0, 1, 1.1, 1.22, 1.36, 1.52, 1.7, 1.9, 2.12, 2.36, 2.62] as const;
const REGALIA_OFFENSE_BUDGET = [0, 12, 30, 62, 110, 205, 340, 560, 870, 1350, 2200] as const;

function scaleFlat(value: number | undefined, multiplier: number): number | undefined {
  return value == null ? undefined : Math.round(value * multiplier);
}

function scaleRate(value: number | undefined, multiplier: number): number | undefined {
  return value == null ? undefined : Number((value * multiplier).toFixed(3));
}

function scaleEquipmentStats(
  derived: Partial<DerivedStats>,
  rank: number,
): Partial<DerivedStats> {
  const next = { ...derived };
  const normalized = normalizeRank(rank);
  const offense = OFFENSE_MULTIPLIER[normalized];
  const defense = DEFENSE_MULTIPLIER[normalized];
  if (next.physAtk != null) next.physAtk = scaleFlat(next.physAtk, offense);
  if (next.magAtk != null) next.magAtk = scaleFlat(next.magAtk, offense);
  if (next.def != null) next.def = scaleFlat(next.def, defense);
  if (next.magDef != null) next.magDef = scaleFlat(next.magDef, defense);
  if (next.maxHp != null) next.maxHp = scaleFlat(next.maxHp, HEALTH_MULTIPLIER[normalized]);
  if (next.maxMp != null) next.maxMp = scaleFlat(next.maxMp, RESOURCE_MULTIPLIER[normalized]);
  const utility = UTILITY_MULTIPLIER[normalized];
  if (next.accuracy != null) next.accuracy = scaleFlat(next.accuracy, utility);
  if (next.evasion != null) next.evasion = scaleFlat(next.evasion, utility);
  if (next.moveSpeed != null) next.moveSpeed = scaleFlat(next.moveSpeed, utility);
  const rate = RATE_MULTIPLIER[normalized];
  if (next.critRate != null) next.critRate = scaleRate(next.critRate, rate);
  if (next.atkSpeed != null) next.atkSpeed = scaleRate(next.atkSpeed, rate);
  if (next.dropRate != null) next.dropRate = scaleRate(next.dropRate, rate);
  if (next.lifesteal != null) next.lifesteal = scaleRate(next.lifesteal, rate);
  if (next.goldRate != null) next.goldRate = scaleRate(next.goldRate, rate);
  return next;
}

/** Apply the shared R1-R10 curve to authored equipment definitions. */
export function applyAuthoredEquipmentPower(def: EquipmentDef): EquipmentDef {
  const next = scaleEquipmentStats(def.derived, def.rarity);
  return { ...def, derived: next };
}

/**
 * Class-trial regalia is a guaranteed three-piece reward, so its weapon lands
 * just below the strongest shared weapon of the same rank. Cleric and mage
 * families receive magic attack; the physical families receive physical attack.
 */
export function applyJobRegaliaPower(
  derived: Partial<DerivedStats>,
  rank: number,
  magical: boolean,
): Partial<DerivedStats> {
  const next = scaleEquipmentStats(derived, rank);
  delete next.physAtk;
  delete next.magAtk;
  next[magical ? 'magAtk' : 'physAtk'] = REGALIA_OFFENSE_BUDGET[normalizeRank(rank)];
  return next;
}
