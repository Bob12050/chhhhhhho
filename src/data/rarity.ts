/**
 * Item rarity — single source of truth for the whole game (materials and
 * equipment). Engine-independent (no Phaser) so it is usable from data, UI,
 * and the validator. Colors are stored as hex strings (for Phaser text styles)
 * with a number accessor for tints/shapes.
 *
 * Rarity drives presentation only (color/label) and, for the post-clear
 * endgame, affix counts. It NEVER changes a sprite (visualId is shared).
 */
export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];
export const RARITY_SET: ReadonlySet<string> = new Set(RARITIES);

const HEX: Record<Rarity, string> = {
  common: '#cfd3e6',
  uncommon: '#6fcf6f',
  rare: '#5aa9ff',
  epic: '#c77dff',
  legendary: '#ffb347',
};

const LABEL_JA: Record<Rarity, string> = {
  common: 'コモン',
  uncommon: 'アンコモン',
  rare: 'レア',
  epic: 'エピック',
  legendary: 'レジェンド',
};

export function normalizeRarity(r?: string | null): Rarity {
  return r && RARITY_SET.has(r) ? (r as Rarity) : 'common';
}

export function rarityColorHex(r?: string | null): string {
  return HEX[normalizeRarity(r)];
}

export function rarityColor(r?: string | null): number {
  return parseInt(rarityColorHex(r).slice(1), 16);
}

export function rarityLabel(r?: string | null): string {
  return LABEL_JA[normalizeRarity(r)];
}

/** Ordered rank (0 = common .. 4 = legendary), e.g. for sorting/comparison. */
export function rarityRank(r?: string | null): number {
  return RARITIES.indexOf(normalizeRarity(r));
}
