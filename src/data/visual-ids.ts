/**
 * Canonical list of valid equipment `visualId`s (pure, no engine deps). Used by
 * the data validator and the runtime visual->texture mapping. A visual family
 * may be shared by many items (color/effect variants).
 */
export const VISUAL_IDS = [
  'sword_wood',
  'sword_iron',
  'cap_leather',
  'helm_iron',
  'vest_cloth',
  'plate_iron',
] as const;

export type VisualId = (typeof VISUAL_IDS)[number];

export const VISUAL_ID_SET: ReadonlySet<string> = new Set(VISUAL_IDS);
