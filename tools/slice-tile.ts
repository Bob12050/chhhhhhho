/**
 * One-off: slice the PixelLab tileset sheet into 32x32 cells, score each for
 * "plain grass" (greenest + most uniform), and write candidate PNGs to the
 * scratchpad so we can pick one for public/assets/tiles/grass.png.
 *
 * Run: tsx tools/slice-tile.ts <sheet.png> <outDir>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng, Raster } from './png';

const [, , sheetPath, outDir] = process.argv;
if (!sheetPath || !outDir) {
  console.error('usage: tsx tools/slice-tile.ts <sheet.png> <outDir>');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const { width, height, px } = decodePng(readFileSync(sheetPath));
const CELL = 32;
// 131 = 4*32 + 3 separators -> stride 33. Detect generically.
const cols = Math.round((width + 1) / (CELL + 1));
const rows = Math.round((height + 1) / (CELL + 1));
const stride = (width - cols * CELL) / Math.max(1, cols - 1) + CELL; // ~33
console.log(`sheet ${width}x${height} -> ${cols}x${rows} cells, stride ~${stride}`);

interface Cand {
  idx: number;
  cx: number;
  cy: number;
  green: number;
  variance: number;
  raster: Raster;
}
const cands: Cand[] = [];

for (let cy = 0; cy < rows; cy++) {
  for (let cx = 0; cx < cols; cx++) {
    const ox = Math.round(cx * stride);
    const oy = Math.round(cy * stride);
    if (ox + CELL > width || oy + CELL > height) continue;
    const r = new Raster(CELL, CELL);
    let greenPx = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    const gs: number[] = [];
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const i = ((oy + y) * width + (ox + x)) * 4;
        const R = px[i];
        const G = px[i + 1];
        const B = px[i + 2];
        const A = px[i + 3];
        r.set(x, y, R, G, B, A);
        // "greenish": green dominant over red & blue.
        if (G > R + 6 && G > B + 6) greenPx++;
        sumR += R;
        sumG += G;
        sumB += B;
        gs.push(G);
      }
    }
    const n = CELL * CELL;
    const meanG = sumG / n;
    let varr = 0;
    for (const g of gs) varr += (g - meanG) * (g - meanG);
    varr /= n;
    void sumR;
    void sumB;
    cands.push({ idx: cy * cols + cx, cx, cy, green: greenPx / n, variance: varr, raster: r });
  }
}

// Plain grass = high green ratio, then low variance (uniform).
cands.sort((a, b) => b.green - a.green || a.variance - b.variance);
for (const c of cands) {
  const name = `cell_${c.cy}_${c.cx}_g${Math.round(c.green * 100)}_v${Math.round(c.variance)}.png`;
  writeFileSync(join(outDir, name), c.raster.encode());
}
const best = cands[0];
writeFileSync(join(outDir, 'BEST.png'), best.raster.encode());
console.log(
  `wrote ${cands.length} cells. BEST = cell(${best.cy},${best.cx}) green=${Math.round(
    best.green * 100,
  )}% var=${Math.round(best.variance)}`,
);
