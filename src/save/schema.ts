/**
 * Save data schema. Versioned with a migration path. Phase 0 stores a subset;
 * Phase 1 fields (jobs, skills, pets, quest flags...) extend this same shape.
 * IDs are stable strings; deleted/unknown ids are dropped on load (defensive).
 */
export const SAVE_VERSION = 1;

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
  };
  equipment: Partial<Record<string, string | null>>; // slot -> itemId
  inventory: {
    materials: Record<string, number>; // itemId -> qty
    consumables: Record<string, number>; // itemId -> qty
    equipmentOwned: string[]; // owned equipment ids (one entry per piece)
  };
  flags: Record<string, boolean>; // e.g. boss defeated
  settings: { sfx: boolean; bgm: boolean };
}

export type SaveData = SaveDataV1;

export function createDefaultSave(slot: number): SaveData {
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
      gold: 0,
    },
    equipment: { head: null, torso: null, main_hand: 'wood_sword' },
    inventory: {
      materials: {},
      consumables: { potion_hp: 3, potion_mp: 2 },
      equipmentOwned: ['wood_sword', 'leather_cap', 'cloth_vest'],
    },
    flags: {},
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
    },
    flags: { ...(data.flags ?? {}) },
    settings: { ...def.settings, ...(data.settings ?? {}) },
  };
  return merged;
}
