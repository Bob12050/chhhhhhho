/**
 * Pack one or more single-sprite frames into a pose-atlas sheet
 * (256x1728, 64x96 cells, 18 rows). Each frame's opaque bounding box is
 * detected, then bottom-centered on the foot anchor (32,84) of every cell, so
 * a simple creature (slime, etc.) fills all directions/animations. Multiple
 * frames cycle across columns (e.g. normal + squashed = a bounce).
 *
 * Run: tsx tools/pack-sprite.ts <out.png> <frame1.png> [frame2.png ...]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { decodePng, Raster } from './png';
import { CHAR_FRAME_W, CHAR_FRAME_H, CHAR_ANCHOR_X, CHAR_ANCHOR_Y } from '../src/config/resolution';
import { SHEET_ROWS, MAX_FRAMES, SHEET_WIDTH, SHEET_HEIGHT } from '../src/paperdoll/pose-atlas';

const [, , outPath, ...framePaths] = process.argv;
if (!outPath || framePaths.length === 0) {
  console.error('usage: tsx tools/pack-sprite.ts <out.png> <frame1.png> [frame2.png ...]');
  process.exit(1);
}

interface Cropped {
  w: number;
  h: number;
  px: Uint8Array; // RGBA, tightly cropped to opaque bbox
}

function cropOpaque(path: string): Cropped {
  const { width, height, px } = decodePng(readFileSync(path));
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    return { w: width, h: height, px }; // fully transparent? keep as-is
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = ((minY + y) * width + (minX + x)) * 4;
      const d = (y * w + x) * 4;
      out[d] = px[s];
      out[d + 1] = px[s + 1];
      out[d + 2] = px[s + 2];
      out[d + 3] = px[s + 3];
    }
  return { w, h, px: out };
}

const frames = framePaths.map(cropOpaque);
console.log(`frames: ${frames.map((f) => `${f.w}x${f.h}`).join(', ')}`);

// Warn if a frame is too big for the cell (we don't scale — pixel art).
for (const f of frames) {
  if (f.w > CHAR_FRAME_W || f.h > CHAR_FRAME_H) {
    console.warn(
      `  ⚠ frame ${f.w}x${f.h} larger than cell ${CHAR_FRAME_W}x${CHAR_FRAME_H}; it will be clipped. Re-export smaller.`,
    );
  }
}

const sheet = new Raster(SHEET_WIDTH, SHEET_HEIGHT);

function blit(f: Cropped, cellX: number, cellY: number): void {
  // bottom-centered on the foot anchor of this cell
  const cx = cellX + CHAR_ANCHOR_X;
  const bottom = cellY + CHAR_ANCHOR_Y;
  const x0 = Math.round(cx - f.w / 2);
  const y0 = Math.round(bottom - f.h);
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++) {
      const a = f.px[(y * f.w + x) * 4 + 3];
      if (a === 0) continue;
      sheet.set(x0 + x, y0 + y, f.px[(y * f.w + x) * 4], f.px[(y * f.w + x) * 4 + 1], f.px[(y * f.w + x) * 4 + 2], a);
    }
}

for (let row = 0; row < SHEET_ROWS; row++) {
  for (let col = 0; col < MAX_FRAMES; col++) {
    const f = frames[col % frames.length];
    blit(f, col * CHAR_FRAME_W, row * CHAR_FRAME_H);
  }
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, sheet.encode());
console.log(`wrote ${outPath}  ${SHEET_WIDTH}x${SHEET_HEIGHT} (${SHEET_ROWS} rows x ${MAX_FRAMES} cols)`);
