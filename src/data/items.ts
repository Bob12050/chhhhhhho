import itemsJson from './defs/items.json';
import type { DerivedStats } from '@/stats/stats';
import type { EquipSlot } from '@/equipment/slots';

/**
 * Item definitions (immutable). Loaded from JSON so content is data-driven and
 * not hardcoded. ItemDefinition is separate from any runtime ItemInstance so
 * random options can be added later without touching definitions.
 */
export type ItemType = 'material' | 'consumable' | 'equipment' | 'quest' | 'pet_item';

export interface MaterialDef {
  id: string;
  name: string;
  sellPrice: number;
  description: string;
}

export interface EquipmentDef {
  id: string;
  name: string;
  slot: EquipSlot;
  rarity: string;
  visualId: string;
  weaponTags?: string[];
  element?: string;
  levelRequirement: number;
  jobRequirements?: string[];
  derived: Partial<DerivedStats>;
  sellPrice: number;
  description: string;
}

interface ItemsFile {
  materials: MaterialDef[];
  equipment: EquipmentDef[];
}

const file = itemsJson as ItemsFile;

const materials = new Map<string, MaterialDef>();
const equipment = new Map<string, EquipmentDef>();

for (const m of file.materials) materials.set(m.id, m);
for (const e of file.equipment) equipment.set(e.id, e);

export function getMaterial(id: string): MaterialDef | undefined {
  return materials.get(id);
}
export function getEquipment(id: string): EquipmentDef | undefined {
  return equipment.get(id);
}
export function allEquipment(): EquipmentDef[] {
  return [...equipment.values()];
}
export function allMaterials(): MaterialDef[] {
  return [...materials.values()];
}
export function itemDisplayName(id: string): string {
  return materials.get(id)?.name ?? equipment.get(id)?.name ?? id;
}
