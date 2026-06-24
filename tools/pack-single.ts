/**
 * Pack a single sprite into one character frame (96x96, foot-anchored at
 * 48,84; dims from resolution). For static single-image assets like the NPC.
 * Auto-crops the opaque
 * bbox and bottom-centers it; if taller/wider than the frame it is scaled down
 * (nearest) to fit.
 *
 * Run: tsx tools/pack-single.ts <out.png> <frame.png>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { decodePng, Raster } from './png';
import { CHAR_FRAME_W, CHAR_FRAME_H, CHAR_ANCHOR_X, CHAR_ANCHOR_Y } from '../src/config/resolution';

const [, , outPath, framePath] = process.argv;
if (!outPath || !framePath) {
  console.error('usage: tsx tools/pack-single.ts <out.png> <frame.png>');
  process.exit(1);
}

const { width, height, px } = decodePng(readFileSync(framePath));
let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++)
    if (px[(y * width + x) * 4 + 3] > 8) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
let cw = maxX - minX + 1;
let ch = maxY - minY + 1;

// Crop to opaque bbox.
let crop = new Uint8Array(cw * ch * 4);
for (let y = 0; y < ch; y++)
  for (let x = 0; x < cw; x++) {
    const s = ((minY + y) * width + (minX + x)) * 4;
    const d = (y * cw + x) * 4;
    crop[d] = px[s];
    crop[d + 1] = px[s + 1];
    crop[d + 2] = px[s + 2];
    crop[d + 3] = px[s + 3];
  }

// Scale down to fit the frame if needed (nearest, keep aspect).
const maxW = CHAR_FRAME_W;
const maxH = CHAR_FRAME_H - 4; // leave a little headroom
const scale = Math.min(1, maxW / cw, maxH / ch);
if (scale < 1) {
  const nw = Math.max(1, Math.round(cw * scale));
  const nh = Math.max(1, Math.round(ch * scale));
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(ch - 1, Math.floor((y * ch) / nh));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(cw - 1, Math.floor((x * cw) / nw));
      const s = (sy * cw + sx) * 4;
      const d = (y * nw + x) * 4;
      out[d] = crop[s];
      out[d + 1] = crop[s + 1];
      out[d + 2] = crop[s + 2];
      out[d + 3] = crop[s + 3];
    }
  }
  crop = out;
  cw = nw;
  ch = nh;
}

const sheet = new Raster(CHAR_FRAME_W, CHAR_FRAME_H);
const x0 = Math.round(CHAR_ANCHOR_X - cw / 2);
const y0 = Math.round(CHAR_ANCHOR_Y - ch);
for (let y = 0; y < ch; y++)
  for (let x = 0; x < cw; x++) {
    const a = crop[(y * cw + x) * 4 + 3];
    if (a === 0) continue;
    sheet.set(x0 + x, y0 + y, crop[(y * cw + x) * 4], crop[(y * cw + x) * 4 + 1], crop[(y * cw + x) * 4 + 2], a);
  }

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, sheet.encode());
console.log(`wrote ${outPath}  ${CHAR_FRAME_W}x${CHAR_FRAME_H} (sprite ${cw}x${ch}, foot-anchored)`);
