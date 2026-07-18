import { INTRO_PENDING_FLAG } from '@/tutorial/onboarding';
import type { EquipmentDef } from '@/data/items';
import {
  normalizeCharacterGender,
  type CharacterGender,
} from '@/player/character-gender';

/**
 * Save data schema. Versioned with a migration path. Phase 0 stores a subset;
 * Phase 1 fields (jobs, skills, pets, quest flags...) extend this same shape.
 * IDs are stable strings; deleted/unknown ids are dropped on load (defensive).
 */
export const SAVE_VERSION = 2;

export interface SaveDataV1 {
  version: number;
  slot: number;
  savedAt: number; // epoch ms
  mapId: string;
  player: {
    x: number;
    y: number;
    level: number;
    exp: number;
    statPoints: number;
    base: { STR: number; VIT: number; INT: number; DEX: number; LUK: number };
    hp: number;
    mp: number;
    gold: number;
    skills: Record<string, number>; // skillId -> level (1 = learned)
    skillSlots: (string | null)[]; // active skill assigned to each slot
    skillPoints: number;
    gender: CharacterGender;
    jobId: string;
    unlockedJobs: string[];
    jobLevels: Record<string, number>; // jobId -> level (multi-job system)
    jobExp: Record<string, number>; // jobId -> exp toward next level
    ownedPets: string[];
    activePetId: string | null;
  };
  equipment: Partial<Record<string, string | null>>; // slot -> itemId
  inventory: {
    materials: Record<string, number>; // itemId -> qty
    consumables: Record<string, number>; // itemId -> qty
    equipmentOwned: string[]; // owned equipment ids (one entry per piece)
    /** Unique post-clear equipment definitions owned by this save. */
    generatedEquipment: EquipmentDef[];
    /** Materials ever obtained (recipe visibility gate). Legacy saves lack it. */
    seenMaterials?: Record<string, true>;
  };
  flags: Record<string, boolean>; // e.g. boss defeated
  quests: {
    active: string[]; // accepted, not yet turned in
    completed: string[]; // turned in
    progress: Record<string, Record<string, number>>; // questId -> enemyId -> kills
  };
  /** Lifetime kills per enemy id (bestiary). Legacy saves lack it. */
  killCounts?: Record<string, number>;
  /** Pet system v2 (eggs held + per-pet exp). Legacy saves lack it. */
  pets?: { eggs: Record<string, number>; exp: Record<string, number> };
  /** Post-clear investigation board state. */
  investigations: { seed: number; completed: number };
  settings: { sfx: boolean; bgm: boolean };
}

export type SaveData = SaveDataV1;

export function createDefaultSave(
  slot: number,
  gender: CharacterGender = 'female',
): SaveData {
  return {
    version: SAVE_VERSION,
    slot,
    savedAt: Date.now(),
    mapId: 'town',
    player: {
      x: 180,
      y: 360,
      level: 1,
      exp: 0,
      statPoints: 0,
      base: { STR: 5, VIT: 5, INT: 5, DEX: 5, LUK: 5 },
      hp: -1, // -1 = full on load
      mp: -1,
      gold: 30,
      skills: { slash: 1 },
      skillSlots: ['slash', null],
      skillPoints: 0,
      gender,
      jobId: 'adventurer',
      unlockedJobs: ['adventurer'],
      jobLevels: { adventurer: 1 },
      jobExp: { adventurer: 0 },
      ownedPets: [],
      activePetId: null,
    },
    equipment: { head: null, torso: null, main_hand: 'wood_sword' },
    inventory: {
      materials: {},
      consumables: { potion_hp: 3, potion_mp: 2 },
      equipmentOwned: ['wood_sword', 'leather_cap', 'cloth_vest'],
      generatedEquipment: [],
    },
    flags: { [INTRO_PENDING_FLAG]: true },
    // The village elder offers the first hunt in-world. Existing saves retain
    // their quest state through migration; only a brand-new slot starts empty.
    quests: { active: [], completed: [], progress: {} },
    investigations: {
      seed: (0x51f15e ^ Math.imul(slot + 1, 0x9e3779b1)) >>> 0,
      completed: 0,
    },
    settings: { sfx: true, bgm: true },
  };
}

/**
 * Migrate an unknown/older save object up to the current version. Unknown
 * shapes fall back to defaults for missing fields rather than throwing.
 */
export function migrate(raw: unknown, slot: number): SaveData {
  const def = createDefaultSave(slot);
  if (!raw || typeof raw !== 'object') return def;
  const data = raw as Partial<SaveDataV1>;

  // Future: switch on data.version and transform step-by-step. For v1 we merge
  // defensively so partial/corrupt saves still load.
  const merged: SaveData = {
    ...def,
    ...data,
    version: SAVE_VERSION,
    slot,
    player: { ...def.player, ...(data.player ?? {}) },
    equipment: { ...def.equipment, ...(data.equipment ?? {}) },
    inventory: {
      materials: { ...(data.inventory?.materials ?? {}) },
      consumables: { ...(data.inventory?.consumables ?? {}) },
      equipmentOwned: [...(data.inventory?.equipmentOwned ?? [])],
      generatedEquipment: Array.isArray(data.inventory?.generatedEquipment)
        ? [...data.inventory.generatedEquipment]
        : [],
      seenMaterials: { ...(data.inventory?.seenMaterials ?? {}) },
    },
    flags: { ...(data.flags ?? {}) },
    quests: {
      active: [...(data.quests?.active ?? [])],
      completed: [...(data.quests?.completed ?? [])],
      progress: { ...(data.quests?.progress ?? {}) },
    },
    killCounts: { ...(data.killCounts ?? {}) },
    pets: {
      eggs: { ...(data.pets?.eggs ?? {}) },
      exp: { ...(data.pets?.exp ?? {}) },
    },
    investigations: {
      seed: Number.isFinite(data.investigations?.seed)
        ? (data.investigations?.seed ?? def.investigations.seed) >>> 0
        : def.investigations.seed,
      completed: Math.max(0, Math.floor(data.investigations?.completed ?? 0)),
    },
    settings: { ...def.settings, ...(data.settings ?? {}) },
  };

  // Saves created before gender selection keep their current artwork.
  merged.player.gender = normalizeCharacterGender(data.player?.gender);

  // Remap legacy placeholder job ids (pre-canonical tree) to canonical ones.
  const LEGACY_JOBS: Record<string, string> = { novice: 'adventurer', warrior: 'fighter' };
  merged.player.jobId = LEGACY_JOBS[merged.player.jobId] ?? merged.player.jobId;
  merged.player.unlockedJobs = merged.player.unlockedJobs.map((j) => LEGACY_JOBS[j] ?? j);
  if (!merged.player.unlockedJobs.includes('adventurer'))
    merged.player.unlockedJobs.unshift('adventurer');

  // Seed per-job levels/exp from the active job when an older save lacks them.
  if (!data.player?.jobLevels)
    merged.player.jobLevels = { [merged.player.jobId]: merged.player.level };
  if (!data.player?.jobExp) merged.player.jobExp = { [merged.player.jobId]: merged.player.exp };

  return merged;
}
