import { TEX } from '@/assets/gen/textures';
import type { JobAppearanceId } from './job-appearance-ids';

/**
 * Maps a job-appearance id to its body spritesheet texture key. The player's
 * look is decided by the active job (job-fixed appearance); equipment only
 * changes stats. Engine-side (imports TEX); validate-data uses the pure
 * `job-appearance-ids` list instead.
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
  grand_magia: TEX.jobGrandMagiaDiagonal,
};

/** Texture key for an appearance id, or null if unknown/unset. */
export function appearanceTexKey(id: string | undefined): string | null {
  if (!id) return null;
  return (APPEARANCE_TEX as Record<string, string>)[id] ?? null;
}

export function appearanceDiagonalTexKey(id: string | undefined): string | null {
  if (!id) return null;
  return (APPEARANCE_DIAGONAL_TEX as Record<string, string>)[id] ?? null;
}
