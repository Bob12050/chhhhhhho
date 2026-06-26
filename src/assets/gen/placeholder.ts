import {
  CHAR_FRAME_W,
  CHAR_FRAME_H,
  CHAR_ANCHOR_X,
  CHAR_ANCHOR_Y,
} from '@/config/resolution';
import {
  ANIMATIONS,
  ANIM_NAMES,
  SHEET_DIRECTIONS,
  SHEET_WIDTH,
  SHEET_HEIGHT,
  MAX_FRAMES,
  type AnimName,
} from '@/paperdoll/pose-atlas';
import type { Direction } from '@/config/layers';
import { PALETTES, EQUIP_RAMPS, type ActorPalette, type Ramp } from './palette';

/**
 * Procedural placeholder pixel art. Produces sprite sheets that EXACTLY match
 * the pose-atlas layout (96x96 frames, rows = direction x animation, cols =
 * frames). All drawing is integer-aligned with no anti-aliasing, so the result
 * is true pixel art. These are stand-ins; final art drops into the same slots.
 */

type PartKind =
  | 'body'
  | 'head'
  | 'torso'
  | 'weapon'
  | 'shadow'
  | 'slime'
  | 'bat'
  | 'wolf'
  | 'mushroom'
  | 'golem'
  | 'lizard'
  | 'wisp'
  | 'knight'
  | 'treant'
  | 'dragon';

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Vertical body bob for an animation frame (integer px). */
function bob(anim: AnimName, frame: number): number {
  switch (anim) {
    case 'walk':
      return frame === 1 || frame === 3 ? -1 : 0;
    case 'idle':
      return frame === 1 ? -1 : 0;
    case 'cast':
      return -1;
    default:
      return 0;
  }
}

/** Forward lunge (toward facing) for attack frames. */
function lunge(anim: AnimName, frame: number): number {
  if (anim !== 'attack') return 0;
  return [0, 2, 4, 1][frame] ?? 0;
}

/**
 * Draw one frame of the BASE BODY (chibi: big head, small body) into the cell
 * whose top-left is (ox, oy). Facing affects nothing here except limb swing;
 * left/right share the `left` sheet (right is mirrored at render time).
 */
function drawBody(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  dir: Exclude<Direction, 'right'>,
  anim: AnimName,
  frame: number,
  pal: ActorPalette,
): void {
  const by = bob(anim, frame);
  const cx = ox + CHAR_ANCHOR_X; // horizontal center
  const footY = oy + CHAR_ANCHOR_Y;

  // Legs (two stubby legs), with walk alternation.
  const legSwing = anim === 'walk' ? (frame % 2 === 0 ? 1 : -1) : 0;
  px(ctx, cx - 7, footY - 8 + by, 5, 8, pal.cloth.shadow);
  px(ctx, cx + 2, footY - 8 + by, 5, 8, pal.cloth.shadow);
  px(ctx, cx - 7, footY - 1 + by + legSwing, 5, 2, pal.cloth.outline);
  px(ctx, cx + 2, footY - 1 + by - legSwing, 5, 2, pal.cloth.outline);

  // Torso (small body).
  const torsoTop = footY - 22 + by;
  px(ctx, cx - 9, torsoTop - 1, 18, 16, pal.cloth.outline);
  px(ctx, cx - 8, torsoTop, 16, 14, pal.cloth.mid);
  px(ctx, cx - 8, torsoTop, 16, 4, pal.cloth.light);
  px(ctx, cx - 8, torsoTop + 10, 16, 4, pal.cloth.shadow);

  // Arms.
  const armSwing = anim === 'walk' ? (frame % 2 === 0 ? -1 : 1) : 0;
  const lunged = lunge(anim, frame);
  px(ctx, cx - 11, torsoTop + 2 + armSwing, 3, 9, pal.skin.shadow);
  px(ctx, cx + 8, torsoTop + 2 - armSwing + lunged, 3, 9, pal.skin.mid);

  // Head (big), with hair cap. Direction tweaks the face area.
  const headTop = torsoTop - 22;
  px(ctx, cx - 11, headTop - 1, 22, 22, pal.skin.outline);
  px(ctx, cx - 10, headTop, 20, 20, pal.skin.mid);
  px(ctx, cx - 10, headTop, 20, 6, pal.skin.light);
  px(ctx, cx - 10, headTop + 16, 20, 4, pal.skin.shadow);
  // Hair top.
  px(ctx, cx - 10, headTop, 20, 6, pal.hair.mid);
  px(ctx, cx - 10, headTop, 20, 2, pal.hair.light);
  if (dir === 'down') {
    // Eyes
    px(ctx, cx - 6, headTop + 11, 3, 3, pal.skin.outline);
    px(ctx, cx + 3, headTop + 11, 3, 3, pal.skin.outline);
  } else if (dir === 'up') {
    // Back of head: more hair, no face.
    px(ctx, cx - 10, headTop, 20, 14, pal.hair.mid);
  } else {
    // Side: one eye toward the left edge.
    px(ctx, cx - 7, headTop + 11, 3, 3, pal.skin.outline);
  }
}

