import { describe, it, expect } from 'vitest';
import {
  petTotalExpForLevel,
  petLevelFromExp,
  petExpToNext,
  petLevelProgress,
  scaledPassive,
  petAttackDamage,
  PET_MAX_LEVEL,
  DUPLICATE_EGG_EXP,
} from '@/pets/pet-growth';
import { GameState } from '@/player/game-state';
import { migrate } from '@/save/schema';
import { allPets, getPet } from '@/pets/pet-defs';
import { getPetItem } from '@/data/items';

describe('pet growth math', () => {
  it('level curve is monotonic and capped', () => {
    expect(petTotalExpForLevel(1)).toBe(0);
    for (let lv = 2; lv <= PET_MAX_LEVEL; lv++) {
      expect(petTotalExpForLevel(lv)).toBeGreaterThan(petTotalExpForLevel(lv - 1));
    }
    expect(petLevelFromExp(0)).toBe(1);
    expect(petLevelFromExp(10_000_000)).toBe(PET_MAX_LEVEL);
    expect(petExpToNext(10_000_000)).toBe(0);
    expect(petLevelProgress(10_000_000)).toBe(1);
  });

  it('scaled passive grows with level (ints rounded, rates fractional)', () => {
    const def = { passive: { maxHp: 10, dropRate: 0.04 } };
    const lv1 = scaledPassive(def, 1);
    const lv10 = scaledPassive(def, 10);
    expect(lv1.maxHp).toBe(10);
    expect(lv10.maxHp).toBeGreaterThan(10);
    expect(Number.isInteger(lv10.maxHp)).toBe(true);
    expect(lv10.dropRate).toBeCloseTo(0.04 * 1.72);
  });

  it('assist damage scales with level', () => {
    expect(petAttackDamage(5, 1)).toBe(5);
    expect(petAttackDamage(5, 10)).toBeGreaterThan(5);
  });
});

describe('eggs and hatching', () => {
  it('picked-up eggs are stored, hatch into a new pet once', () => {
    const gs = new GameState();
    expect(gs.addEgg('pet_egg_wolf')).toBe(true);
    expect(gs.petEggs['pet_egg_wolf']).toBe(1);
    expect(gs.hatchEgg('pet_egg_wolf')).toBe('new');
    expect(gs.ownedPets).toContain('wolf_pet');
    expect(gs.petEggs['pet_egg_wolf']).toBeUndefined();
    // No egg left → null.
    expect(gs.hatchEgg('pet_egg_wolf')).toBeNull();
  });

  it('duplicate eggs feed exp instead of duplicating the pet', () => {
    const gs = new GameState();
    gs.addEgg('pet_egg_wolf');
    gs.addEgg('pet_egg_wolf');
    gs.hatchEgg('pet_egg_wolf');
    expect(gs.hatchEgg('pet_egg_wolf')).toBe('duplicate');
    expect(gs.ownedPets.filter((p) => p === 'wolf_pet')).toHaveLength(1);
    expect(gs.petExp['wolf_pet']).toBe(DUPLICATE_EGG_EXP);
  });

  it('active pet passive scales with its level via recompute', () => {
    const gs = new GameState();
    gs.addEgg('pet_egg_golem');
    gs.hatchEgg('pet_egg_golem'); // auto-active (first pet)
    const def0 = gs.derived.def;
    gs.gainPetExp('golem_pet', petTotalExpForLevel(20));
    expect(gs.petLevel('golem_pet')).toBe(20);
    expect(gs.derived.def).toBeGreaterThan(def0);
  });

  it('eggs and pet exp survive a save round trip', () => {
    const gs = new GameState();
    gs.addEgg('pet_egg_dragon');
    gs.addEgg('pet_egg_wolf');
    gs.hatchEgg('pet_egg_wolf');
    gs.gainPetExp('wolf_pet', 123);
    const loaded = new GameState();
    loaded.loadFrom(migrate(JSON.parse(JSON.stringify(gs.toSave(0))), 0));
    expect(loaded.petEggs['pet_egg_dragon']).toBe(1);
    expect(loaded.petExp['wolf_pet']).toBe(123);
    expect(loaded.ownedPets).toContain('wolf_pet');
  });
});

describe('pet roster data', () => {
  it('every pet has an egg item, and every egg maps to a pet', () => {
    const petsWithEgg = new Set<string>();
    for (const id of ['pet_egg_slime','pet_egg_bat','pet_egg_wolf','pet_egg_shroom','pet_egg_lizard','pet_egg_flame','pet_egg_wisp','pet_egg_golem','pet_egg_knight','pet_egg_dragon']) {
      const item = getPetItem(id);
      expect(item, id).toBeDefined();
      expect(getPet(item!.petId), id).toBeDefined();
      petsWithEgg.add(item!.petId);
    }
    for (const p of allPets()) expect(petsWithEgg.has(p.id), p.id).toBe(true);
    expect(allPets().length).toBeGreaterThanOrEqual(10);
  });
});
