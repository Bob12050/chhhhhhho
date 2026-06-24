/**
 * Minimal RGBA PNG encoder/size-reader + a tiny raster helper. Node-only
 * (uses node:zlib). Used by the art tooling (template generation + asset
 * checking) — NOT shipped in the game bundle.
 */
import { deflateSync } from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** A simple RGBA raster you can draw into, then encode to PNG. */
export class Raster {
  readonly px: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Uint8Array(w * h * 4); // transparent
  }

  set(x: number, y: number, r: number, g: number, b: number, a = 255): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.px[i] = r;
    this.px[i + 1] = g;
    this.px[i + 2] = b;
    this.px[i + 3] = a;
  }

  hLine(x0: number, x1: number, y: number, c: [number, number, number, number]): void {
    for (let x = x0; x <= x1; x++) this.set(x, y, c[0], c[1], c[2], c[3]);
  }
  vLine(x: number, y0: number, y1: number, c: [number, number, number, number]): void {
    for (let y = y0; y <= y1; y++) this.set(x, y, c[0], c[1], c[2], c[3]);
  }
  rectFill(x: number, y: number, w: number, h: number, c: [number, number, number, number]): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c[0], c[1], c[2], c[3]);
  }
  cross(cx: number, cy: number, r: number, c: [number, number, number, number]): void {
    this.hLine(cx - r, cx + r, cy, c);
    this.vLine(cx, cy - r, cy + r, c);
  }

  encode(): Buffer {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type RGBA
    // 10,11,12 = compression/filter/interlace = 0
    const raw = Buffer.alloc(this.h * (this.w * 4 + 1));
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 4 + 1)] = 0; // filter: none
      this.px
        .subarray(y * this.w * 4, (y + 1) * this.w * 4)
        .forEach((v, i) => (raw[y * (this.w * 4 + 1) + 1 + i] = v));
    }
    return Buffer.concat([
      SIG,
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

/** Read the (width,height) from a PNG IHDR without decoding pixels. */
export function readPngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(SIG)) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Tiny 3x5 digit font (for row indices on templates). */
const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

export function drawNumber(
  r: Raster,
  x: number,
  y: number,
  n: number,
  c: [number, number, number, number],
): void {
  let cx = x;
  for (const ch of String(n)) {
    const glyph = DIGITS[ch];
    if (glyph) {
      for (let gy = 0; gy < 5; gy++)
        for (let gx = 0; gx < 3; gx++)
          if (glyph[gy][gx] === '1') r.set(cx + gx, y + gy, c[0], c[1], c[2], c[3]);
    }
    cx += 4;
  }
}
