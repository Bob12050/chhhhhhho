import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHARACTER_NAME,
  MAX_CHARACTER_NAME_LENGTH,
  normalizeCharacterName,
} from '@/player/character-name';

describe('character names', () => {
  it('normalizes whitespace and full-width Latin characters', () => {
    expect(normalizeCharacterName('  Ｌｅｏｎ   ブレイド  ')).toBe('Leon ブレイド');
  });

  it('falls back for blank names and removes control characters', () => {
    expect(normalizeCharacterName('   ')).toBe(DEFAULT_CHARACTER_NAME);
    expect(normalizeCharacterName('レ\u0000オン')).toBe('レオン');
  });

  it('clips by visible characters instead of UTF-16 code units', () => {
    const source = '勇者'.repeat(MAX_CHARACTER_NAME_LENGTH);
    expect(Array.from(normalizeCharacterName(source))).toHaveLength(MAX_CHARACTER_NAME_LENGTH);
  });
});
