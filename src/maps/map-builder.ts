import Phaser from 'phaser';
import { TEX } from '@/assets/gen/textures';
import { gameState } from '@/player/game-state';
import { Rng } from '@/core/rng';
import type { MapDef, GroundKind, BorderKind, BuildingDef, LandmarkKind } from '@/maps/map-def';
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

const ILLUSTRATED_MAP_TEX: Record<string, string> = {
  town: TEX.townMap,
  field: TEX.fieldMap,
  forest: TEX.forestMap,
  dungeon: TEX.dungeonMap,
  canyon: TEX.canyonMap,
  volcano: TEX.volcanoMap,
  snowfield: TEX.snowfieldMap,
  desert: TEX.desertMap,
  boss_room: TEX.arenaMap,
  arena_volcano: TEX.arenaMap,
  arena_grove: TEX.arenaMap,
  arena_marsh: TEX.arenaMap,
  arena_cavern: TEX.arenaMap,
  arena_peak: TEX.arenaMap,
  arena_night: TEX.arenaMap,
  arena_plain: TEX.arenaMap,
  arena_swamp: TEX.arenaMap,
  arena_canyon: TEX.arenaMap,
  arena_frost: TEX.arenaMap,
  arena_ruins: TEX.arenaMap,
  arena_abyss: TEX.arenaMap,
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
  const mappedTexture = ILLUSTRATED_MAP_TEX[map.id];
  const illustratedTexture = mappedTexture && scene.textures.exists(mappedTexture) ? mappedTexture : undefined;
  const illustratedMap = illustratedTexture !== undefined;

  scene.add.tileSprite(0, 0, w, h, GROUND_TEX[map.ground]).setOrigin(0).setDepth(-1000);

  // NOTE: grass2 tile scatter was removed — even per-tile random placement forms
  // adjacent 2×2+ clusters that read as dark square "debug blocks". Lawn variety
  // now comes only from the base tile's internal mottle + scattered decor
  // (tufts/flowers/pebbles), which never forms rectangles. Do NOT re-add grid
  // tile scatter for colour variation (see VISUAL_GUIDE §9).

  const pathOff = pathOffsetFn(map, w, h);
  if (map.path && !illustratedMap) {
    const t = map.path.thickness;
    const pathTex = map.ground === 'grass' ? TEX.tilePath : map.ground === 'stone' ? TEX.tileStone : TEX.tileFloor;
    if (map.path.axis === 'v') {
      // 16px strips following the meander (visual only; grass is walkable too).
      for (let y = 0; y < h; y += 16) {
        scene.add
          .tileSprite(Math.round(w / 2 + pathOff(y) - t / 2), y, t, 16, pathTex)
          .setOrigin(0)
          .setDepth(-999);
      }
    } else {
      for (let x = 0; x < w; x += 16) {
        scene.add
          .tileSprite(x, Math.round(h / 2 + pathOff(x) - t / 2), 16, t, pathTex)
          .setOrigin(0)
          .setDepth(-999);
      }
    }
    drawPathEdges(scene, map, w, h, pathOff);
  }
  if (illustratedTexture) {
    scene.add.image(0, 0, illustratedTexture).setOrigin(0).setDisplaySize(w, h).setDepth(-996);
  } else {
    scatterDecor(scene, map, w, h, pathOff);
  }

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
  const placeInvisible = (x: number, y: number, width: number, height: number): void => {
    const body = scene.add.rectangle(x + width / 2, y + height / 2, width, height).setVisible(false);
    scene.physics.add.existing(body, true);
    obstacles.add(body);
  };
  // Deterministic per-position hash so tree variants/jitter are stable across
  // visits (no Math.random: re-entering a map must look identical).
  const hash2 = (x: number, y: number): number => {
    let n = (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663)) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 0x5bd1e995) >>> 0;
    return n;
  };
  const TREE_VARIANTS = [TEX.obstacle, TEX.obstacle, TEX.obstacle, TEX.obstacleBush, TEX.obstaclePine];
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
    if (tex === TEX.obstacle) {
      // Tree art is taller than its trunk. Keep the lush crown visual separate
      // from a small foot-level collider so the forest feels dense without
      // turning every branch into an invisible wall.
      const tree = scene.add
        .image(px, py, t)
        .setOrigin(0.5, t === TEX.obstacle ? 0.92 : 0.82)
        .setTint(TREE_TINTS[(hash2(x, y) >> 12) % TREE_TINTS.length])
        .setDepth(Math.round(py));
      scene.add
        .image(px, py + 2, TEX.groundShadow)
        .setDisplaySize(t === TEX.obstacle ? 34 : 26, 10)
        .setDepth(Math.round(py) - 1);
      const trunk = obstacles
        .create(px, py + 2, TEX.groundShadow)
        .setVisible(false)
        .setDisplaySize(20, 12) as Phaser.Physics.Arcade.Image;
      trunk.refreshBody();
      tree.setFlipX((hash2(x, y) & 1) === 1);
      return;
    }
    const o = obstacles.create(px, py, t) as Phaser.Physics.Arcade.Image;
    o.setDepth(Math.round(py));
    o.refreshBody();
  };

  // Border. Leave the central path opening (vertical path) and any portal
  // doorway clear so they are reachable.
  if (map.border !== 'none' && !illustratedMap) {
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

  if (illustratedMap) {
    // Build the painted perimeter from small cells so every portal, including
    // side exits, can punch a clean opening through otherwise solid scenery.
    for (let y = 16; y < h; y += 32) {
      if (!onPortal(16, y)) placeInvisible(0, y - 16, 48, 32);
      if (!onPortal(w - 16, y)) placeInvisible(w - 48, y - 16, 48, 32);
    }
    for (let x = 16; x < w; x += 32) {
      if (!onPortal(x, 16)) placeInvisible(x - 16, 0, 32, 48);
      if (!onPortal(x, h - 16)) placeInvisible(x - 16, h - 48, 32, 48);
    }
    for (const [x, y, width, height] of map.collisionRects ?? []) {
      placeInvisible(x, y, width, height);
    }
  }

  if (!illustratedMap) {
    for (const [x, y] of map.obstacles ?? []) {
      place(x, y, map.border === 'walls' ? TEX.wall : TEX.obstacle);
    }
  }

  for (const b of map.buildings ?? []) {
    if (illustratedMap) registerBuildingCollision(scene, obstacles, b);
    else drawBuilding(scene, obstacles, b);
  }
  if (!illustratedMap) {
    for (const [wx, wy, ww, wh] of map.water ?? []) drawWater(scene, obstacles, wx, wy, ww, wh);
    for (const lm of map.landmarks ?? []) drawLandmark(scene, obstacles, lm);
  }

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

    // Interior gates can override the usual top/bottom arrow direction.
    const exitUp = p.direction ? p.direction === 'up' : cy < h / 2;
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

    // Rising sparkles sell "this is a magic gate", not a grey box.
    for (let i = 0; i < 3; i++) {
      const sp = scene.add
        .circle(Math.round(cx - pw / 3 + (i * pw) / 3), Math.round(cy + ph / 2), 2, locked ? 0xffb0b0 : 0xbfeaff, 0.9)
        .setDepth(6)
        .setAlpha(0);
      scene.tweens.add({
        targets: sp,
        y: cy - ph - 6,
        alpha: { from: 0.9, to: 0 },
        duration: 1500,
        delay: i * 500,
        repeat: -1,
        ease: 'Sine.Out',
      });
    }

    if (p.label) {
      const ly = exitUp ? cy + ph + 16 : cy - ph - 16;
      const label = scene.add
        .text(cx, ly, locked ? `🔒 ${p.label}` : p.label, {
          fontFamily: FONT,
          fontSize: '10px',
          color: locked ? '#ffd0d0' : '#eaf7ff',
        })
        .setOrigin(0.5)
        .setDepth(7);
      // Edge portals: keep the label fully inside the map so the camera
      // (clamped to map bounds) can never crop it.
      label.setX(Phaser.Math.Clamp(label.x, label.width / 2 + 6, w - label.width / 2 - 6));
      label.setY(Phaser.Math.Clamp(label.y, 10, h - 10));
      // Rounded pill behind the label (matches the menu chrome, not a hard box).
      const pillW = label.width + 16;
      const pill = scene.add.graphics().setDepth(6);
      pill.fillStyle(0x0e1220, 0.72);
      pill.fillRoundedRect(label.x - pillW / 2, label.y - 9, pillW, 18, 9);
      pill.lineStyle(1, locked ? 0xffb0b0 : 0x8fd8ff, 0.35);
      pill.strokeRoundedRect(label.x - pillW / 2, label.y - 9, pillW, 18, 9);
    }
  }

  return { obstacles, portals };
}