/** Hat / helmet sitting on top of the head. */
function drawHead(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  _dir: Exclude<Direction, 'right'>,
  anim: AnimName,
  frame: number,
  r: Ramp,
): void {
  const by = bob(anim, frame);
  const cx = ox + CHAR_ANCHOR_X;
  const footY = oy + CHAR_ANCHOR_Y;
  const torsoTop = footY - 22 + by;
  const headTop = torsoTop - 22;
  // Cap band over hair, with a small brim and a pointed top for headroom test.
  px(ctx, cx - 11, headTop - 1, 22, 7, r.outline);
  px(ctx, cx - 10, headTop, 20, 5, r.mid);
  px(ctx, cx - 10, headTop, 20, 2, r.light);
  px(ctx, cx - 4, headTop - 9, 8, 9, r.outline);
  px(ctx, cx - 3, headTop - 8, 6, 8, r.mid);
}

/** Chest armor over the torso. */
function drawTorso(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  _dir: Exclude<Direction, 'right'>,
  anim: AnimName,
  frame: number,
  r: Ramp,
): void {
  const by = bob(anim, frame);
  const cx = ox + CHAR_ANCHOR_X;
  const footY = oy + CHAR_ANCHOR_Y;
  const torsoTop = footY - 22 + by;
  px(ctx, cx - 9, torsoTop - 1, 18, 13, r.outline);
  px(ctx, cx - 8, torsoTop, 16, 11, r.mid);
  px(ctx, cx - 8, torsoTop, 16, 3, r.light);
  px(ctx, cx - 8, torsoTop + 8, 16, 3, r.shadow);
}

/** A weapon held in the near hand, extending toward facing. */
function drawWeapon(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  _dir: Exclude<Direction, 'right'>,
  anim: AnimName,
  frame: number,
  r: Ramp,
): void {
  const by = bob(anim, frame);
  const cx = ox + CHAR_ANCHOR_X;
  const footY = oy + CHAR_ANCHOR_Y;
  const torsoTop = footY - 22 + by;
  const lunged = lunge(anim, frame);
  const handX = cx + 9 + lunged;
  const handY = torsoTop + 4;
  // Blade pointing up-forward.
  px(ctx, handX, handY - 16, 3, 18, r.outline);
  px(ctx, handX + 1, handY - 15, 1, 16, r.light);
  // Guard.
  px(ctx, handX - 2, handY, 7, 2, r.shadow);
  // Grip.
  px(ctx, handX, handY + 2, 3, 4, r.outline);
}

/** Soft shadow blob at the feet. */
function drawShadow(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const cx = ox + CHAR_ANCHOR_X;
  const footY = oy + CHAR_ANCHOR_Y;
  px(ctx, cx - 9, footY - 1, 18, 4, 'rgba(0,0,0,0.30)');
  px(ctx, cx - 7, footY + 2, 14, 2, 'rgba(0,0,0,0.30)');
}

