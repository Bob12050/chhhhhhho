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
};

/** Texture key for an appearance id, or null if unknown/unset. */
export function appearanceTexKey(id: string | undefined): string | null {
  if (!id) return null;
  return (APPEARANCE_TEX as Record<string, string>)[id] ?? null;
}