/** Wall/roof/door palette per building style. */
const BUILDING_STYLES: Record<
  BuildingDef['style'],
  { wall: number; wallLight: number; roof: number; ridge: number; trim: number }
> = {
  wood: { wall: 0xc99458, wallLight: 0xe1b774, roof: 0x2e8f91, ridge: 0x55b7ad, trim: 0x6f4b35 },
  stone: { wall: 0xb8c4d1, wallLight: 0xd8e0e6, roof: 0x3979b8, ridge: 0x65a6d7, trim: 0x52647a },
  plaster: { wall: 0xf4dfb8, wallLight: 0xffefcf, roof: 0xd96f61, ridge: 0xee9a78, trim: 0x8b5b48 },
};

/** Invisible facility collision used when a flattened illustrated map owns the visuals. */
function registerBuildingCollision(
  scene: Phaser.Scene,
  obstacles: Phaser.Physics.Arcade.StaticGroup,
  b: BuildingDef,
): void {
  // A flattened background cannot y-sort a character behind its painted roof,
  // so the complete building footprint must be solid.
  const body = scene.add.rectangle(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h).setVisible(false);
  scene.physics.add.existing(body, true);
  obstacles.add(body);
}

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
  // Ground contact shadow, cast down-right (light rule: sun from top-left).
  const shType = b.shadowType ?? 'soft';
  if (shType !== 'none') {
    const sw = shType === 'hard' ? b.w * 0.8 : b.w * 1.0;
    const sh = shType === 'hard' ? 13 : 18;
    scene.add
      .image(b.x + b.w / 2 + 4, b.y + b.h + 3, TEX.groundShadow)
      .setDisplaySize(Math.round(sw), sh)
      .setDepth(b.y + b.h - 1);
  }
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
  // Light rule (sun top-left): faint highlight down the left wall, shade right.
  g.fillStyle(0xffffff, 0.06);
  g.fillRect(b.x + 2, b.y + roofH, 5, b.h - roofH);
  g.fillStyle(0x000000, 0.14);
  g.fillRect(b.x + b.w - 7, b.y + roofH, 5, b.h - roofH);

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

  if (b.shop && b.shop !== 'house') drawShopFront(g, b, roofH);
  drawProps(scene, b);

  // Collision over the wall (roof top stays walk-behind-able for depth feel).
  const solidY = b.y + roofH - 6;
  const solidH = b.h - roofH + 6;
  const body = scene.add
    .rectangle(b.x + b.w / 2, solidY + solidH / 2, b.w, solidH)
    .setVisible(false);
  scene.physics.add.existing(body, true);
  obstacles.add(body);
}

