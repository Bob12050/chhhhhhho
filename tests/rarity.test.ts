import { describe, it, expect } from 'vitest';
import {
  RARITIES,
  normalizeRarity,
  rarityColorHex,
  rarityColor,
  rarityLabel,
  rarityRank,
} from '@/data/rarity';

describe('rarity', () => {
  it('normalizes unknown/empty to common', () => {
    expect(normalizeRarity(undefined)).toBe('common');
    expect(normalizeRarity('')).toBe('common');
    expect(normalizeRarity('bogus')).toBe('common');
    expect(normalizeRarity('legendary')).toBe('legendary');
  });

  it('gives a distinct hex color per tier', () => {
    const hexes = RARITIES.map(rarityColorHex);
    expect(new Set(hexes).size).toBe(RARITIES.length);
    for (const h of hexes) expect(h).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('number color matches the hex', () => {
    expect(rarityColor('rare')).toBe(parseInt(rarityColorHex('rare').slice(1), 16));
  });

  it('ranks ascending from common to legendary', () => {
    expect(rarityRank('common')).toBe(0);
    expect(rarityRank('legendary')).toBe(RARITIES.length - 1);
    expect(rarityRank('rare')).toBeGreaterThan(rarityRank('uncommon'));
  });

  it('has a label for every tier', () => {
    for (const r of RARITIES) expect(rarityLabel(r).length).toBeGreaterThan(0);
  });
});
