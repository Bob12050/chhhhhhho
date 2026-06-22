import { CHAR_FRAME_W, CHAR_FRAME_H } from '@/config/resolution';
import type { Direction } from '@/config/layers';

/**
 * Single source of truth for the pose atlas layout. Every character layer
 * (body + every equipment layer + the menu preview) uses THIS layout. Frame
 * ranges must never be scattered across gameplay code.
 *
 * Sheet layout convention (per visual sheet):
 *   - One row per (direction-base, animation). Direction bases stored on the
 *     sheet are: down, up, left. `right` is rendered as a mirror of `left`.
 *   - Columns are animation frames, left to right.
 *
 * Row ordering on the sheet (top to bottom):
 *   down:  idle, walk, attack, cast, hurt, death
 *   up:    idle, walk, attack, cast, hurt, death
 *   left:  idle, walk, attack, cast, hurt, death
 */

export type AnimName = 'idle' | 'walk' | 'attack' | 'cast' | 'hurt' | 'death';

export interface AnimDef {
  readonly name: AnimName;
  readonly frames: number;
  /** Frames per second for playback. */
  readonly fps: number;
  /** Whether the animation loops (idle/walk) or plays once (attack/hurt/...). */
  readonly loop: boolean;
}

export const ANIMATIONS: Record<AnimName, AnimDef> = {
  idle: { name: 'idle', frames: 2, fps: 3, loop: true },
  walk: { name: 'walk', frames: 4, fps: 8, loop: true },
  attack: { name: 'attack', frames: 4, fps: 14, loop: false },
  cast: { name: 'cast', frames: 4, fps: 10, loop: false },
  hurt: { name: 'hurt', frames: 2, fps: 8, loop: false },
  death: { name: 'death', frames: 4, fps: 8, loop: false },
};

export const ANIM_NAMES: readonly AnimName[] = [
  'idle',
  'walk',
  'attack',
  'cast',
  'hurt',
  'death',
];

/** The direction bases physically present on a sheet (right is a mirror). */
export const SHEET_DIRECTIONS: readonly Exclude<Direction, 'right'>[] = ['down', 'up', 'left'];

/** Max columns on the sheet (widest animation). */
export const MAX_FRAMES = Math.max(...ANIM_NAMES.map((n) => ANIMATIONS[n].frames));

/** Number of rows = directions * animations. */
export const SHEET_ROWS = SHEET_DIRECTIONS.length * ANIM_NAMES.length;

export const SHEET_WIDTH = MAX_FRAMES * CHAR_FRAME_W;
export const SHEET_HEIGHT = SHEET_ROWS * CHAR_FRAME_H;

/** Resolve the sheet base direction (right -> left mirror). */
export function sheetDirection(dir: Direction): Exclude<Direction, 'right'> {
  return dir === 'right' ? 'left' : dir;
}

/** Whether the sprite should be horizontally flipped for this direction. */
export function shouldFlipX(dir: Direction): boolean {
  return dir === 'right';
}

/**
 * Row index (0-based) for a given (direction, animation) on the sheet.
 * Rows are grouped by direction then animation, matching the layout above.
 */
export function rowIndex(dir: Direction, anim: AnimName): number {
  const baseDir = sheetDirection(dir);
  const dirIdx = SHEET_DIRECTIONS.indexOf(baseDir);
  const animIdx = ANIM_NAMES.indexOf(anim);
  return dirIdx * ANIM_NAMES.length + animIdx;
}

/**
 * Linear frame index into a Phaser spritesheet (row-major) for a given
 * (direction, animation, frame). Phaser numbers frames left-to-right,
 * top-to-bottom with `frameWidth=CHAR_FRAME_W, frameHeight=CHAR_FRAME_H`.
 */
export function frameIndex(dir: Direction, anim: AnimName, frame: number): number {
  return rowIndex(dir, anim) * MAX_FRAMES + frame;
}
