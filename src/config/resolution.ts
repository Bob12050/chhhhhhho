/**
 * Resolution & pixel-art rules. Single source of truth — do not scatter these
 * numbers. See docs/ART_SPEC.md. Changing these affects every placeholder,
 * anchor and layer, so they are frozen for Phase 0/1.
 */

/** Logical (design) width in pixels. Fixed; the screen never expands sideways. */
export const LOGICAL_WIDTH = 360;

/** Logical height clamps. Height grows with the device aspect ratio. */
export const LOGICAL_HEIGHT_MIN = 640;
export const LOGICAL_HEIGHT_MAX = 800;
export const LOGICAL_HEIGHT_DEFAULT = 720;

/** Tile size. */
export const TILE_SIZE = 32;

/**
 * Character frame size. 96x96 square frames for chunky chibi-style sprites
 * (bigger, more detailed than the original 64x96). The drawn body sits at the
 * foot anchor; extra space above gives head-room for tall hats/helmets.
 */
export const CHAR_FRAME_W = 96;
export const CHAR_FRAME_H = 96;

/**
 * Foot anchor inside the 96x96 frame. x is centered; y sits where the feet
 * touch the ground. (48, 84): centered horizontally, feet 84px from the top
 * with 12px below for shadow/ground contact.
 */
export const CHAR_ANCHOR_X = 48;
export const CHAR_ANCHOR_Y = 84;

/** Compute the logical height for a given device aspect ratio (h/w). */
export function computeLogicalHeight(deviceWidth: number, deviceHeight: number): number {
  const ratio = deviceHeight / deviceWidth;
  const raw = Math.round(LOGICAL_WIDTH * ratio);
  return Math.max(LOGICAL_HEIGHT_MIN, Math.min(LOGICAL_HEIGHT_MAX, raw));
}

/**
 * Integer zoom factor: largest integer scale that fits the device. Any
 * remainder becomes a letterbox so pixels stay perfectly square (no blur).
 */
export function computeIntegerZoom(
  deviceWidth: number,
  deviceHeight: number,
  logicalWidth: number,
  logicalHeight: number,
): number {
  const zx = Math.floor(deviceWidth / logicalWidth);
  const zy = Math.floor(deviceHeight / logicalHeight);
  return Math.max(1, Math.min(zx, zy));
}
