import { TEX } from '@/assets/gen/textures';
import type { JobAppearanceId } from './job-appearance-ids';

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

/**
 * HD sheets keep the pose grid but use 192px cells. Render them at half scale
 * so feet anchors, collision, labels, and authored world proportions stay
 * identical to the 96px production sheets.
 */
export const HD_APPEARANCE_TEXTURE_KEYS: readonly string[] = Object.freeze([
  TEX.playerBody,
  TEX.playerBodyDiagonal,
  ...Object.values(APPEARANCE_TEX),
  ...Object.values(APPEARANCE_DIAGONAL_TEX).filter((key): key is string => Boolean(key)),
]);

const HD_APPEARANCE_TEXTURE_SET = new Set(HD_APPEARANCE_TEXTURE_KEYS);

/** Texture key for an appearance id, or null if unknown/unset. */
export function appearanceTexKey(id: string | undefined): string | null {
  if (!id) return null;
  return (APPEARANCE_TEX as Record<string, string>)[id] ?? null;
}

export function appearanceDiagonalTexKey(id: string | undefined): string | null {
  if (!id) return null;
  return (APPEARANCE_DIAGONAL_TEX as Record<string, string>)[id] ?? null;
}

/** Logical display scale for an appearance texture (1 for regular sheets). */
export function appearanceTextureScale(textureKey: string | null | undefined): number {
  if (!textureKey) return 1;
  return HD_APPEARANCE_TEXTURE_SET.has(textureKey) ? 0.5 : 1;
}
