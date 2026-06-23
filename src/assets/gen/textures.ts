import Phaser from 'phaser';
import { renderSheet, type LayerSpec } from './placeholder';
import { PALETTES, EQUIP_RAMPS } from './palette';
import { CHAR_FRAME_W, CHAR_FRAME_H } from '@/config/resolution';

/**
 * Texture keys for generated placeholder sheets. Keeping them in one place
 * avoids stringly typed lookups scattered around scenes.
 */
export const TEX = {
  shadow: 'gen.shadow',
  playerBody: 'gen.player.body',
  capLeather: 'gen.equip.cap_leather',
  helmIron: 'gen.equip.helm_iron',
  vestCloth: 'gen.equip.vest_cloth',
  plateIron: 'gen.equip.plate_iron',
  swordWood: 'gen.equip.sword_wood',
  swordIron: 'gen.equip.sword_iron',
  slime: 'gen.enemy.slime',
  tileGrass: 'gen.tile.grass',
  tilePath: 'gen.tile.path',
  tileStone: 'gen.tile.stone',
  tileFloor: 'gen.tile.floor',
  obstacle: 'gen.obstacle',
  wall: 'gen.wall',
  npc: 'gen.npc',
} as const;

const SPECS: Record<string, LayerSpec> = {
  [TEX.shadow]: { kind: 'shadow' },
  [TEX.playerBody]: { kind: 'body', palette: PALETTES.player },
  [TEX.capLeather]: { kind: 'head', ramp: EQUIP_RAMPS.leatherCap },
  [TEX.helmIron]: { kind: 'head', ramp: EQUIP_RAMPS.ironHelm },
  [TEX.vestCloth]: { kind: 'torso', ramp: EQUIP_RAMPS.clothVest },
  [TEX.plateIron]: { kind: 'torso', ramp: EQUIP_RAMPS.ironPlate },
  [TEX.swordWood]: { kind: 'weapon', ramp: EQUIP_RAMPS.woodSword },
  [TEX.swordIron]: { kind: 'weapon', ramp: EQUIP_RAMPS.ironSword },
  [TEX.slime]: { kind: 'slime', palette: PALETTES.slime },
};

/**
 * Generate all placeholder sheets and register them as spritesheets on the
 * given scene's texture manager. Idempotent: skips keys already present.
 */
export function ensureGeneratedTextures(scene: Phaser.Scene): void {
  for (const [key, spec] of Object.entries(SPECS)) {
    if (scene.textures.exists(key)) continue;
    const canvas = renderSheet(spec);
    // Register the canvas under `key` (cached), then slice it into the
    // pose-atlas frame grid. Two Phaser gotchas force this exact shape:
    //   1. addCanvas must NOT skip the cache (skipCache=true creates the
    //      texture but never stores it under the key -> lookups miss).
    //   2. addSpriteSheet(key, texture) reuses the *texture's* own key, so the
    //      canvas has to already be cached under the final `key`.
    const tex = scene.textures.addCanvas(key, canvas);
    if (!tex) throw new Error(`Failed to create canvas texture for ${key}`);
    scene.textures.addSpriteSheet(key, tex, {
      frameWidth: CHAR_FRAME_W,
      frameHeight: CHAR_FRAME_H,
    });
  }
  generateEnvTextures(scene);
}

/** Simple 32x32 tiles + obstacle + NPC placeholder (no anti-alias). */
function generateEnvTextures(scene: Phaser.Scene): void {
  const make = (key: string, draw: (ctx: CanvasRenderingContext2D) => void, w = 32, h = 32): void => {
    if (scene.textures.exists(key)) return;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
    scene.textures.addCanvas(key, c);
  };

  make(TEX.tileGrass, (ctx) => {
    ctx.fillStyle = '#27502f';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#2f6038';
    for (let i = 0; i < 18; i++) {
      const x = (i * 7 + 3) % 32;
      const y = (i * 11 + 5) % 32;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.fillStyle = '#1f4226';
    ctx.fillRect(0, 30, 32, 2);
  });

  make(TEX.tilePath, (ctx) => {
    ctx.fillStyle = '#6b5a3c';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#7d6a48';
    for (let i = 0; i < 22; i++) {
      const x = (i * 5 + 2) % 32;
      const y = (i * 13 + 7) % 32;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.fillStyle = '#564a30';
    ctx.fillRect(0, 0, 32, 1);
  });

  make(TEX.tileStone, (ctx) => {
    ctx.fillStyle = '#3b3f4a';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#4a4f5c';
    for (let i = 0; i < 16; i++) {
      const x = (i * 9 + 2) % 32;
      const y = (i * 7 + 4) % 32;
      ctx.fillRect(x, y, 3, 3);
    }
    ctx.fillStyle = '#2c2f38';
    ctx.fillRect(0, 0, 32, 1);
    ctx.fillRect(0, 0, 1, 32);
  });

  make(TEX.tileFloor, (ctx) => {
    ctx.fillStyle = '#241f33';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#2e2742';
    ctx.fillRect(1, 1, 30, 30);
    ctx.fillStyle = '#3a3157';
    ctx.fillRect(2, 2, 14, 14);
    ctx.fillRect(17, 17, 13, 13);
  });

  make(
    TEX.wall,
    (ctx) => {
      ctx.fillStyle = '#1c1e26';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#333a47';
      ctx.fillRect(2, 2, 28, 28);
      ctx.fillStyle = '#454d60';
      ctx.fillRect(3, 3, 26, 6);
    },
  );

  make(TEX.obstacle, (ctx) => {
    // A small bushy tree-like block.
    ctx.fillStyle = '#3a2418';
    ctx.fillRect(13, 20, 6, 12);
    ctx.fillStyle = '#173a1d';
    ctx.fillRect(3, 2, 26, 22);
    ctx.fillStyle = '#235c2c';
    ctx.fillRect(5, 4, 22, 14);
    ctx.fillStyle = '#2f7a3a';
    ctx.fillRect(7, 5, 14, 7);
  });

  make(
    TEX.npc,
    (ctx) => {
      // Reuse a chibi-ish blob as an NPC placeholder (finished sprite).
      ctx.fillStyle = '#241a30';
      ctx.fillRect(20, 40, 24, 30);
      ctx.fillStyle = '#6a4ea0';
      ctx.fillRect(22, 42, 20, 26);
      ctx.fillStyle = '#3a2418';
      ctx.fillRect(20, 20, 24, 22);
      ctx.fillStyle = '#d68a5b';
      ctx.fillRect(22, 22, 20, 18);
      ctx.fillStyle = '#1c1230';
      ctx.fillRect(26, 30, 3, 3);
      ctx.fillRect(35, 30, 3, 3);
    },
    64,
    96,
  );
}
