import type { ClassFamily } from '@/jobs/job-defs';

/**
 * Pure equip-restriction helpers (no Phaser/DOM) so they stay headless-testable.
 *
 * Weapons are restricted by weapon tag vs the job's allowed tags; armour and
 * accessories may carry an optional class-family restriction. An item with no
 * restriction (empty/undefined `classRestrictions`) is 共通装備 and equippable
 * by anyone. A restricted item requires the active job's family to be listed;
 * the starter job (adventurer) has no family and can only wear 共通装備.
 */
export function canEquipClass(
  family: ClassFamily | undefined,
  classRestrictions: string[] | undefined,
): boolean {
  if (!classRestrictions || classRestrictions.length === 0) return true;
  if (!family) return false;
  return classRestrictions.includes(family);
}

/** Weapon-tag gate: at least one of the item's tags must be allowed by the job. */
export function canEquipWeapon(
  allowedTags: readonly string[],
  weaponTags: string[] | undefined,
): boolean {
  if (!weaponTags || weaponTags.length === 0) return true;
  return weaponTags.some((t) => allowedTags.includes(t));
}
