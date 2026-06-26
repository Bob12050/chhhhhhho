/**
 * Item rarity — single source of truth for the whole game (materials and
 * equipment). Engine-independent (no Phaser) so it is usable from data, UI,
 * and the validator.
 *
 * Rarity is a numeric rank R1〜R10 (Monster-Hunter-style ladder) grouped into
 * named, coloured bands. Higher rank = later-game content requiring rarer craft
 * materials. Band name + colour are DERIVED from the rank (never stored on the
 * item) so they can never drift out of sync. Rarity drives presentation only
 * (colour/label) and, for the post-clear endgame, affix counts. It NEVER
 * changes a sprite (visualId is shared). See docs item_system_spec v0.1 §1.6.
 */
export const MIN_RANK = 1;
export const MAX_RANK = 10;
export type RarityRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

interface Band {
  /** Band display name (色帯名). */
  band: string;
  /** Colour name (色). */
  color: string;
  /** Hex colour for Phaser text/tints. */
  hex: string;
}

// rank (1-10) -> band. Canonical mapping from item_system_spec v0.1 §1.6.
const BANDS: Record<RarityRank, Band> = {
  1: { band: 'コモン', color: '白', hex: '#cfd3e6' },
  2: { band: 'コモン', color: '白', hex: '#cfd3e6' },
  3: { band: 'アンコモン', color: '緑', hex: '#6fcf6f' },
  4: { band: 'アンコモン', color: '緑', hex: '#6fcf6f' },
  5: { band: 'レア', color: '青', hex: '#5aa9ff' },
  6: { band: 'レア', color: '青', hex: '#5aa9ff' },
  7: { band: 'エピック', color: '紫', hex: '#c77dff' },
  8: { band: 'レジェンド', color: '金', hex: '#ffb347' },
  9: { band: 'ミシック', color: '赤', hex: '#ff5566' },
  10: { band: 'ディヴァイン', color: '虹', hex: '#9af7ff' },
};

/** Clamp/round any input to a valid rank (defaults to 1 / common). */
export function normalizeRank(r?: number | null): RarityRank {
  if (r == null || !Number.isFinite(r)) return 1;
  const n = Math.round(r);
  return Math.min(MAX_RANK, Math.max(MIN_RANK, n)) as RarityRank;
}

/** True when `r` is an integer within the legal R1〜R10 range (validator use). */
export function isValidRank(r: unknown): r is RarityRank {
  return typeof r === 'number' && Number.isInteger(r) && r >= MIN_RANK && r <= MAX_RANK;
}

export function rarityColorHex(rank?: number | null): string {
  return BANDS[normalizeRank(rank)].hex;
}

export function rarityColor(rank?: number | null): number {
  return parseInt(rarityColorHex(rank).slice(1), 16);
}

/** Band name only, e.g. "エピック". */
export function rarityBand(rank?: number | null): string {
  return BANDS[normalizeRank(rank)].band;
}

/** Colour name only, e.g. "紫". */
export function rarityColorName(rank?: number | null): string {
  return BANDS[normalizeRank(rank)].color;
}

/** Full label, e.g. "R7 エピック". */
export function rarityLabel(rank?: number | null): string {
  const n = normalizeRank(rank);
  return `R${n} ${BANDS[n].band}`;
}

/** Numeric rank (1-10) for sorting / threshold comparisons. */
export function rarityRank(rank?: number | null): number {
  return normalizeRank(rank);
}
