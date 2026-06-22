/**
 * Paper-doll draw groups (player only). Order is the *base* (facing down)
 * order; per-direction reordering is applied by the PaperDollAnimator so that
 * weapons / hands / back items flip front<->back correctly.
 *
 * Lower index = drawn first (further back).
 */
export const DRAW_GROUPS = [
  'shadow',
  'behind_body',
  'base_body',
  'feet',
  'waist',
  'torso',
  'far_hand',
  'far_weapon',
  'back',
  'head',
  'near_hand',
  'near_weapon',
  'front_accessory',
  'front_effect',
] as const;

export type DrawGroup = (typeof DRAW_GROUPS)[number];

/** Facing directions. `right` is the mirror of `left` unless a layer opts out. */
export type Direction = 'down' | 'up' | 'left' | 'right';
export const DIRECTIONS: readonly Direction[] = ['down', 'up', 'left', 'right'];

/**
 * Per-direction draw order. Only the relative order of weapon/hand/back groups
 * changes; body/head groups keep their base order. Index into DRAW_GROUPS.
 */
export type DrawOrder = readonly DrawGroup[];

export const DRAW_ORDER_BY_DIRECTION: Record<Direction, DrawOrder> = {
  // Facing down: weapon held in front, near side toward camera.
  down: DRAW_GROUPS,
  // Facing up: weapon & near hand go BEHIND the body/head.
  up: [
    'shadow',
    'behind_body',
    'far_weapon',
    'near_weapon',
    'back',
    'far_hand',
    'near_hand',
    'base_body',
    'feet',
    'waist',
    'torso',
    'head',
    'front_accessory',
    'front_effect',
  ],
  // Facing left/right keep base order (mirror handled separately).
  left: DRAW_GROUPS,
  right: DRAW_GROUPS,
};
