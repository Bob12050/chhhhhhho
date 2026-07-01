import Phaser from 'phaser';
import { TEX } from '@/assets/gen/textures';
import { gameState } from '@/player/game-state';
import { Rng } from '@/core/rng';
import type { MapDef, GroundKind, BorderKind, BuildingDef } from '@/maps/map-def';
import { FONT } from '@/ui/theme';

const GROUND_TEX: Record<GroundKind, string> = {
  grass: TEX.tileGrass,
  stone: TEX.tileStone,
  floor: TEX.tileFloor,
};

const BORDER_TEX: Record<Exclude<BorderKind, 'none'>, string> = {
  trees: TEX.obstacle,
  walls: TEX.wall,
};

export interface BuiltPortal {
  rect: Phaser.Geom.Rectangle;
  to: string;
  toSpawn: string;
  requiresFlag?: string;
}

export interface BuiltMap {
  obstacles: Phaser.Physics.Arcade.StaticGroup;
  portals: BuiltPortal[];
}

/**
 * Build the visuals + static collision for a map into the given scene. Returns
 * the obstacle group (for colliders) and resolved portals (for transitions).
 * Enemies/NPCs are spawned by the scene, which owns combat/interaction wiring.
 */
export function buildMap(scene: Phaser.Scene, map: MapDef): BuiltMap {
  const { w, h } = map.size;

  scene.add.tileSprite(0, 0, w, h, GROUND_TEX[map.ground]).setOrigin(0).setDepth(-1000);

  if (map.path) {
    if (map.path.axis === 'v') {
      scene.add
        .tileSprite(w / 2 - map.path.thickness / 2, 0, map.path.thickness, h, TEX.tilePath)
        .setOrigin(0)
        .setDepth(-999);
    } else {
      scene.add
        .tileSprite(0, h / 2 - map.path.thickness / 2, w, map.path.thickness, TEX.tilePath)
        .setOrigin(0)
        .setDepth(-999);
    }
    drawPathEdges(scene, map, w, h);
  }
  scatterDecor(scene, map, w, h);

  // Portal rects (resolved up front so the border can leave openings for them).
  const portals: BuiltPortal[] = (map.portals ?? []).map((p) => ({
    rect: new Phaser.Geom.Rectangle(p.rect[0], p.rect[1], p.rect[2], p.rect[3]),
    to: p.to,
    toSpawn: p.toSpawn,
    requiresFlag: p.requiresFlag,
  }));
  // A 32px gate cell is "blocked" by a portal if its center sits within the
  // portal rect padded by half a tile, so doorways are always walkable.
  const onPortal = (x: number, y: number): boolean =>
    portals.some((p) =>
      Phaser.Geom.Rectangle.Contains(
        new Phaser.Geom.Rectangle(p.rect.x - 16, p.rect.y - 16, p.rect.width + 32, p.rect.height + 32),
        x,
        y,
      ),
    );

  const obstacles = scene.physics.add.staticGroup();
  // Deterministic per-position hash so tree variants/jitter are stable across
  // visits (no Math.random: re-entering a map must look identical).
  const hash2 = (x: number, y: number): number => {
    let n = (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663)) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 0x5bd1e995) >>> 0;
    return n;
  };
  const TREE_VARIANTS = [TEX.obstacle, TEX.obstacle, TEX.obstacleBush, TEX.obstaclePine];
  const TREE_TINTS = [0xffffff, 0xf0f6ea, 0xe2ecd8, 0xd8e6d0];
  const place = (x: number, y: number, tex: string): void => {
    if (onPortal(x, y)) return;
    let px = x;
    let py = y;
    let t = tex;
    // Trees: mix variants, jitter a few px off the grid, and vary the shade so
    // rows stop reading as a single repeated stamp. Collision stays safe: ±3px
    // on 32px spacing leaves gaps far narrower than the player body. Walls
    // stay perfectly aligned (they should read as built structure).
    if (tex === TEX.obstacle) {
      const n = hash2(x, y);
      t = TREE_VARIANTS[n % TREE_VARIANTS.length];
      px += ((n >> 4) % 7) - 3;
      py += ((n >> 8) % 7) - 3;
    }
    const o = obstacles.create(px, py, t) as Phaser.Physics.Arcade.Image;
    if (tex === TEX.obstacle) o.setTint(TREE_TINTS[(hash2(x, y) >> 12) % TREE_TINTS.length]);
    o.setDepth(Math.round(py));
    o.refreshBody();
  };

  // Border. Leave the central path opening (vertical path) and any portal
  // doorway clear so they are reachable.
  if (map.border !== 'none') {
    const tex = BORDER_TEX[map.border];
    const opening = map.path && map.path.axis === 'v' ? map.path.thickness : 0;
    const ox = w / 2 - opening / 2;
    for (let y = 16; y < h; y += 32) {
      place(16, y, tex);
      place(w - 16, y, tex);
    }
    for (let x = 16; x < w; x += 32) {
      if (opening > 0 && x > ox && x < ox + opening) continue;
      place(x, 16, tex);
      place(x, h - 16, tex);
    }
  }

  for (const [x, y] of map.obstacles ?? []) {
    place(x, y, map.border === 'walls' ? TEX.wall : TEX.obstacle);
  }

  for (const b of map.buildings ?? []) drawBuilding(scene, obstacles, b);

  // Portal gate markers: pulsing gate + a direction arrow + label, so they
  // read clearly as "walk here to travel".
  for (const p of map.portals ?? []) {
    const [px, py, pw, ph] = p.rect;
    const cx = px + pw / 2;
    const cy = py + ph / 2;
    const locked = !!p.requiresFlag && !gameState.flags[p.requiresFlag];
    const gateColor = locked ? 0xcc5a5a : 0x6fd0ff;
    const gate = scene.add
      .rectangle(cx, cy, pw, ph, gateColor, 0.45)
      .setStrokeStyle(2, locked ? 0xffb0b0 : 0xbfeaff, 0.9)
      .setDepth(5);
    scene.tweens.add({
      targets: gate,
      alpha: 0.85,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    // Arrow points off the nearer edge (top exit -> up, bottom exit -> down).
    const exitUp = cy < h / 2;
    const arrow = scene.add
      .text(cx, exitUp ? cy + ph : cy - ph, exitUp ? '▲' : '▼', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#bfeaff',
      })
      .setOrigin(0.5)
      .setDepth(6);
    scene.tweens.add({
      targets: arrow,
      y: arrow.y + (exitUp ? -6 : 6),
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    if (p.label) {
      const label = scene.add
        .text(cx, exitUp ? cy + ph + 16 : cy - ph - 16, locked ? `🔒 ${p.label}` : p.label, {
          fontFamily: FONT,
          fontSize: '10px',
          color: locked ? '#ffd0d0' : '#eaf7ff',
          backgroundColor: '#00000055',
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(6);
      // Edge portals: keep the label fully inside the map so the camera
      // (clamped to map bounds) can never crop it.
      label.setX(Phaser.Math.Clamp(label.x, label.width / 2 + 2, w - label.width / 2 - 2));
      label.setY(Phaser.Math.Clamp(label.y, label.height / 2 + 2, h - label.height / 2 - 2));
    }
  }

  return { obstacles, portals };
}

/** Wall/roof/door palette per building style. */
const BUILDING_STYLES: Record<
  BuildingDef['style'],
  { wall: number; wallLight: number; roof: number; ridge: number; trim: number }
> = {
  wood: { wall: 0x7a5a3a, wallLight: 0x8a6a48, roof: 0x4a3626, ridge: 0x5c452f, trim: 0x2e2318 },
  stone: { wall: 0x8a8a94, wallLight: 0x9a9aa4, roof: 0x4a4e5c, ridge: 0x5a5f70, trim: 0x2b2b33 },
  plaster: { wall: 0xcfc0a0, wallLight: 0xdccfae, roof: 0x8a4a3a, ridge: 0xa05a45, trim: 0x4a3a2a },
};

/**
 * Draw a simple pixel house (roof / wall / door / windows) and register a
 * collision body over the wall portion. Depth = base line so the player
 * y-sorts in front of / behind it like any other world object.
 */
function drawBuilding(
  scene: Phaser.Scene,
  obstacles: Phaser.Physics.Arcade.StaticGroup,
  b: BuildingDef,
): void {
  const s = BUILDING_STYLES[b.style] ?? BUILDING_STYLES.wood;
  const roofH = Math.round(b.h * 0.4);
  const g = scene.add.graphics().setDepth(b.y + b.h);

  // Wall + subtle bottom shadow + side trim.
  g.fillStyle(s.wall, 1);
  g.fillRect(b.x, b.y + roofH, b.w, b.h - roofH);
  g.fillStyle(s.wallLight, 1);
  g.fillRect(b.x + 2, b.y + roofH + 2, b.w - 4, 6);
  g.fillStyle(s.trim, 1);
  g.fillRect(b.x, b.y + roofH, 2, b.h - roofH);
  g.fillRect(b.x + b.w - 2, b.y + roofH, 2, b.h - roofH);
  g.fillRect(b.x, b.y + b.h - 3, b.w, 3);

  // Roof: overhanging slab + ridge highlight + eave shadow.
  g.fillStyle(s.roof, 1);
  g.fillRect(b.x - 4, b.y, b.w + 8, roofH);
  g.fillStyle(s.ridge, 1);
  g.fillRect(b.x - 4, b.y, b.w + 8, 4);
  g.fillStyle(s.trim, 1);
  g.fillRect(b.x - 4, b.y + roofH - 2, b.w + 8, 2);

  // Door (centered) + two lit windows.
  const doorW = 16;
  const doorH = Math.min(24, b.h - roofH - 6);
  g.fillStyle(s.trim, 1);
  g.fillRect(b.x + b.w / 2 - doorW / 2 - 1, b.y + b.h - doorH - 1, doorW + 2, doorH + 1);
  g.fillStyle(0x3a2a1c, 1);
  g.fillRect(b.x + b.w / 2 - doorW / 2, b.y + b.h - doorH, doorW, doorH);
  const winY = b.y + roofH + 10;
  for (const wx of [b.x + 10, b.x + b.w - 22]) {
    g.fillStyle(s.trim, 1);
    g.fillRect(wx - 1, winY - 1, 14, 14);
    g.fillStyle(0xffd86b, 1);
    g.fillRect(wx, winY, 12, 12);
    g.fillStyle(s.trim, 1);
    g.fillRect(wx + 5, winY, 2, 12);
  }

  // Collision over the wall (roof top stays walk-behind-able for depth feel).
  const solidY = b.y + roofH - 6;
  const solidH = b.h - roofH + 6;
  const body = scene.add
    .rectangle(b.x + b.w / 2, solidY + solidH / 2, b.w, solidH)
    .setVisible(false);
  scene.physics.add.existing(body, true);
  obstacles.add(body);
}

/**
 * Scatter small non-colliding decorations (tufts/flowers/pebbles/cracks) with
 * a per-map seeded RNG, skipping the path strip and portal rects. Breaks the
 * "one endless tile" look for roughly zero cost (static images).
 */
function scatterDecor(scene: Phaser.Scene, map: MapDef, w: number, h: number): void {
  const POOL: Record<GroundKind, string[]> = {
    grass: [TEX.decorTuft, TEX.decorTuft, TEX.decorTuft, TEX.decorFlowerA, TEX.decorFlowerB, TEX.decorPebble],
    stone: [TEX.decorPebble, TEX.decorPebble, TEX.decorCrack],
    floor: [TEX.decorCrack],
  };
  const pool = POOL[map.ground];
  let seed = 0;
  for (const ch of map.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rng = new Rng(seed || 1);
  const count = Math.round((w * h) / 10000);
  for (let i = 0; i < count; i++) {
    const x = rng.intRange(24, w - 24);
    const y = rng.intRange(24, h - 24);
    if (map.path) {
      const onPath =
        map.path.axis === 'v'
          ? Math.abs(x - w / 2) < map.path.thickness / 2 + 8
          : Math.abs(y - h / 2) < map.path.thickness / 2 + 8;
      if (onPath) continue;
    }
    if ((map.portals ?? []).some((p) => Phaser.Geom.Rectangle.Contains(
      new Phaser.Geom.Rectangle(p.rect[0] - 16, p.rect[1] - 16, p.rect[2] + 32, p.rect[3] + 32), x, y,
    ))) continue;
    scene.add.image(x, y, pool[rng.intRange(0, pool.length - 1)]).setDepth(-997);
  }
}

/**
 * Rough up the ruler-straight path edges with small offset nubs (flat rects in
 * the path's palette) so the road reads hand-worn instead of drawn.
 */
function drawPathEdges(scene: Phaser.Scene, map: MapDef, w: number, h: number): void {
  if (!map.path) return;
  const g = scene.add.graphics().setDepth(-998);
  const colors = [0x6b5a3c, 0x5f5136];
  const half = map.path.thickness / 2;
  const hashN = (n: number): number => {
    let v = (Math.imul(n | 0, 2654435761) ^ 0x9e37) >>> 0;
    v = Math.imul(v ^ (v >>> 13), 0x5bd1e995) >>> 0;
    return v;
  };
  if (map.path.axis === 'v') {
    const cx = w / 2;
    for (let y = 8; y < h; y += 24) {
      const nL = hashN(y);
      const nR = hashN(y + 7777);
      g.fillStyle(colors[nL % 2], 1);
      g.fillRect(Math.round(cx - half - 2 - (nL % 6)), y, 6 + (nL % 6), 10);
      g.fillStyle(colors[nR % 2], 1);
      g.fillRect(Math.round(cx + half - 4), y + 12, 6 + (nR % 6), 10);
    }
  } else {
    const cy = h / 2;
    for (let x = 8; x < w; x += 24) {
      const nT = hashN(x);
      const nB = hashN(x + 7777);
      g.fillStyle(colors[nT % 2], 1);
      g.fillRect(x, Math.round(cy - half - 2 - (nT % 6)), 10, 6 + (nT % 6));
      g.fillStyle(colors[nB % 2], 1);
      g.fillRect(x + 12, Math.round(cy + half - 4), 10, 6 + (nB % 6));
    }
  }
}