/** Awning + hanging icon sign palette + icon per shop role. */
const SHOP_FRONTS: Record<
  Exclude<NonNullable<BuildingDef['shop']>, 'house'>,
  { stripe: number; cream: number; board: number; icon: NonNullable<BuildingDef['signIcon']> }
> = {
  general: { stripe: 0x55ad7a, cream: 0xffedc7, board: 0xa56e43, icon: 'potion' },
  craft: { stripe: 0xe27a68, cream: 0xffe7bd, board: 0x98613c, icon: 'hammer' },
  guild: { stripe: 0x4f8fd2, cream: 0xffefcf, board: 0x9b6a43, icon: 'shield' },
};

/**
 * Facility dressing: a striped scalloped awning under the eave + a hanging
 * wooden sign with a role icon (sword / hammer / shield). Turns identical houses
 * into a readable "shop / smithy / guild" at a glance. Drawn on the building's
 * own graphics so it y-sorts with the wall.
 */
function drawShopFront(g: Phaser.GameObjects.Graphics, b: BuildingDef, roofH: number): void {
  const f = SHOP_FRONTS[b.shop as Exclude<NonNullable<BuildingDef['shop']>, 'house'>];
  const ay = b.y + roofH; // awning top sits at the eave line
  const aw = b.w + 4;
  const ax = b.x - 2;
  // Striped awning band.
  const stripeW = 8;
  for (let i = 0; i * stripeW < aw; i++) {
    g.fillStyle(i % 2 ? f.cream : f.stripe, 1);
    g.fillRect(ax + i * stripeW, ay, Math.min(stripeW, aw - i * stripeW), 9);
  }
  // Scalloped bottom edge (little triangles) → reads as fabric.
  for (let i = 0; i * stripeW < aw; i++) {
    g.fillStyle(i % 2 ? f.cream : f.stripe, 1);
    g.fillRect(ax + i * stripeW + 1, ay + 9, stripeW - 2, 2);
  }
  g.fillStyle(0x000000, 0.18);
  g.fillRect(ax, ay + 9, aw, 1); // under-awning shadow

  // Hanging sign near the door: rope + board + icon.
  const sx = b.x + b.w / 2 + 18;
  const sy = ay + 20;
  g.fillStyle(0x6a5236, 1);
  g.fillRect(sx - 1, ay + 11, 2, 8); // rope
  g.fillStyle(0x241812, 1);
  g.fillRect(sx - 11, sy - 8, 22, 17); // board border
  g.fillStyle(f.board, 1);
  g.fillRect(sx - 9, sy - 6, 18, 13);
  drawShopIcon(g, sx, sy, b.signIcon ?? f.icon);
}

