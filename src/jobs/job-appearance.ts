import { TEX } from '@/assets/gen/textures';
import type { JobAppearanceId } from './job-appearance-ids';
import type { CharacterGender } from '@/player/character-gender';

/**
 * Maps a class-regalia appearance id to its full-body spritesheet texture key.
 * Engine-side (imports TEX); validate-data uses the pure id list instead.
 */
export const APPEARANCE_TEX: Record<JobAppearanceId, string> = {
  fighter: TEX.jobFighter,
  mage: TEX.jobMage,
  priest: TEX.jobPriest,
  thief: TEX.jobThief,
  pet_raiser: TEX.jobPetRaiser,
  samurai: TEX.jobSamurai,
  sorcerer: TEX.jobSorcerer,
  holy_knight: TEX.jobHolyKnight,
  ninja: TEX.jobNinja,
  ranger: TEX.jobRanger,
  sword_kaiser: TEX.jobSwordKaiser,
  grand_magia: TEX.jobGrandMagia,
  shield_saber: TEX.jobShieldSaber,
  avengista: TEX.jobAvengista,
  dual_star: TEX.jobDualStar,
  aramikagura: TEX.jobAramikagura,
  alvride: TEX.jobAlvride,
  nirvadio: TEX.jobNirvadio,
  noxtia: TEX.jobNoxtia,
  oltarie: TEX.jobOltarie,
};

/** Optional 8-way idle/walk/attack art; absent jobs use cardinal side poses. */
export const APPEARANCE_DIAGONAL_TEX: Partial<Record<JobAppearanceId, string>> = {
  fighter: TEX.jobFighterDiagonal,
  mage: TEX.jobMageDiagonal,
  priest: TEX.jobPriestDiagonal,
  thief: TEX.jobThiefDiagonal,
  pet_raiser: TEX.jobPetRaiserDiagonal,
  samurai: TEX.jobSamuraiDiagonal,
  sorcerer: TEX.jobSorcererDiagonal,
  holy_knight: TEX.jobHolyKnightDiagonal,
  ninja: TEX.jobNinjaDiagonal,
  ranger: TEX.jobRangerDiagonal,
  sword_kaiser: TEX.jobSwordKaiserDiagonal,
  grand_magia: TEX.jobGrandMagiaDiagonal,
  shield_saber: TEX.jobShieldSaberDiagonal,
  avengista: TEX.jobAvengistaDiagonal,
  dual_star: TEX.jobDualStarDiagonal,
  aramikagura: TEX.jobAramikaguraDiagonal,
  alvride: TEX.jobAlvrideDiagonal,
  nirvadio: TEX.jobNirvadioDiagonal,
  noxtia: TEX.jobNoxtiaDiagonal,
  oltarie: TEX.jobOltarieDiagonal,
};

export const MALE_APPEARANCE_TEX: Record<JobAppearanceId, string> = {
  fighter: TEX.jobFighterMale,
  mage: TEX.jobMageMale,
  priest: TEX.jobPriestMale,
  thief: TEX.jobThiefMale,
  pet_raiser: TEX.jobPetRaiserMale,
  samurai: TEX.jobSamuraiMale,
  sorcerer: TEX.jobSorcererMale,
  holy_knight: TEX.jobHolyKnightMale,
  ninja: TEX.jobNinjaMale,
  ranger: TEX.jobRangerMale,
  sword_kaiser: TEX.jobSwordKaiserMale,
  grand_magia: TEX.jobGrandMagiaMale,
  shield_saber: TEX.jobShieldSaberMale,
  avengista: TEX.jobAvengistaMale,
  dual_star: TEX.jobDualStarMale,
  aramikagura: TEX.jobAramikaguraMale,
  alvride: TEX.jobAlvrideMale,
  nirvadio: TEX.jobNirvadioMale,
  noxtia: TEX.jobNoxtiaMale,
  oltarie: TEX.jobOltarieMale,
};

