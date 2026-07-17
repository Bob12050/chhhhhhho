import type { EquipSlot } from '@/equipment/slots';

export interface IronEquipmentAppearance {
  head: boolean;
  torso: boolean;
  hands: boolean;
  feet: boolean;
  sword: boolean;
  shield: boolean;
}

type EquippedItems = Partial<Record<EquipSlot, string | null>>;

/** Resolve only the first iron set whose artwork is actually available. */
export function resolveIronEquipmentAppearance(
  equipment: EquippedItems,
): IronEquipmentAppearance {
  const torso = equipment.torso === 'iron_plate';
  return {
    head: equipment.head === 'iron_helm',
    torso,
    hands: equipment.hands === 'iron_gloves',
    feet: equipment.feet === 'iron_boots',
    sword: equipment.main_hand === 'iron_sword',
    // There is no off-hand slot yet. The pilot shield is bundled with the
    // iron plate until the equipment model can own shields independently.
    shield: torso,
  };
}

export function hasIronEquipmentAppearance(state: IronEquipmentAppearance): boolean {
  return state.head || state.torso || state.hands || state.feet || state.sword;
}
