/**
 * Canonical job-appearance ids (pure, no engine deps so validate-data can
 * import it). A job's `appearance` picks the fixed fallback body used whenever
 * no supported paper-doll set is active. Tier-1 jobs first; extend as art lands.
 */
export const JOB_APPEARANCE_IDS = [
  'fighter', 'mage', 'priest', 'thief', 'pet_raiser',
  'samurai', 'sorcerer', 'holy_knight', 'ninja', 'ranger',
  'sword_kaiser', 'grand_magia', 'shield_saber', 'avengista', 'dual_star',
  'aramikagura', 'alvride', 'nirvadio', 'noxtia', 'oltarie',
] as const;
export type JobAppearanceId = (typeof JOB_APPEARANCE_IDS)[number];