/** Tiny role icon centred at (cx,cy) on a hanging sign. */
function drawShopIcon(g: Phaser.GameObjects.Graphics, cx: number, cy: number, icon: string): void {
  if (icon === 'sword') {
    g.fillStyle(0xd8dce6, 1);
    for (let i = 0; i < 6; i++) g.fillRect(cx - 3 + i, cy + 3 - i, 2, 2); // blade
    g.fillStyle(0xf5c542, 1);
    g.fillRect(cx - 5, cy + 1, 5, 2); // guard
  } else if (icon === 'hammer') {
    g.fillStyle(0x9aa0ac, 1);
    g.fillRect(cx - 5, cy - 5, 10, 5); // head
    g.fillStyle(0x8a5a30, 1);
    g.fillRect(cx - 1, cy - 5, 2, 11); // handle
  } else if (icon === 'shield') {
    g.fillStyle(0xf5c542, 1);
    g.fillRect(cx - 5, cy - 5, 10, 6); // shield top
    g.fillRect(cx - 4, cy + 1, 8, 3);
    g.fillRect(cx - 2, cy + 4, 4, 2);
    g.fillStyle(0xffffff, 0.4);
    g.fillRect(cx - 3, cy - 4, 2, 5);
  } else if (icon === 'potion') {
    g.fillStyle(0xd8dce6, 1);
    g.fillRect(cx - 2, cy - 6, 4, 3); // neck
    g.fillRect(cx - 4, cy - 3, 8, 8); // flask
    g.fillStyle(0xe0587a, 1);
    g.fillRect(cx - 3, cy, 6, 4); // liquid
  } else if (icon === 'scroll') {
    g.fillStyle(0xe8dcb0, 1);
    g.fillRect(cx - 5, cy - 5, 10, 10);
    g.fillStyle(0x9a7038, 1);
    g.fillRect(cx - 5, cy - 5, 10, 2);
    g.fillRect(cx - 5, cy + 3, 10, 2);
    g.fillStyle(0x8a5a2a, 1);
    g.fillRect(cx - 3, cy - 1, 6, 1);
    g.fillRect(cx - 3, cy + 1, 5, 1);
  } else {
    g.fillStyle(0xf5c542, 1); // coin
    g.fillRect(cx - 4, cy - 5, 8, 10);
    g.fillRect(cx - 5, cy - 4, 10, 8);
    g.fillStyle(0xc79a2a, 1);
    g.fillRect(cx - 1, cy - 3, 2, 6);
  }
}

