import { getEquipment } from '@/data/items';
import type { EquipSlot } from '@/equipment/slots';

export function jobRegaliaAppearanceForItem(itemId: string | null | undefined): string | undefined {
  if (!itemId) return undefined;
  return getEquipment(itemId)?.appearance;
}

export interface EquippedJobRegaliaProgress {
  appearance?: string;
  count: number;
  complete: boolean;
}

export function equippedJobRegaliaProgress(
  equipment: Partial<Record<EquipSlot, string | null>>,
): EquippedJobRegaliaProgress {
  const parts = [equipment.head, equipment.torso, equipment.main_hand]
    .map(jobRegaliaAppearanceForItem)
    .filter((appearance): appearance is string => !!appearance);
  const appearance = parts[0];
  const count = appearance ? parts.filter((part) => part === appearance).length : 0;
  return { appearance, count, complete: count === 3 };
}

export function equippedJobRegaliaAppearance(
  equipment: Partial<Record<EquipSlot, string | null>>,
): string | undefined {
  const progress = equippedJobRegaliaProgress(equipment);
  return progress.complete ? progress.appearance : undefined;
}
