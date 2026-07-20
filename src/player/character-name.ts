export const DEFAULT_CHARACTER_NAME = '冒険者';
export const MAX_CHARACTER_NAME_LENGTH = 12;

/** Keep player-facing names single-line, compact, and safe for canvas labels. */
export function normalizeCharacterName(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_CHARACTER_NAME;
  const cleaned = value
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const clipped = Array.from(cleaned).slice(0, MAX_CHARACTER_NAME_LENGTH).join('');
  return clipped || DEFAULT_CHARACTER_NAME;
}