/** Storefront props (barrels/crates/signposts/lanterns/banners), Y-sorted with
 * their own ground shadow. `dx/dy` are relative to the building's top-left. */
function drawProps(scene: Phaser.Scene, b: BuildingDef): void {
  for (const p of b.props ?? []) {
    const fx = Math.round(b.x + p.dx);
    const fy = Math.round(b.y + p.dy); // foot line of the prop
    scene.add.image(fx, fy + 2, TEX.groundShadow).setDisplaySize(16, 7).setDepth(Math.round(fy) - 1);
    const g = scene.add.graphics().setDepth(Math.round(fy));
    drawProp(g, p.kind, fx, fy);
  }
}

/** One prop, drawn with its foot centred at (cx, fy). */
function drawProp(g: Phaser.GameObjects.Graphics, kind: string, cx: number, fy: number): void {
  if (kind === 'barrel') {
    g.fillStyle(0x2a1c12, 1); g.fillRect(cx - 8, fy - 18, 16, 18);
    g.fillStyle(0x7a5636, 1); g.fillRect(cx - 7, fy - 17, 14, 16);
    g.fillStyle(0x8a6642, 1); g.fillRect(cx - 7, fy - 17, 14, 3);
    g.fillStyle(0x5a3f28, 1); g.fillRect(cx - 7, fy - 11, 14, 2); g.fillRect(cx - 7, fy - 6, 14, 2);
    g.fillStyle(0x63472c, 1); g.fillRect(cx - 6, fy - 18, 12, 2);
  } else if (kind === 'crate') {
    g.fillStyle(0x3a2a1a, 1); g.fillRect(cx - 8, fy - 16, 16, 16);
    g.fillStyle(0x9a7038, 1); g.fillRect(cx - 7, fy - 15, 14, 14);
    g.fillStyle(0x7a5628, 1);
    g.fillRect(cx - 7, fy - 15, 14, 2); g.fillRect(cx - 7, fy - 3, 14, 2);
    g.fillRect(cx - 7, fy - 15, 2, 14); g.fillRect(cx + 5, fy - 15, 2, 14);
    for (let i = 0; i < 12; i++) g.fillRect(cx - 6 + i, fy - 14 + i, 2, 1);
  } else if (kind === 'signpost') {
    g.fillStyle(0x5a3f28, 1); g.fillRect(cx - 1, fy - 22, 3, 22);
    g.fillStyle(0x241812, 1); g.fillRect(cx - 9, fy - 22, 18, 10);
    g.fillStyle(0x7a5636, 1); g.fillRect(cx - 8, fy - 21, 16, 8);
    g.fillStyle(0x8a6642, 1); g.fillRect(cx - 8, fy - 21, 16, 2);
  } else if (kind === 'lantern') {
    g.fillStyle(0x2a2018, 1); g.fillRect(cx - 1, fy - 24, 2, 24);
    g.fillRect(cx - 5, fy - 24, 10, 2);
    g.fillStyle(0x241812, 1); g.fillRect(cx + 2, fy - 22, 8, 9);
    g.fillStyle(0xffd86b, 1); g.fillRect(cx + 3, fy - 21, 6, 7);
    g.fillStyle(0xfff2c0, 1); g.fillRect(cx + 4, fy - 20, 2, 5);
  } else { // banner
    g.fillStyle(0x5a3f28, 1); g.fillRect(cx - 1, fy - 26, 2, 26);
    g.fillStyle(0x9a3a3a, 1); g.fillRect(cx + 1, fy - 26, 12, 17);
    g.fillStyle(0x7a2a2a, 1); g.fillRect(cx + 1, fy - 11, 12, 2);
    g.fillStyle(0xf5c542, 1); g.fillRect(cx + 4, fy - 21, 6, 6);
  }
}