/** Slime enemy frame (no paper doll, single sprite). */
function drawSlime(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  _dir: Exclude<Direction, 'right'>,
  anim: AnimName,
  frame: number,
  pal: ActorPalette,
): void {
  const cx = ox + CHAR_ANCHOR_X;
  const footY = oy + CHAR_ANCHOR_Y;
  const squish = anim === 'walk' || anim === 'idle' ? (frame % 2 === 0 ? 0 : -2) : 0;
  const h = 20 + squish;
  const top = footY - h;
  px(ctx, cx - 12, top - 1, 24, h + 1, pal.skin.outline);
  px(ctx, cx - 11, top, 22, h, pal.skin.mid);
  px(ctx, cx - 11, top, 22, 5, pal.skin.light);
  px(ctx, cx - 11, footY - 5, 22, 4, pal.skin.shadow);
  // Eyes
  px(ctx, cx - 6, top + 7, 3, 4, pal.skin.outline);
  px(ctx, cx + 3, top + 7, 3, 4, pal.skin.outline);
}

/* ----- Enemy archetype shapes (single-sprite, tinted at runtime) ----- */

function drawBat(c: CanvasRenderingContext2D, ox: number, oy: number, anim: AnimName, f: number, p: ActorPalette): void {
  const R = p.skin; const cx = ox + CHAR_ANCHOR_X; const fy = oy + CHAR_ANCHOR_Y;
  const flap = (anim === 'walk' || anim === 'idle' || anim === 'cast') ? (f % 2 ? 3 : 0) : 1;
  const cy = fy - 16;
  px(c, cx - 17, cy - 2 - flap, 9, 7, R.shadow); px(c, cx + 8, cy - 2 - flap, 9, 7, R.shadow);
  px(c, cx - 15, cy - 1 - flap, 6, 4, R.mid); px(c, cx + 9, cy - 1 - flap, 6, 4, R.mid);
  px(c, cx - 6, cy - 6, 12, 14, R.outline); px(c, cx - 5, cy - 5, 10, 12, R.mid); px(c, cx - 5, cy - 5, 10, 4, R.light);
  px(c, cx - 5, cy - 9, 2, 3, R.outline); px(c, cx + 3, cy - 9, 2, 3, R.outline);
  px(c, cx - 3, cy - 1, 2, 2, R.outline); px(c, cx + 1, cy - 1, 2, 2, R.outline);
}

function drawWolf(c: CanvasRenderingContext2D, ox: number, oy: number, anim: AnimName, f: number, p: ActorPalette): void {
  const R = p.skin; const cx = ox + CHAR_ANCHOR_X; const fy = oy + CHAR_ANCHOR_Y;
  const s = anim === 'walk' ? (f % 2 ? 1 : -1) : 0; const bt = fy - 16;
  px(c, cx - 12, bt, 22, 10, R.outline); px(c, cx - 11, bt + 1, 20, 8, R.mid); px(c, cx - 11, bt + 1, 20, 3, R.light);
  px(c, cx - 10, fy - 7, 3, 7, R.shadow); px(c, cx + 7, fy - 7, 3, 7, R.shadow);
  px(c, cx - 6, fy - 7 + s, 3, 7, R.shadow); px(c, cx + 3, fy - 7 - s, 3, 7, R.shadow);
  px(c, cx - 17, bt - 4, 8, 9, R.outline); px(c, cx - 16, bt - 3, 6, 7, R.mid);
  px(c, cx - 15, bt - 7, 2, 3, R.outline); px(c, cx - 11, bt - 7, 2, 3, R.outline);
  px(c, cx - 13, bt - 1, 2, 2, R.light);
  px(c, cx + 9, bt - 2, 5, 3, R.mid);
}

