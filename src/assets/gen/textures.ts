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
  // Hairless base body, swapped in for `playerBody` whenever a helmet is
  // equipped so the helm has a clean (bald) head to sit on. See
  // Player.setEquipVisual. Real art at assets/char/player_body_bald.png.
  playerBodyBald: 'gen.player.body.bald',
  // Job-fixed appearance bodies (look is decided by job, not equipment). Real
  // art ships as PNGs (manifest); until a job's PNG exists the player falls back
  // to `playerBody`. NOT in SPECS on purpose so the fallback check can work.
  jobFighter: 'gen.char.fighter',
  jobMage: 'gen.char.mage',
  jobPriest: 'gen.char.priest',
  jobThief: 'gen.char.thief',
  jobPetRaiser: 'gen.char.pet_raiser',
  capLeather: 'gen.equip.cap_leather',
  helmIron: 'gen.equip.helm_iron',
  vestCloth: 'gen.equip.vest_cloth',
  plateIron: 'gen.equip.plate_iron',
  swordWood: 'gen.equip.sword_wood',
  swordIron: 'gen.equip.sword_iron',
  slime: 'gen.enemy.slime',
  bat: 'gen.enemy.bat',
  wolf: 'gen.enemy.wolf',
  mushroom: 'gen.enemy.mushroom',
  golem: 'gen.enemy.golem',
  lizard: 'gen.enemy.lizard',
  wisp: 'gen.enemy.wisp',
  knight: 'gen.enemy.knight',
  treant: 'gen.enemy.treant',
  dragon: 'gen.enemy.dragon',
  tileGrass: 'gen.tile.grass',
  tilePath: 'gen.tile.path',
  tileStone: 'gen.tile.stone',
  tileFloor: 'gen.tile.floor',
  obstacle: 'gen.obstacle',
  obstacleBush: 'gen.obstacle.bush',
  obstaclePine: 'gen.obstacle.pine',
  wall: 'gen.wall',
  npc: 'gen.npc',
  decorTuft: 'gen.decor.tuft',
  decorFlowerA: 'gen.decor.flower_a',
  decorFlowerB: 'gen.decor.flower_b',
  decorPebble: 'gen.decor.pebble',
  decorCrack: 'gen.decor.crack',
} as const;