/**
 * Scatter small non-colliding decorations (tufts/flowers/pebbles/cracks) with
 * a per-map seeded RNG, skipping the path strip and portal rects. Breaks the
 * "one endless tile" look for roughly zero cost (static images).
 */
function scatterDecor(scene: Phaser.Scene, map: MapDef, w: number, h: number, pathOff: (a: number) => number): void {
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
          ? Math.abs(x - (w / 2 + pathOff(y))) < map.path.thickness / 2 + 8
          : Math.abs(y - (h / 2 + pathOff(x))) < map.path.thickness / 2 + 8;
      if (onPath) continue;
    }
    // Keep decor out of the water too.
    if ((map.water ?? []).some(([rx, ry, rw, rh]) => x > rx - 10 && x < rx + rw + 10 && y > ry - 10 && y < ry + rh + 10)) continue;
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
function drawPathEdges(scene: Phaser.Scene, map: MapDef, w: number, h: number, pathOff: (a: number) => number): void {
  if (!map.path) return;
  const g = scene.add.graphics().setDepth(-998);
  const colors = map.ground === 'grass' ? [0xe8c58d, 0xd9b174] : [0x99a8bb, 0x8797ad];
  const half = map.path.thickness / 2;
  const hashN = (n: number): number => {
    let v = (Math.imul(n | 0, 2654435761) ^ 0x9e37) >>> 0;
    v = Math.imul(v ^ (v >>> 13), 0x5bd1e995) >>> 0;
    return v;
  };
  if (map.path.axis === 'v') {
    for (let y = 8; y < h; y += 24) {
      const cx = w / 2 + pathOff(y);
      const nL = hashN(y);
      const nR = hashN(y + 7777);
      g.fillStyle(colors[nL % 2], 1);
      g.fillRect(Math.round(cx - half - 2 - (nL % 6)), y, 6 + (nL % 6), 10);
      g.fillStyle(colors[nR % 2], 1);
      g.fillRect(Math.round(cx + half - 4), y + 12, 6 + (nR % 6), 10);
    }
  } else {
    for (let x = 8; x < w; x += 24) {
      const cy = h / 2 + pathOff(x);
      const nT = hashN(x);
      const nB = hashN(x + 7777);
      g.fillStyle(colors[nT % 2], 1);
      g.fillRect(x, Math.round(cy - half - 2 - (nT % 6)), 10, 6 + (nT % 6));
      g.fillStyle(colors[nB % 2], 1);
      g.fillRect(x + 12, Math.round(cy + half - 4), 10, 6 + (nB % 6));
    }
  }
}

/**
 * Deterministic meander for the map's path: two low-frequency sine waves
 * seeded by the map id, tapered flat near both map ends so portals stay
 * centered on the road. Returns the centreline offset (px, 2px-quantised).
 */