function drawMushroom(c: CanvasRenderingContext2D, ox: number, oy: number, anim: AnimName, f: number, p: ActorPalette): void {
  const R = p.skin; const cx = ox + CHAR_ANCHOR_X; const fy = oy + CHAR_ANCHOR_Y;
  const sq = (anim === 'idle' || anim === 'walk') ? (f % 2 ? -1 : 0) : 0; const capY = fy - 24 - sq;
  px(c, cx - 13, capY + 6, 26, 6, R.outline); px(c, cx - 11, capY + 2, 22, 6, R.mid); px(c, cx - 8, capY, 16, 4, R.light);
  px(c, cx - 13, capY + 10, 26, 2, R.shadow);
  px(c, cx - 7, capY + 3, 3, 3, R.light); px(c, cx + 4, capY + 4, 3, 3, R.light);
  px(c, cx - 5, capY + 12, 10, 11, R.outline); px(c, cx - 4, capY + 12, 8, 10, R.mid);
  px(c, cx - 4, capY + 15, 2, 3, R.outline); px(c, cx + 2, capY + 15, 2, 3, R.outline);
}

function drawGolem(c: CanvasRenderingContext2D, ox: number, oy: number, anim: AnimName, f: number, p: ActorPalette): void {
  const R = p.skin; const cx = ox + CHAR_ANCHOR_X; const fy = oy + CHAR_ANCHOR_Y; const by = bob(anim, f); const top = fy - 28 + by;
  px(c, cx - 11, top + 8, 22, 18, R.outline); px(c, cx - 10, top + 9, 20, 16, R.mid); px(c, cx - 10, top + 9, 20, 5, R.light); px(c, cx - 10, top + 20, 20, 5, R.shadow);
  px(c, cx - 8, top, 16, 10, R.outline); px(c, cx - 7, top + 1, 14, 8, R.mid);
  px(c, cx - 4, top + 4, 3, 2, R.light); px(c, cx + 2, top + 4, 3, 2, R.light);
  px(c, cx - 14, top + 10, 4, 12, R.outline); px(c, cx + 10, top + 10, 4, 12, R.outline);
  px(c, cx - 8, fy - 6, 6, 6, R.shadow); px(c, cx + 2, fy - 6, 6, 6, R.shadow);
}

function drawLizard(c: CanvasRenderingContext2D, ox: number, oy: number, anim: AnimName, f: number, p: ActorPalette): void {
  const R = p.skin; const cx = ox + CHAR_ANCHOR_X; const fy = oy + CHAR_ANCHOR_Y; const s = anim === 'walk' ? (f % 2 ? 1 : -1) : 0; const bt = fy - 12;
  px(c, cx + 8, bt + 2, 12, 4, R.shadow); px(c, cx + 16, bt + 3, 6, 2, R.mid);
  px(c, cx - 12, bt, 20, 8, R.outline); px(c, cx - 11, bt + 1, 18, 6, R.mid); px(c, cx - 11, bt + 1, 18, 2, R.light);
  px(c, cx - 17, bt, 7, 7, R.outline); px(c, cx - 16, bt + 1, 5, 5, R.mid); px(c, cx - 14, bt + 1, 2, 2, R.light);
  px(c, cx - 9, fy - 5 + s, 3, 5, R.shadow); px(c, cx + 4, fy - 5 - s, 3, 5, R.shadow);
  px(c, cx - 6, bt - 2, 2, 2, R.shadow); px(c, cx - 1, bt - 2, 2, 2, R.shadow); px(c, cx + 4, bt - 2, 2, 2, R.shadow);
}

function drawWisp(c: CanvasRenderingContext2D, ox: number, oy: number, _anim: AnimName, f: number, p: ActorPalette): void {
  const R = p.skin; const cx = ox + CHAR_ANCHOR_X; const fy = oy + CHAR_ANCHOR_Y; const hov = f % 2 ? -2 : 0; const cy = fy - 20 + hov;
  px(c, cx - 8, cy - 8, 16, 16, R.outline); px(c, cx - 7, cy - 7, 14, 14, R.mid); px(c, cx - 7, cy - 7, 14, 5, R.light);
  px(c, cx - 3, cy - 4, 5, 5, R.light);
  px(c, cx - 11, cy, 2, 2, R.light); px(c, cx + 9, cy - 3, 2, 2, R.light);
  px(c, cx - 5, fy - 4, 10, 2, R.shadow);
}

