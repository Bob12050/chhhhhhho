import type { EquipmentDef } from '@/data/items';
import { normalizeRank } from '@/data/rarity';
import type { DerivedStats } from '@/stats/stats';

/**
 * Equipment used to lose relative value as allocated base stats grew. These
 * curves keep early gear gentle while making high-rank drops a major part of
 * the player's combat power. Rate/utility stats are deliberately untouched.
 */
const OFFENSE_MULTIPLIER = [0, 3, 3.6, 4.2, 4.8, 5.5, 6.2, 7, 7.8, 8.8, 10] as const;
const DEFENSE_MULTIPLIER = [0, 2.4, 2.7, 3, 3.3, 3.6, 3.9, 4.2, 4.5, 4.8, 5.2] as const;
const HEALTH_MULTIPLIER = [0, 2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3] as const;
const RESOURCE_MULTIPLIER = [0, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2, 2.2] as const;
const REGALIA_OFFENSE_BUDGET = [0, 12, 28, 42, 68, 100, 144, 196, 264, 348, 460] as const;

function scaleFlat(value: number | undefined, multiplier: number): number | undefined {
  return value == null ? undefined : Math.round(value * multiplier);
}

function scaleEquipmentStats(
  derived: Partial<DerivedStats>,
  rank: number,
): Partial<DerivedStats> {
  const next = { ...derived };
  const normalized = normalizeRank(rank);
  const defense = DEFENSE_MULTIPLIER[normalized];
  if (next.def != null) next.def = scaleFlat(next.def, defense);
  if (next.magDef != null) next.magDef = scaleFlat(next.magDef, defense);
  if (next.maxHp != null) next.maxHp = scaleFlat(next.maxHp, HEALTH_MULTIPLIER[normalized]);
  if (next.maxMp != null) next.maxMp = scaleFlat(next.maxMp, RESOURCE_MULTIPLIER[normalized]);
  return next;
}

/** Apply the shared R1-R10 curve to authored equipment definitions. */
export function applyAuthoredEquipmentPower(def: EquipmentDef): EquipmentDef {
  const next = scaleEquipmentStats(def.derived, def.rarity);
  if (def.slot === 'main_hand') {
    const multiplier = OFFENSE_MULTIPLIER[normalizeRank(def.rarity)];
    if (next.physAtk != null) next.physAtk = scaleFlat(next.physAtk, multiplier);
    if (next.magAtk != null) next.magAtk = scaleFlat(next.magAtk, multiplier);
  }
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
