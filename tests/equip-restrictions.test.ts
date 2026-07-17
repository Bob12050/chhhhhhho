import { describe, it, expect } from 'vitest';
import {
  canEquipClass,
  canEquipJob,
  canEquipWeapon,
  canEquipTier,
} from '@/equipment/restrictions';
import { minJobTierForRank } from '@/data/rarity';

/**
 * Equip restrictions: weapons gate by weapon tag vs the job's allowed tags;
 * armour/accessories may carry an optional class-family restriction (共通装備
 * when empty). Pure logic — no Phaser.
 */
describe('canEquipClass (armour/accessory)', () => {
  it('anyone may wear unrestricted gear (共通装備)', () => {
    expect(canEquipClass(undefined, undefined)).toBe(true);
    expect(canEquipClass(undefined, [])).toBe(true);
    expect(canEquipClass('warrior', [])).toBe(true);
  });

  it('restricted gear needs the job family in the list', () => {
    expect(canEquipClass('warrior', ['warrior'])).toBe(true);
    expect(canEquipClass('mage', ['warrior', 'cleric'])).toBe(false);
    expect(canEquipClass('cleric', ['warrior', 'cleric'])).toBe(true);
  });

  it('the familyless starter (adventurer) cannot wear class-locked gear', () => {
    expect(canEquipClass(undefined, ['warrior'])).toBe(false);
  });
});

describe('canEquipJob (class regalia)', () => {
  it('allows unrestricted gear and only the named job for exact-job gear', () => {
    expect(canEquipJob('fighter', undefined)).toBe(true);
    expect(canEquipJob('fighter', [])).toBe(true);
    expect(canEquipJob('fighter', ['fighter'])).toBe(true);
    expect(canEquipJob('mage', ['fighter'])).toBe(false);
  });
});

describe('tier gate (rarity ↔ job progression)', () => {
  it('maps rarity bands to the required job tier', () => {
    expect(minJobTierForRank(1)).toBe(0); // 冒険者
    expect(minJobTierForRank(2)).toBe(1); // 1次職
    expect(minJobTierForRank(3)).toBe(1);
    expect(minJobTierForRank(4)).toBe(2); // 2次職
    expect(minJobTierForRank(6)).toBe(2);
    expect(minJobTierForRank(7)).toBe(3); // 3次職
    expect(minJobTierForRank(8)).toBe(3);
    expect(minJobTierForRank(9)).toBe(4); // 4次職
    expect(minJobTierForRank(10)).toBe(4);
  });

  it('lets a job equip only up to its tier band', () => {
    expect(canEquipTier(0, 1)).toBe(true); // 冒険者 → R1
    expect(canEquipTier(0, 2)).toBe(false); // 冒険者 ✗ R2
    expect(canEquipTier(1, 3)).toBe(true); // 1次職 → R3
    expect(canEquipTier(1, 4)).toBe(false); // 1次職 ✗ R4
    expect(canEquipTier(2, 6)).toBe(true); // 2次職 → R6
    expect(canEquipTier(2, 7)).toBe(false); // 2次職 ✗ R7
    expect(canEquipTier(4, 10)).toBe(true); // 4次職 → R10
  });
});

describe('canEquipWeapon (main_hand)', () => {
  it('a tagless weapon is equippable by anyone', () => {
    expect(canEquipWeapon([], undefined)).toBe(true);
    expect(canEquipWeapon(['sword'], [])).toBe(true);
  });

  it('needs at least one overlapping tag with the job', () => {
    expect(canEquipWeapon(['sword', 'axe'], ['sword'])).toBe(true);
    expect(canEquipWeapon(['staff', 'wand'], ['sword'])).toBe(false);
    expect(canEquipWeapon(['mace', 'staff', 'sword'], ['katana', 'sword'])).toBe(true);
  });
});
