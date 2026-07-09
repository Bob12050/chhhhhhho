#!/usr/bin/env python3
"""Align AI-generated enemy art to the game's sprite contract.

Usage: python3 tools/apply-enemy-art.py <input.zip|input.png> <out_name>

Takes a PixelLab export (zip containing a PNG, or a bare PNG), trims the
transparent border, scales it to fit the 96x96 frame, and positions it so the
FEET CENTER sits at the anchor (48, 84) — the invariant every character/enemy
sprite in this game follows (CLAUDE.md). Output: public/assets/enemy/<out_name>.png

After running, wire the texture in three places (this script prints a recap):
  1. src/assets/gen/textures.ts     — add a TEX key if it's a new enemy
  2. src/assets/manifest.ts         — sheet(TEX.<key>, 'assets/enemy/<out_name>.png')
  3. src/data/defs/enemies.json     — point textureKey at it and REMOVE the
                                       tint (tint recolors real art!)
"""
import sys
import zipfile
import io
from pathlib import Path

from PIL import Image

FRAME = 96
ANCHOR_X, ANCHOR_Y = 48, 84  # feet center
MAX_W, MAX_H = 88, 88  # leave margin inside the frame


def load_png(path: Path) -> Image.Image:
    if path.suffix.lower() == '.zip':
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if n.lower().endswith('.png')]
            if not names:
                sys.exit('no PNG inside the zip')
            # Largest PNG = the artwork (zips often carry thumbnails too).
            name = max(names, key=lambda n: z.getinfo(n).file_size)
            return Image.open(io.BytesIO(z.read(name))).convert('RGBA')
    return Image.open(path).convert('RGBA')


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    out_name = sys.argv[2]
    img = load_png(src)

    bbox = img.getbbox()
    if not bbox:
        sys.exit('image is fully transparent')
    img = img.crop(bbox)

    # Fit inside the frame with nearest-neighbour (pixel-art safe).
    scale = min(MAX_W / img.width, MAX_H / img.height, 1.0)
    if scale < 1.0:
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.NEAREST)

    # Feet center: average x of opaque pixels in the bottom 8 rows.
    px = img.load()
    xs = [
        x
        for y in range(max(0, img.height - 8), img.height)
        for x in range(img.width)
        if px[x, y][3] > 32
    ]
    feet_x = round(sum(xs) / len(xs)) if xs else img.width // 2

    canvas = Image.new('RGBA', (FRAME, FRAME), (0, 0, 0, 0))
    ox = ANCHOR_X - feet_x
    oy = ANCHOR_Y - img.height  # bottom row of art sits ON the anchor line
    canvas.paste(img, (ox, oy), img)

    out = Path(__file__).resolve().parent.parent / 'public' / 'assets' / 'enemy' / f'{out_name}.png'
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)
    print(f'wrote {out} ({img.width}x{img.height} art, feet at ({ANCHOR_X},{ANCHOR_Y}))')
    print('next: add TEX key + manifest sheet entry, point enemies.json textureKey at it, drop the tint.')


if __name__ == '__main__':
    main()
