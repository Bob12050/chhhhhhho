/**
 * Canonical job-appearance ids (pure, no engine deps so validate-data can
 * import it). A job's `appearance` picks a fixed body look; equipment changes
 * stats only, never the sprite. Tier-1 jobs first; extend as art lands.
 */
export const JOB_APPEARANCE_IDS = ['fighter', 'mage', 'priest', 'thief', 'pet_raiser'] as const;
export type JobAppearanceId = (typeof JOB_APPEARANCE_IDS)[number];
