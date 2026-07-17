import type { ClassFamily } from '@/jobs/job-defs';
import { minJobTierForRank } from '@/data/rarity';

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

/** Exact-job gate used by class regalia. Empty/undefined means unrestricted. */
export function canEquipJob(jobId: string, jobRequirements: string[] | undefined): boolean {
  if (!jobRequirements || jobRequirements.length === 0) return true;
  return jobRequirements.includes(jobId);
}

/** Weapon-tag gate: at least one of the item's tags must be allowed by the job. */
export function canEquipWeapon(
  allowedTags: readonly string[],
  weaponTags: string[] | undefined,
): boolean {
  if (!weaponTags || weaponTags.length === 0) return true;
  return weaponTags.some((t) => allowedTags.includes(t));
}

/**
 * Tier gate: the rarity ladder is tied to job progression, so a job may only
 * equip a rarity whose required tier it has reached (see docs/CONTENT_MAP.md).
 */
export function canEquipTier(jobTier: number, rarity: number | undefined): boolean {
  return jobTier >= minJobTierForRank(rarity);
}
