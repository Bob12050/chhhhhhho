import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { getPet } from '@/pets/pet-defs';

describe('pets', () => {
  it('obtaining a pet item adds and auto-summons the pet', () => {
    const gs = new GameState();
    gs.recompute(false);
    expect(gs.activePetId).toBeNull();
    expect(gs.obtainPetItem('pet_egg_slime')).toBe(true);
    expect(gs.ownedPets).toContain('slime_pet');
    expect(gs.activePetId).toBe('slime_pet');
  });

  it('active pet passive boosts derived stats', () => {
    const gs = new GameState();
    gs.recompute(false);
    const hp0 = gs.derived.maxHp;
    gs.obtainPetItem('pet_egg_slime');
    const pet = getPet('slime_pet')!;
    expect(gs.derived.maxHp).toBe(hp0 + (pet.passive!.maxHp ?? 0));
  });

  it('persists the pet through a save round-trip', () => {
    const gs = new GameState();
    gs.obtainPetItem('pet_egg_slime');
    const loaded = new GameState();
    loaded.loadFrom(JSON.parse(JSON.stringify(gs.toSave(0))));
    expect(loaded.activePetId).toBe('slime_pet');
    expect(loaded.ownedPets).toContain('slime_pet');
  });
});
