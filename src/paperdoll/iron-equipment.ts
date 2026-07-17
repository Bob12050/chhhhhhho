import type { EquipSlot } from '@/equipment/slots';

export interface IronEquipmentAppearance {
  head: boolean;
  outfit: boolean;
  weapon: boolean;
}

type EquippedItems = Partial<Record<EquipSlot, string | null>>;

/** Resolve only the first iron set whose artwork is actually available. */
export function resolveIronEquipmentAppearance(
  equipment: EquippedItems,
): IronEquipmentAppearance {
  return {
    head: equipment.head === 'iron_helm',
    // The torso selects one authored outfit. Hands, waist and feet keep their
    // own stats, but no longer create fragile runtime art combinations.
    outfit: equipment.torso === 'iron_plate',
    weapon: equipment.main_hand === 'iron_sword',
  };
}

export function hasIronEquipmentAppearance(state: IronEquipmentAppearance): boolean {
  return state.head || state.outfit || state.weapon;
}
