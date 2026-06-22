import { TEX } from '@/assets/gen/textures';
import type { VisualId } from '@/data/visual-ids';

/**
 * Maps an equipment `visualId` to a generated texture key. Many items can share
 * one visual family (e.g. wood/iron swords differ only by ramp/texture), so the
 * game never requires a unique sheet per item. Keyed by VisualId so it stays in
 * sync with the canonical id list.
 */
const VISUAL_TO_TEX: Record<VisualId, string> = {
  sword_wood: TEX.swordWood,
  sword_iron: TEX.swordIron,
  cap_leather: TEX.capLeather,
  helm_iron: TEX.helmIron,
  vest_cloth: TEX.vestCloth,
  plate_iron: TEX.plateIron,
};

export function visualTexture(visualId: string | undefined): string | null {
  if (!visualId) return null;
  return (VISUAL_TO_TEX as Record<string, string>)[visualId] ?? null;
}