function pathOffsetFn(map: MapDef, w: number, h: number): (a: number) => number {
  const wind = map.path?.wind ?? 0;
  if (!map.path || wind <= 0) return () => 0;
  let seed = 0;
  for (const ch of map.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const p1 = (seed % 628) / 100;
  const p2 = ((seed >> 5) % 628) / 100;
  const span = map.path.axis === 'v' ? h : w;
  return (a: number): number => {
    const taper = Math.min(1, Math.min(a, span - a) / 140);
    const raw = Math.sin(a * 0.011 + p1) * wind + Math.sin(a * 0.0042 + p2) * wind * 0.6;
    return Math.round((raw * Math.max(0, taper)) / 2) * 2;
  };
  void w;
}

/** Animated, collidable water (pond/river piece) with a light rim. */
function drawWater(
  scene: Phaser.Scene,
  obstacles: Phaser.Physics.Arcade.StaticGroup,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const tile = scene.add.tileSprite(x, y, w, h, TEX.tileWater).setOrigin(0).setDepth(-996);
  // Slow drift sells "liquid" without any per-frame cost worth mentioning.
  scene.tweens.add({ targets: tile, tilePositionX: 32, duration: 5000, repeat: -1 });
  scene.add
    .rectangle(x, y, w, h)
    .setOrigin(0)
    .setStrokeStyle(2, 0xbfe8ff, 0.35)
    .setDepth(-995)
    .setFillStyle(0, 0);
  const body = scene.add.rectangle(x + w / 2, y + h / 2, w, h).setVisible(false);
  scene.physics.add.existing(body, true);
  obstacles.add(body);
}

/** Scenic set-pieces so zones stop being empty corridors. */
function drawLandmark(
  scene: Phaser.Scene,
  obstacles: Phaser.Physics.Arcade.StaticGroup,
  lm: { x: number; y: number; kind: LandmarkKind },
): void {
  const { x, y } = lm;
  const solid = (cx: number, cy: number, sw: number, sh: number): void => {
    const b = scene.add.rectangle(cx, cy, sw, sh).setVisible(false);
    scene.physics.add.existing(b, true);
    obstacles.add(b);
  };
  switch (lm.kind) {
    case 'big_tree': {
      // Integer 2x keeps pixels square (rule 3).
      scene.add.image(x, y, TEX.obstaclePine).setScale(2).setDepth(y + 28);
      scene.add.ellipse(x, y + 30, 40, 14, 0x000000, 0.2).setDepth(4);
      solid(x, y + 22, 22, 16);
      break;
    }
    case 'ruin': {
      const g = scene.add.graphics().setDepth(y + 20);
      // Broken column + slab in weathered greys.
      g.fillStyle(0x6a6f7c, 1);
      g.fillRect(x - 26, y + 6, 52, 14); // base slab
      g.fillStyle(0x7c8290, 1);
      g.fillRect(x - 18, y - 26, 14, 32); // standing stump
      g.fillStyle(0x8c93a2, 1);
      g.fillRect(x - 18, y - 26, 14, 4);
      g.fillStyle(0x5a5f6c, 1);
      g.fillRect(x + 4, y - 2, 16, 10); // fallen block
      g.fillRect(x - 30, y + 2, 8, 6); // rubble
      scene.add.ellipse(x, y + 22, 56, 14, 0x000000, 0.18).setDepth(4);
      solid(x, y + 8, 56, 18);
      break;
    }
    case 'stone_circle': {
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI * 2 * i) / 6;
        const sx = Math.round(x + Math.cos(ang) * 34);
        const sy = Math.round(y + Math.sin(ang) * 22);
        scene.add.image(sx, sy, TEX.decorPebble).setScale(2).setDepth(sy);
      }
      // Faint mystic glow in the middle.
      const glow = scene.add.ellipse(x, y, 40, 22, 0xb0d0ff, 0.1).setDepth(3);
      scene.tweens.add({ targets: glow, alpha: 0.22, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      break;
    }
    case 'campfire': {
      const g = scene.add.graphics().setDepth(y);
      g.fillStyle(0x4a3220, 1);
      g.fillRect(x - 10, y - 2, 20, 4); // logs
      g.fillRect(x - 2, y - 8, 4, 12);
      const glow = scene.add.ellipse(x, y - 4, 64, 34, 0xffa050, 0.13).setDepth(3);
      const flameA = scene.add.circle(x, y - 8, 6, 0xff8a3a, 0.9).setDepth(y + 1);
      const flameB = scene.add.circle(x, y - 11, 3, 0xffd24a, 0.95).setDepth(y + 2);
      scene.tweens.add({ targets: [flameA, flameB], alpha: 0.55, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      scene.tweens.add({ targets: glow, alpha: 0.2, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      solid(x, y, 22, 10);
      break;
    }
  }
}
