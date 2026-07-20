import petsJson from '@/data/defs/pets.json';
import {
  ENEMY_HP_SCALE,
  scaleFlatCombatStats,
} from '@/balance/progression-scale';
import type { DerivedStats } from '@/stats/stats';

/**
 * Pet definitions (data-driven). Pets are a single finished sprite (NOT the
 * paper-doll system) that follows the player, grants a passive bonus that
 * scales with pet level (src/pets/pet-growth.ts) and assists in combat.
 */
export interface PetDef {
  id: string;
  name: string;
  textureKey: string;
  tint?: string;
  scale?: number;
  /** Base passive at Lv1; grows +8%/level. */
  passive?: Partial<DerivedStats>;
  /** Base assist-attack damage at Lv1 (0/absent = never attacks). */
  atkBase?: number;
  /** Flavor for the pet screen. */
  description?: string;
}

interface PetsFile {
  pets: PetDef[];
}

const pets = new Map<string, PetDef>();
for (const raw of (petsJson as unknown as PetsFile).pets) {
  const pet: PetDef = {
    ...raw,
    passive: raw.passive ? scaleFlatCombatStats(raw.passive) : undefined,
    atkBase: raw.atkBase == null ? undefined : Math.round(raw.atkBase * ENEMY_HP_SCALE),
  };
  pets.set(pet.id, pet);
}

export function getPet(id: string): PetDef | undefined {
  return pets.get(id);
}

export function allPets(): PetDef[] {
  return [...pets.values()];
}
