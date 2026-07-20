import type { EquipmentDef } from '@/data/items';
import { normalizeRank } from '@/data/rarity';
import type { DerivedStats } from '@/stats/stats';

/**
 * Equipment used to lose relative value as allocated base stats grew. These
 * curves keep early gear gentle while making high-rank drops a major part of
 * the player's combat power. Rate/utility stats are deliberately untouched.
 */
const OFFENSE_MULTIPLIER = [0, 1, 1.3, 1.5, 1.7, 2, 2, 2.2, 2.4, 2.6, 3] as const;
const DEFENSE_MULTIPLIER = [0, 1, 1.05, 1.08, 1.1, 1.12, 1.14, 1.16, 1.17, 1.18, 1.2] as const;
const REGALIA_OFFENSE_BUDGET = [0, 5, 10, 16, 30, 44, 60, 78, 98, 112, 136] as const;

function scaleFlat(value: number | undefined, multiplier: number): number | undefined {
  return value == null ? undefined : Math.round(value * multiplier);
}

function scaleDefenses(
  derived: Partial<DerivedStats>,
  rank: number,
): Partial<DerivedStats> {
  const next = { ...derived };
  const multiplier = DEFENSE_MULTIPLIER[normalizeRank(rank)];
  if (next.def != null) next.def = scaleFlat(next.def, multiplier);
  if (next.magDef != null) next.magDef = scaleFlat(next.magDef, multiplier);
  return next;
}

/** Apply the shared R1-R10 curve to authored equipment definitions. */
export function applyAuthoredEquipmentPower(def: EquipmentDef): EquipmentDef {
  const next = scaleDefenses(def.derived, def.rarity);
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
  const next = scaleDefenses(derived, rank);
  delete next.physAtk;
  delete next.magAtk;
  next[magical ? 'magAtk' : 'physAtk'] = REGALIA_OFFENSE_BUDGET[normalizeRank(rank)];
  return next;
}