const SPECS: Record<string, LayerSpec> = {
  [TEX.shadow]: { kind: 'shadow' },
  [TEX.playerBody]: { kind: 'body', palette: PALETTES.player },
  // Fallback placeholder only; the real bald sheet ships as a PNG (manifest).
  [TEX.playerBodyBald]: { kind: 'body', palette: PALETTES.player },
  [TEX.capLeather]: { kind: 'head', ramp: EQUIP_RAMPS.leatherCap },
  [TEX.helmIron]: { kind: 'head', ramp: EQUIP_RAMPS.ironHelm },
  [TEX.vestCloth]: { kind: 'torso', ramp: EQUIP_RAMPS.clothVest },
  [TEX.plateIron]: { kind: 'torso', ramp: EQUIP_RAMPS.ironPlate },
  [TEX.swordWood]: { kind: 'weapon', ramp: EQUIP_RAMPS.woodSword },
  [TEX.swordIron]: { kind: 'weapon', ramp: EQUIP_RAMPS.ironSword },
  [TEX.slime]: { kind: 'slime', palette: PALETTES.slime },
  [TEX.bat]: { kind: 'bat', palette: PALETTES.mob },
  [TEX.wolf]: { kind: 'wolf', palette: PALETTES.mob },
  [TEX.mushroom]: { kind: 'mushroom', palette: PALETTES.mob },
  [TEX.golem]: { kind: 'golem', palette: PALETTES.mob },
  [TEX.lizard]: { kind: 'lizard', palette: PALETTES.mob },
  [TEX.wisp]: { kind: 'wisp', palette: PALETTES.mob },
  [TEX.knight]: { kind: 'knight', palette: PALETTES.mob },
  [TEX.treant]: { kind: 'treant', palette: PALETTES.mob },
  [TEX.dragon]: { kind: 'dragon', palette: PALETTES.mob },
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
    // Dense multi-tone grass so the repeat reads as texture, not a flat lawn.
    ctx.fillStyle = '#2a5330';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#255030';
    for (let i = 0; i < 10; i++) {
      ctx.fillRect((i * 13 + 5) % 32, (i * 7 + 2) % 32, 4, 3);
    }
    ctx.fillStyle = '#316238';
    for (let i = 0; i < 26; i++) {
      ctx.fillRect((i * 7 + 3) % 32, (i * 11 + 5) % 32, 2, 2);
    }
    ctx.fillStyle = '#3b7243';
    for (let i = 0; i < 14; i++) {
      ctx.fillRect((i * 17 + 6) % 32, (i * 5 + 9) % 31, 1, 3);
    }
    ctx.fillStyle = '#1e4426';
    for (let i = 0; i < 12; i++) {
      ctx.fillRect((i * 19 + 11) % 32, (i * 13 + 3) % 32, 2, 1);
    }
  });

  make(TEX.tilePath, (ctx) => {
    // Trodden dirt: base + pebbles in three tones + faint wheel-rut lines.
    ctx.fillStyle = '#6b5a3c';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#786547';
    for (let i = 0; i < 20; i++) {
      ctx.fillRect((i * 5 + 2) % 32, (i * 13 + 7) % 32, 2, 2);
    }
    ctx.fillStyle = '#84714e';
    for (let i = 0; i < 8; i++) {
      ctx.fillRect((i * 11 + 4) % 31, (i * 17 + 3) % 31, 3, 2);
    }
    ctx.fillStyle = '#5c4d31';
    for (let i = 0; i < 12; i++) {
      ctx.fillRect((i * 9 + 6) % 32, (i * 7 + 11) % 32, 2, 1);
    }
    ctx.fillStyle = '#63533a';
    ctx.fillRect(0, 9, 32, 1);
    ctx.fillRect(0, 23, 32, 1);
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

  // Tree variants: mixed in deterministically by the map builder so tree lines
  // stop reading as a repeated single stamp.
  make(TEX.obstacleBush, (ctx) => {
    // Low round bush, no trunk.
    ctx.fillStyle = '#16371c';
    ctx.fillRect(4, 10, 24, 18);
    ctx.fillStyle = '#215628';
    ctx.fillRect(6, 12, 20, 14);
    ctx.fillStyle = '#2c7336';
    ctx.fillRect(8, 13, 12, 6);
    ctx.fillStyle = '#173a1d';
    ctx.fillRect(2, 16, 4, 8);
    ctx.fillRect(26, 16, 4, 8);
  });
  make(TEX.obstaclePine, (ctx) => {
    // Tall narrow pine: stacked shrinking tiers + trunk.
    ctx.fillStyle = '#3a2418';
    ctx.fillRect(14, 24, 4, 8);
    ctx.fillStyle = '#12331a';
    ctx.fillRect(8, 16, 16, 9);
    ctx.fillRect(10, 9, 12, 9);
    ctx.fillRect(12, 2, 8, 9);
    ctx.fillStyle = '#1d4f27';
    ctx.fillRect(10, 17, 12, 5);
    ctx.fillRect(12, 10, 8, 5);
    ctx.fillRect(13, 3, 6, 5);
  });

  // 16x16 ground decorations (non-colliding, scattered by the map builder).
  make(TEX.decorTuft, (ctx) => {
    ctx.fillStyle = '#2f6038';
    ctx.fillRect(3, 8, 2, 6);
    ctx.fillRect(7, 6, 2, 8);
    ctx.fillRect(11, 9, 2, 5);
    ctx.fillStyle = '#3a7a46';
    ctx.fillRect(5, 9, 2, 5);
    ctx.fillRect(9, 8, 2, 6);
  }, 16, 16);
  make(TEX.decorFlowerA, (ctx) => {
    ctx.fillStyle = '#2f6038';
    ctx.fillRect(7, 9, 2, 5);
    ctx.fillStyle = '#f0f0e6';
    ctx.fillRect(5, 5, 6, 4);
    ctx.fillRect(6, 4, 4, 6);
    ctx.fillStyle = '#f5c542';
    ctx.fillRect(7, 6, 2, 2);
  }, 16, 16);
  make(TEX.decorFlowerB, (ctx) => {
    ctx.fillStyle = '#2f6038';
    ctx.fillRect(7, 9, 2, 5);
    ctx.fillStyle = '#e07a9a';
    ctx.fillRect(5, 5, 6, 4);
    ctx.fillRect(6, 4, 4, 6);
    ctx.fillStyle = '#f5e0a0';
    ctx.fillRect(7, 6, 2, 2);
  }, 16, 16);
  make(TEX.decorPebble, (ctx) => {
    ctx.fillStyle = '#565a66';
    ctx.fillRect(4, 8, 8, 5);
    ctx.fillStyle = '#7a7e8a';
    ctx.fillRect(5, 9, 5, 2);
  }, 16, 16);
  make(TEX.decorCrack, (ctx) => {
    ctx.fillStyle = '#1a1c24';
    ctx.fillRect(3, 7, 6, 1);
    ctx.fillRect(8, 8, 4, 1);
    ctx.fillRect(6, 4, 1, 4);
    ctx.fillRect(11, 9, 1, 3);
  }, 16, 16);

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
