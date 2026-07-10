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
  /** Rarity rank R1〜R10 (color/label derived). Optional; defaults to 1. */
  rarity?: number;
  sellPrice: number;
  description: string;
}

export interface ConsumableDef {
  id: string;
  name: string;
  /** Restorative effect applied on use. */
  effect: { hp?: number; mp?: number };
  sellPrice: number;
  description: string;
}

export interface PetItemDef {
  id: string;
  name: string;
  /** Pet granted when this item is obtained. */
  petId: string;
  sellPrice: number;
  description: string;
}

export interface EquipmentDef {
  id: string;
  name: string;
  slot: EquipSlot;
  /** Rarity rank R1〜R10 (color/label derived). */
  rarity: number;
  visualId: string;
  /** Weapon type tags (main_hand only); gated against the job's allowed tags. */
  weaponTags?: string[];
  /**
   * Optional class-family restriction for armour/accessories (warrior, mage,
   * cleric, thief, tamer). Empty/undefined = anyone may equip (共通装備).
   */
  classRestrictions?: string[];
  element?: string;
  levelRequirement: number;
  jobRequirements?: string[];
  derived: Partial<DerivedStats>;
  sellPrice: number;
  description: string;
  /** Display label of the gear set this piece belongs to (雷鳴/凍晶/…). */
  series?: string;
}

interface ItemsFile {
  materials: MaterialDef[];
  consumables: ConsumableDef[];
  petItems: PetItemDef[];
  equipment: EquipmentDef[];
}

const file = itemsJson as ItemsFile;

const materials = new Map<string, MaterialDef>();
const consumables = new Map<string, ConsumableDef>();
const petItems = new Map<string, PetItemDef>();
const equipment = new Map<string, EquipmentDef>();

for (const m of file.materials) materials.set(m.id, m);
for (const c of file.consumables) consumables.set(c.id, c);
for (const p of file.petItems ?? []) petItems.set(p.id, p);
for (const e of file.equipment) equipment.set(e.id, e);

export function getMaterial(id: string): MaterialDef | undefined {
  return materials.get(id);
}
export function getConsumable(id: string): ConsumableDef | undefined {
  return consumables.get(id);
}
export function getPetItem(id: string): PetItemDef | undefined {
  return petItems.get(id);
}
export function allPetItems(): PetItemDef[] {
  return [...petItems.values()];
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
export function allConsumables(): ConsumableDef[] {
  return [...consumables.values()];
}
export function itemDisplayName(id: string): string {
  return (
    materials.get(id)?.name ??
    consumables.get(id)?.name ??
    petItems.get(id)?.name ??
    equipment.get(id)?.name ??
    id
  );
}
