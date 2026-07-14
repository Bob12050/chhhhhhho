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

/**
 * Eight-way facing directions. Right-hand directions mirror their left-hand
 * counterpart when a visual sheet does not ship dedicated right-facing art.
 */
export type Direction =
  | 'down'
  | 'down-left'
  | 'left'
  | 'up-left'
  | 'up'
  | 'up-right'
  | 'right'
  | 'down-right';

export const DIRECTIONS: readonly Direction[] = [
  'down',
  'down-left',
  'left',
  'up-left',
  'up',
  'up-right',
  'right',
  'down-right',
];

/**
 * Per-direction draw order. Only the relative order of weapon/hand/back groups
 * changes; body/head groups keep their base order. Index into DRAW_GROUPS.
 */
export type DrawOrder = readonly DrawGroup[];

const UP_DRAW_ORDER: DrawOrder = [
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
];

export const DRAW_ORDER_BY_DIRECTION: Record<Direction, DrawOrder> = {
  // Facing down: weapon held in front, near side toward camera.
  down: DRAW_GROUPS,
  // Facing up: weapon & near hand go BEHIND the body/head.
  up: UP_DRAW_ORDER,
  'up-left': UP_DRAW_ORDER,
  'up-right': UP_DRAW_ORDER,
  // Facing left/right keep base order (mirror handled separately).
  left: DRAW_GROUPS,
  right: DRAW_GROUPS,
  'down-left': DRAW_GROUPS,
  'down-right': DRAW_GROUPS,
};
