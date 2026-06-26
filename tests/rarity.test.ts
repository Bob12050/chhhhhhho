import { describe, it, expect } from 'vitest';
import {
  MIN_RANK,
  MAX_RANK,
  normalizeRank,
  isValidRank,
  rarityColorHex,
  rarityColor,
  rarityBand,
  rarityColorName,
  rarityLabel,
  rarityRank,
} from '@/data/rarity';

describe('rarity (R1〜R10)', () => {
  it('clamps/rounds unknown or out-of-range input to a legal rank', () => {
    expect(normalizeRank(undefined)).toBe(1);
    expect(normalizeRank(null)).toBe(1);
    expect(normalizeRank(0)).toBe(1);
    expect(normalizeRank(99)).toBe(10);
    expect(normalizeRank(5.4)).toBe(5);
    expect(normalizeRank(7)).toBe(7);
  });

  it('validates integer ranks within R1〜R10', () => {
    expect(isValidRank(1)).toBe(true);
    expect(isValidRank(10)).toBe(true);
    expect(isValidRank(0)).toBe(false);
    expect(isValidRank(11)).toBe(false);
    expect(isValidRank(5.5)).toBe(false);
    expect(isValidRank('5')).toBe(false);
  });

  it('gives a valid hex color for every rank', () => {
    for (let r = MIN_RANK; r <= MAX_RANK; r++) {
      expect(rarityColorHex(r)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('number color matches the hex', () => {
    expect(rarityColor(5)).toBe(parseInt(rarityColorHex(5).slice(1), 16));
  });

  it('maps ranks to the canonical bands/colors', () => {
    expect(rarityBand(1)).toBe('コモン');
    expect(rarityBand(7)).toBe('エピック');
    expect(rarityBand(9)).toBe('ミシック');
    expect(rarityBand(10)).toBe('ディヴァイン');
    expect(rarityColorName(10)).toBe('虹');
  });

  it('rarityRank returns the numeric rank for comparison', () => {
    expect(rarityRank(1)).toBe(1);
    expect(rarityRank(10)).toBe(10);
    expect(rarityRank(5)).toBeGreaterThan(rarityRank(3));
  });

  it('labels combine rank number and band name', () => {
    expect(rarityLabel(7)).toBe('R7 エピック');
  });
});