function drawKnight(c: CanvasRenderingContext2D, ox: number, oy: number, anim: AnimName, f: number, p: ActorPalette): void {
  const R = p.skin; const cx = ox + CHAR_ANCHOR_X; const fy = oy + CHAR_ANCHOR_Y; const by = bob(anim, f); const lg = lunge(anim, f);
  const torsoTop = fy - 22 + by;
  px(c, cx - 7, fy - 8, 5, 8, R.shadow); px(c, cx + 2, fy - 8, 5, 8, R.shadow);
  px(c, cx - 9, torsoTop - 1, 18, 16, R.outline); px(c, cx - 8, torsoTop, 16, 14, R.mid); px(c, cx - 8, torsoTop, 16, 4, R.light); px(c, cx - 8, torsoTop + 10, 16, 4, R.shadow);
  const headTop = torsoTop - 16;
  px(c, cx - 7, headTop, 14, 14, R.outline); px(c, cx - 6, headTop + 1, 12, 12, R.mid); px(c, cx - 6, headTop + 5, 12, 3, R.shadow);
  px(c, cx + 9 + lg, torsoTop - 12, 3, 20, R.light); px(c, cx + 8 + lg, torsoTop + 6, 5, 2, R.shadow);
}

function drawTreant(c: CanvasRenderingContext2D, ox: number, oy: number, _anim: AnimName, f: number, p: ActorPalette): void {
  const R = p.skin; const cx = ox + CHAR_ANCHOR_X; const fy = oy + CHAR_ANCHOR_Y; const sw = f % 2 ? -1 : 0; const trunkTop = fy - 22;
  px(c, cx - 7, trunkTop, 14, 22, R.outline); px(c, cx - 6, trunkTop, 12, 21, R.mid); px(c, cx - 6, trunkTop, 4, 21, R.light);
  const cy = trunkTop - 12 + sw;
  px(c, cx - 16, cy, 32, 16, R.outline); px(c, cx - 15, cy + 1, 30, 14, R.mid); px(c, cx - 15, cy + 1, 30, 5, R.light); px(c, cx - 15, cy + 11, 30, 4, R.shadow);
  px(c, cx - 4, trunkTop + 6, 3, 3, R.outline); px(c, cx + 2, trunkTop + 6, 3, 3, R.outline);
  px(c, cx - 18, cy + 8, 5, 3, R.shadow); px(c, cx + 13, cy + 8, 5, 3, R.shadow);
}

function drawDragon(c: CanvasRenderingContext2D, ox: number, oy: number, _anim: AnimName, f: number, p: ActorPalette): void {
  const R = p.skin; const cx = ox + CHAR_ANCHOR_X; const fy = oy + CHAR_ANCHOR_Y; const fl = f % 2 ? 2 : 0; const bt = fy - 22;
  px(c, cx - 22, bt - 6 - fl, 12, 14, R.shadow); px(c, cx + 10, bt - 6 - fl, 12, 14, R.shadow);
  px(c, cx - 20, bt - 4 - fl, 9, 10, R.mid); px(c, cx + 11, bt - 4 - fl, 9, 10, R.mid);
  px(c, cx - 10, bt, 20, 20, R.outline); px(c, cx - 9, bt + 1, 18, 18, R.mid); px(c, cx - 9, bt + 1, 18, 6, R.light); px(c, cx - 9, bt + 14, 18, 5, R.shadow);
  px(c, cx - 16, bt - 8, 7, 10, R.outline); px(c, cx - 15, bt - 7, 5, 8, R.mid);
  px(c, cx - 18, bt - 10, 6, 5, R.outline); px(c, cx - 17, bt - 9, 4, 3, R.mid); px(c, cx - 16, bt - 8, 2, 2, R.light);
  px(c, cx + 9, bt + 12, 12, 4, R.mid); px(c, cx + 18, bt + 13, 6, 2, R.shadow);
  px(c, cx - 7, fy - 6, 5, 6, R.shadow); px(c, cx + 2, fy - 6, 5, 6, R.shadow);
}

