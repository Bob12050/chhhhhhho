import { getEquipment } from '@/data/items';
import type { EquipSlot } from '@/equipment/slots';

export function jobRegaliaAppearanceForItem(itemId: string | null | undefined): string | undefined {
  if (!itemId) return undefined;
  return getEquipment(itemId)?.appearance;
}

export function equippedJobRegaliaAppearance(
  equipment: Partial<Record<EquipSlot, string | null>>,
): string | undefined {
  return jobRegaliaAppearanceForItem(equipment.torso);
}