export const MALE_APPEARANCE_DIAGONAL_TEX: Record<JobAppearanceId, string> = {
  fighter: TEX.jobFighterMaleDiagonal,
  mage: TEX.jobMageMaleDiagonal,
  priest: TEX.jobPriestMaleDiagonal,
  thief: TEX.jobThiefMaleDiagonal,
  pet_raiser: TEX.jobPetRaiserMaleDiagonal,
  samurai: TEX.jobSamuraiMaleDiagonal,
  sorcerer: TEX.jobSorcererMaleDiagonal,
  holy_knight: TEX.jobHolyKnightMaleDiagonal,
  ninja: TEX.jobNinjaMaleDiagonal,
  ranger: TEX.jobRangerMaleDiagonal,
  sword_kaiser: TEX.jobSwordKaiserMaleDiagonal,
  grand_magia: TEX.jobGrandMagiaMaleDiagonal,
  shield_saber: TEX.jobShieldSaberMaleDiagonal,
  avengista: TEX.jobAvengistaMaleDiagonal,
  dual_star: TEX.jobDualStarMaleDiagonal,
  aramikagura: TEX.jobAramikaguraMaleDiagonal,
  alvride: TEX.jobAlvrideMaleDiagonal,
  nirvadio: TEX.jobNirvadioMaleDiagonal,
  noxtia: TEX.jobNoxtiaMaleDiagonal,
  oltarie: TEX.jobOltarieMaleDiagonal,
};

/**
 * HD sheets keep the pose grid but use 192px cells. Render them at half scale
 * so feet anchors, collision, labels, and authored world proportions stay
 * identical to the 96px production sheets.
 */
export const HD_APPEARANCE_TEXTURE_KEYS: readonly string[] = Object.freeze([
  TEX.playerBody,
  TEX.playerBodyDiagonal,
  TEX.playerBodyMale,
  TEX.playerBodyMaleDiagonal,
  ...Object.values(APPEARANCE_TEX),
  ...Object.values(APPEARANCE_DIAGONAL_TEX).filter((key): key is string => Boolean(key)),
  ...Object.values(MALE_APPEARANCE_TEX),
  ...Object.values(MALE_APPEARANCE_DIAGONAL_TEX),
]);

const HD_APPEARANCE_TEXTURE_SET = new Set(HD_APPEARANCE_TEXTURE_KEYS);

/** Texture key for an appearance id, or null if unknown/unset. */
export function appearanceTexKey(
  id: string | undefined,
  gender: CharacterGender = 'female',
): string | null {
  if (!id) return null;
  const textures = gender === 'male' ? MALE_APPEARANCE_TEX : APPEARANCE_TEX;
  return (textures as Record<string, string>)[id] ?? null;
}

export function appearanceDiagonalTexKey(
  id: string | undefined,
  gender: CharacterGender = 'female',
): string | null {
  if (!id) return null;
  const textures = gender === 'male'
    ? MALE_APPEARANCE_DIAGONAL_TEX
    : APPEARANCE_DIAGONAL_TEX;
  return (textures as Record<string, string>)[id] ?? null;
}

export function baseAppearanceTexKey(gender: CharacterGender): string {
  return gender === 'male' ? TEX.playerBodyMale : TEX.playerBody;
}

export function baseAppearanceDiagonalTexKey(gender: CharacterGender): string {
  return gender === 'male' ? TEX.playerBodyMaleDiagonal : TEX.playerBodyDiagonal;
}

export function appearanceSafeDiagonalWalkMode(
  _id: string | undefined,
  _gender: CharacterGender,
): null {
  // Every current HD atlas has authored walk cells for all eight directions.
  return null;
}

/** Logical display scale for an appearance texture (1 for regular sheets). */
export function appearanceTextureScale(textureKey: string | null | undefined): number {
  if (!textureKey) return 1;
  return HD_APPEARANCE_TEXTURE_SET.has(textureKey) ? 0.5 : 1;
}
