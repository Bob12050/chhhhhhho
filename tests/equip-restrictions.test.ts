import { describe, it, expect } from 'vitest';
import { canEquipClass, canEquipWeapon } from '@/equipment/restrictions';

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
