/**
 * Equipment slots. Full set defined now (data structure ready for later
 * phases); Phase 0 only wires up head / torso / main_hand visuals.
 */
export const EQUIP_SLOTS = [
  'head',
  'torso',
  'hands',
  'waist',
  'feet',
  'back',
  'main_hand',
  'accessory_1',
  'accessory_2',
] as const;

export type EquipSlot = (typeof EQUIP_SLOTS)[number];
