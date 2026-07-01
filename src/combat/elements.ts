/**
 * Elemental damage + status effects (pure, engine-independent so it is
 * headless-testable). Attacks carry an element; enemies have optional
 * weakness/resist that scale incoming elemental damage. Certain elements also
 * have a chance to inflict a status (burn/poison = damage-over-time,
 * freeze/paralyze = brief stun).
 */
export type Element = 'none' | 'fire' | 'ice' | 'thunder' | 'poison' | 'holy' | 'dark';

export const ELEMENTS: readonly Element[] = ['none', 'fire', 'ice', 'thunder', 'poison', 'holy', 'dark'];

export const ELEMENT_LABEL: Record<Element, string> = {
  none: '無', fire: '火', ice: '氷', thunder: '雷', poison: '毒', holy: '聖', dark: '闇',
};

/** Tint / damage-number color per element (hex numbers for Phaser). */
export const ELEMENT_COLOR: Record<Element, number> = {
  none: 0xffffff, fire: 0xff6a3a, ice: 0x7ad0ff, thunder: 0xffe14a,
  poison: 0x9fe36a, holy: 0xfff2a8, dark: 0xb07adf,
};

export function isElement(v: unknown): v is Element {
  return typeof v === 'string' && (ELEMENTS as readonly string[]).includes(v);
}

/**
 * Damage multiplier for an elemental attack against a target's weakness/resist.
 * Weakness → ×1.5, resist → ×0.5, otherwise ×1. `none` attacks are never scaled.
 */
export function elementMultiplier(
  attack: Element,
  weakness?: Element | null,
  resist?: Element | null,
): number {
  if (attack === 'none') return 1;
  if (weakness && attack === weakness) return 1.5;
  if (resist && attack === resist) return 0.5;
  return 1;
}

export type StatusType = 'burn' | 'poison' | 'freeze' | 'paralyze';
export type StatusCategory = 'dot' | 'stun';

export const STATUS_LABEL: Record<StatusType, string> = {
  burn: '火傷', poison: '毒', freeze: '凍結', paralyze: '麻痺',
};
export const STATUS_CATEGORY: Record<StatusType, StatusCategory> = {
  burn: 'dot', poison: 'dot', freeze: 'stun', paralyze: 'stun',
};
export const STATUS_COLOR: Record<StatusType, number> = {
  burn: 0xff6a3a, poison: 0x9fe36a, freeze: 0x7ad0ff, paralyze: 0xffe14a,
};

/** The status an element can inflict (null = no on-hit status). */
export function statusFromElement(el: Element): StatusType | null {
  switch (el) {
    case 'fire': return 'burn';
    case 'ice': return 'freeze';
    case 'thunder': return 'paralyze';
    case 'poison': return 'poison';
    default: return null;
  }
}

/** Base chance an elemental hit inflicts its status (0..1). */
export const STATUS_PROC_CHANCE = 0.28;