export interface LayerSpec {
  readonly kind: PartKind;
  readonly palette?: ActorPalette;
  readonly ramp?: Ramp;
}

/**
 * Render a full sheet (all directions x animations x frames) for one layer.
 * Returns a canvas ready to register as a Phaser texture.
 */
export function renderSheet(spec: LayerSpec): HTMLCanvasElement {
  const canvas = newCanvas(SHEET_WIDTH, SHEET_HEIGHT);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);

  let row = 0;
  for (const dir of SHEET_DIRECTIONS) {
    for (const animName of ANIM_NAMES) {
      const anim = ANIMATIONS[animName];
      for (let f = 0; f < anim.frames; f++) {
        const ox = f * CHAR_FRAME_W;
        const oy = row * CHAR_FRAME_H;
        renderPart(ctx, ox, oy, dir, animName, f, spec);
      }
      row++;
    }
  }
  return canvas;
}

function renderPart(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  dir: Exclude<Direction, 'right'>,
  anim: AnimName,
  frame: number,
  spec: LayerSpec,
): void {
  switch (spec.kind) {
    case 'shadow':
      drawShadow(ctx, ox, oy);
      break;
    case 'body':
      drawBody(ctx, ox, oy, dir, anim, frame, spec.palette ?? PALETTES.player);
      break;
    case 'head':
      drawHead(ctx, ox, oy, dir, anim, frame, spec.ramp ?? EQUIP_RAMPS.leatherCap);
      break;
    case 'torso':
      drawTorso(ctx, ox, oy, dir, anim, frame, spec.ramp ?? EQUIP_RAMPS.clothVest);
      break;
    case 'weapon':
      drawWeapon(ctx, ox, oy, dir, anim, frame, spec.ramp ?? EQUIP_RAMPS.woodSword);
      break;
    case 'slime':
      drawSlime(ctx, ox, oy, dir, anim, frame, spec.palette ?? PALETTES.slime);
      break;
    case 'bat':
      drawBat(ctx, ox, oy, anim, frame, spec.palette ?? PALETTES.mob);
      break;
    case 'wolf':
      drawWolf(ctx, ox, oy, anim, frame, spec.palette ?? PALETTES.mob);
      break;
    case 'mushroom':
      drawMushroom(ctx, ox, oy, anim, frame, spec.palette ?? PALETTES.mob);
      break;
    case 'golem':
      drawGolem(ctx, ox, oy, anim, frame, spec.palette ?? PALETTES.mob);
      break;
    case 'lizard':
      drawLizard(ctx, ox, oy, anim, frame, spec.palette ?? PALETTES.mob);
      break;
    case 'wisp':
      drawWisp(ctx, ox, oy, anim, frame, spec.palette ?? PALETTES.mob);
      break;
    case 'knight':
      drawKnight(ctx, ox, oy, anim, frame, spec.palette ?? PALETTES.mob);
      break;
    case 'treant':
      drawTreant(ctx, ox, oy, anim, frame, spec.palette ?? PALETTES.mob);
      break;
    case 'dragon':
      drawDragon(ctx, ox, oy, anim, frame, spec.palette ?? PALETTES.mob);
      break;
  }
}

/** Frame geometry for registering the sheet as a Phaser spritesheet. */
export const SHEET_FRAME_CONFIG = {
  frameWidth: CHAR_FRAME_W,
  frameHeight: CHAR_FRAME_H,
  // total frames declared so trailing (unused) cells in short rows are skipped
  // by indexing logic, not by Phaser; we rely on frameIndex() for valid cells.
} as const;

export { MAX_FRAMES };
