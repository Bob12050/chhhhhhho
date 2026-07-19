import { CHAR_FRAME_W, CHAR_FRAME_H } from '@/config/resolution';
import type { Direction } from '@/config/layers';

/**
 * Single source of truth for the pose atlas layout. Every character layer
 * (body + every equipment layer + the menu preview) uses THIS layout. Frame
 * ranges must never be scattered across gameplay code.
 *
 * Sheet layout convention (per visual sheet):
 *   - One row per (direction-base, animation). Cardinal direction bases stored
 *     on the sheet are: down, up, left. Right and diagonal facings fall back to
 *     the mirrored side pose unless an optional diagonal sheet is assigned.
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

export type SheetDirection = 'down' | 'up' | 'left';

/** The direction bases physically present on every cardinal sheet. */
export const SHEET_DIRECTIONS: readonly SheetDirection[] = ['down', 'up', 'left'];

/** Optional diagonal sheets currently carry the movement-critical poses. */
export const DIAGONAL_ANIM_NAMES = ['idle', 'walk', 'attack'] as const;
export type DiagonalAnimName = (typeof DIAGONAL_ANIM_NAMES)[number];
export type DiagonalSheetDirection = 'down-left' | 'up-left';
export const DIAGONAL_SHEET_DIRECTIONS: readonly DiagonalSheetDirection[] = [
  'down-left',
  'up-left',
];

/** Max columns on the sheet (widest animation). */
export const MAX_FRAMES = Math.max(...ANIM_NAMES.map((n) => ANIMATIONS[n].frames));

/** Number of rows = directions * animations. */
export const SHEET_ROWS = SHEET_DIRECTIONS.length * ANIM_NAMES.length;

export const SHEET_WIDTH = MAX_FRAMES * CHAR_FRAME_W;
export const SHEET_HEIGHT = SHEET_ROWS * CHAR_FRAME_H;
export const DIAGONAL_SHEET_WIDTH = MAX_FRAMES * CHAR_FRAME_W;
export const DIAGONAL_SHEET_HEIGHT =
  DIAGONAL_SHEET_DIRECTIONS.length * DIAGONAL_ANIM_NAMES.length * CHAR_FRAME_H;

/** Resolve a facing to the closest pose present on the cardinal sheet. */
export function sheetDirection(dir: Direction): SheetDirection {
  if (dir === 'down' || dir === 'up' || dir === 'left') return dir;
  return 'left';
}

/** Whether the sprite should be horizontally flipped for this direction. */
export function shouldFlipX(dir: Direction): boolean {
  return dir === 'right' || dir === 'up-right' || dir === 'down-right';
}

export function supportsDiagonalAnim(anim: AnimName): anim is DiagonalAnimName {
  return (DIAGONAL_ANIM_NAMES as readonly AnimName[]).includes(anim);
}

export function diagonalSheetDirection(dir: Direction): DiagonalSheetDirection {
  return dir === 'up-left' || dir === 'up-right' ? 'up-left' : 'down-left';
}

/** Frame index into the optional 4-column diagonal pose sheet. */
export function diagonalFrameIndex(
  dir: Direction,
  anim: DiagonalAnimName,
  frame: number,
  opts?: { walkUsesIdle?: boolean },
): number {
  const dirIdx = DIAGONAL_SHEET_DIRECTIONS.indexOf(diagonalSheetDirection(dir));
  const resolvedAnim = anim === 'walk' && opts?.walkUsesIdle ? 'idle' : anim;
  const resolvedFrame = resolvedAnim === 'idle'
    ? frame % ANIMATIONS.idle.frames
    : frame;
  const animIdx = DIAGONAL_ANIM_NAMES.indexOf(resolvedAnim);
  return (dirIdx * DIAGONAL_ANIM_NAMES.length + animIdx) * MAX_FRAMES + resolvedFrame;
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
