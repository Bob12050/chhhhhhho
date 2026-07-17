/**
 * Canonical full-body job-art ids (pure, no engine deps so validate-data can
 * import it). Class-regalia equipment points at these original job looks.
 */
export const JOB_APPEARANCE_IDS = [
  'fighter', 'mage', 'priest', 'thief', 'pet_raiser',
  'samurai', 'sorcerer', 'holy_knight', 'ninja', 'ranger',
  'sword_kaiser', 'grand_magia', 'shield_saber', 'avengista', 'dual_star',
  'aramikagura', 'alvride', 'nirvadio', 'noxtia', 'oltarie',
] as const;
export type JobAppearanceId = (typeof JOB_APPEARANCE_IDS)[number];
