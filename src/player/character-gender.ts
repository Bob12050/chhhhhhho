export const CHARACTER_GENDERS = ['female', 'male'] as const;

export type CharacterGender = (typeof CHARACTER_GENDERS)[number];

export function normalizeCharacterGender(value: unknown): CharacterGender {
  return value === 'male' ? 'male' : 'female';
}
