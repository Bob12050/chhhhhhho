import petsJson from '@/data/defs/pets.json';
import type { DerivedStats } from '@/stats/stats';

/**
 * Pet definitions (data-driven). Pets are a single finished sprite (NOT the
 * paper-doll system) that follows the player and may grant passive derived
 * modifiers. Phase 1 ships one pet.
 */
export interface PetDef {
  id: string;
  name: string;
  textureKey: string;
  tint?: string;
  scale?: number;
  passive?: Partial<DerivedStats>;
}

interface PetsFile {
  pets: PetDef[];
}

const pets = new Map<string, PetDef>();
for (const p of (petsJson as unknown as PetsFile).pets) pets.set(p.id, p);

export function getPet(id: string): PetDef | undefined {
  return pets.get(id);
}

export function allPets(): PetDef[] {
  return [...pets.values()];
}
