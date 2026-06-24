/**
 * Generate guide template PNGs under `art-templates/` (mirroring the public
 * asset paths). Paint over a template and export to `public/<same path>` to
 * get correct dimensions and frame layout automatically.
 *
 * Templates show: a faint frame grid, used-cell tint (only frames an
 * animation actually uses), a color-coded foot-anchor cross per frame
 * (down=red, up=green, left=blue), and the row index (0–17). They are
 * transparent so you can paint directly on top.
 *
 * Run: npm run gen-templates
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Raster, drawNumber } from './png';
import { ASSET_SPECS } from './asset-list';
import { ANIMATIONS, ANIM_NAMES, SHEET_DIRECTIONS, MAX_FRAMES } from '../src/paperdoll/pose-atlas';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'art-templates');

const GRID: [number, number, number, number] = [255, 255, 255, 40];
const CELL: [number, number, number, number] = [255, 255, 255, 16];
const LABEL: [number, number, number, number] = [255, 255, 255, 120];
const DIR_COLOR: [number, number, number, number][] = [
  [255, 80, 80, 170], // down
  [80, 220, 120, 170], // up
  [90, 150, 255, 170], // left
];

function drawGrid(r: Raster, frameW: number, frameH: number): void {
  for (let x = 0; x <= r.w; x += frameW) r.vLine(Math.min(x, r.w - 1), 0, r.h - 1, GRID);
  for (let y = 0; y <= r.h; y += frameH) r.hLine(0, r.w - 1, Math.min(y, r.h - 1), GRID);
}

function genSheet(spec: (typeof ASSET_SPECS)[number]): Raster {
  const r = new Raster(spec.w, spec.h);
  const fw = spec.frameW!;
  const fh = spec.frameH!;
  const [ax, ay] = spec.anchor!;
  for (let dir = 0; dir < SHEET_DIRECTIONS.length; dir++) {
    for (let a = 0; a < ANIM_NAMES.length; a++) {
      const row = dir * ANIM_NAMES.length + a;
      const used = ANIMATIONS[ANIM_NAMES[a]].frames;
      const y0 = row * fh;
      for (let col = 0; col < MAX_FRAMES; col++) {
        const x0 = col * fw;
        if (col < used) {
          r.rectFill(x0 + 1, y0 + 1, fw - 2, fh - 2, CELL);
          r.cross(x0 + ax, y0 + ay, 3, DIR_COLOR[dir]);
        }
      }
      drawNumber(r, 2, y0 + 2, row, LABEL);
    }
  }
  drawGrid(r, fw, fh);
  return r;
}

function genImage(spec: (typeof ASSET_SPECS)[number]): Raster {
  const r = new Raster(spec.w, spec.h);
  r.rectFill(0, 0, spec.w, spec.h, CELL);
  // border
  r.hLine(0, spec.w - 1, 0, GRID);
  r.hLine(0, spec.w - 1, spec.h - 1, GRID);
  r.vLine(0, 0, spec.h - 1, GRID);
  r.vLine(spec.w - 1, 0, spec.h - 1, GRID);
  if (spec.anchor) r.cross(spec.anchor[0], spec.anchor[1], 3, DIR_COLOR[0]);
  else r.cross((spec.w / 2) | 0, (spec.h / 2) | 0, 2, LABEL);
  return r;
}

let count = 0;
for (const spec of ASSET_SPECS) {
  const r = spec.type === 'sheet' ? genSheet(spec) : genImage(spec);
  const out = join(outDir, spec.src);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, r.encode());
  count++;
  console.log(`  ${spec.src}  ${spec.w}x${spec.h}${spec.type === 'sheet' ? ' (sheet)' : ''}`);
}
console.log(`Generated ${count} template(s) under art-templates/.`);
