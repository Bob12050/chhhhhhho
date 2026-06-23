import Phaser from 'phaser';
import { TEX } from '@/assets/gen/textures';
import type { MapDef, GroundKind, BorderKind } from '@/maps/map-def';

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
  }

  // Portal rects (resolved up front so the border can leave openings for them).
  const portals: BuiltPortal[] = (map.portals ?? []).map((p) => ({
    rect: new Phaser.Geom.Rectangle(p.rect[0], p.rect[1], p.rect[2], p.rect[3]),
    to: p.to,
    toSpawn: p.toSpawn,
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
  const place = (x: number, y: number, tex: string): void => {
    if (onPortal(x, y)) return;
    const o = obstacles.create(x, y, tex) as Phaser.Physics.Arcade.Image;
    o.setDepth(Math.round(y));
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

  // Portal gate markers + labels.
  for (const p of map.portals ?? []) {
    const [px, py, pw, ph] = p.rect;
    const cx = px + pw / 2;
    const cy = py + ph / 2;
    scene.add.rectangle(cx, cy, pw, ph, 0x6fd0ff, 0.4).setStrokeStyle(2, 0xbfeaff, 0.8).setDepth(5);
    if (p.label) {
      scene.add
        .text(cx, cy, p.label, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '10px',
          color: '#eaf7ff',
        })
        .setOrigin(0.5)
        .setDepth(6);
    }
  }

  return { obstacles, portals };
}
