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
  tileGrass2: 'gen.tile.grass2',
  tilePath: 'gen.tile.path',
  tileStone: 'gen.tile.stone',
  tileFloor: 'gen.tile.floor',
  tileWater: 'gen.tile.water',
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
  iconSword: 'gen.icon.sword',
  iconRoll: 'gen.icon.roll',
  iconFlask: 'gen.icon.flask',
  iconBag: 'gen.icon.bag',
  iconMap: 'gen.icon.map',
  iconGem: 'gen.icon.gem',
  iconStaff: 'gen.icon.staff',
  iconBow: 'gen.icon.bow',
  iconShield: 'gen.icon.shield',
  iconHelm: 'gen.icon.helm',
  iconArmor: 'gen.icon.armor',
  iconRing: 'gen.icon.ring',
  // 9-slice UI panel frame. Drop assets/ui/frame.png (48x48, ~16px corners) to
  // restyle every framed menu panel with no code change (see ninePanel()).
  uiFrame: 'gen.ui.frame',
  // Distinct town NPC looks by role (so the shopkeeper / smith / guild clerk /
  // elder stop being identical tinted clones). Real art drops in via manifest.
  npcMerchant: 'gen.npc.merchant',
  npcSmith: 'gen.npc.smith',
  npcGuild: 'gen.npc.guild',
  npcElder: 'gen.npc.elder',
  npcVillager: 'gen.npc.villager',
  // Hanging wooden signboard behind an NPC's name (kills the floating text).
  sign: 'gen.sign',
  // Soft ground contact shadow (one texture, scaled per object via displaySize).
  groundShadow: 'gen.ground.shadow',
} as const;

/** Corner inset (px) used when slicing TEX.uiFrame. Match this in the PNG. */
export const UI_FRAME_SLICE = 16;

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

  // Soft elliptical ground shadow (baked alpha falloff). Placed as an Image and
  // scaled per object with setDisplaySize — one texture for every shadow. Not
  // pixel-art (a soft blob), so scaling it causes no shimmer. `env/shadow.png`
  // overrides it.
  make(
    TEX.groundShadow,
    (ctx) => {
      ctx.save();
      ctx.translate(24, 10);
      ctx.scale(1, 0.42); // squash the circle into an ellipse
      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 23);
      grad.addColorStop(0, 'rgba(0,0,0,0.45)');
      grad.addColorStop(0.6, 'rgba(0,0,0,0.24)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 23, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
    48,
    20,
  );

  make(TEX.tileGrass, (ctx) => {
    // Calm, low-contrast lawn so characters/buildings read on top (the old tile
    // was too busy). A soft base + a few gentle mottles, tight tonal range.
    ctx.fillStyle = '#3a6a40';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#376740'; // barely-there darker patches (large, soft)
    for (let i = 0; i < 5; i++) {
      ctx.fillRect((i * 13 + 4) % 30, (i * 17 + 6) % 30, 5, 4);
    }
    ctx.fillStyle = '#40724a'; // sparse light blades
    for (let i = 0; i < 7; i++) {
      ctx.fillRect((i * 19 + 6) % 31, (i * 11 + 9) % 30, 1, 2);
    }
    ctx.fillStyle = '#33613b'; // a few dark specks for grain
    for (let i = 0; i < 5; i++) {
      ctx.fillRect((i * 23 + 11) % 32, (i * 13 + 4) % 32, 2, 1);
    }
  });

  // Second grass tile: a slightly different mottle so large lawns can alternate
  // (broken up by the map builder) without reading as one stamped texture.
  make(TEX.tileGrass2, (ctx) => {
    ctx.fillStyle = '#3d6d43';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#396a42';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect((i * 17 + 9) % 29, (i * 13 + 3) % 29, 6, 4);
    }
    ctx.fillStyle = '#43764d';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect((i * 21 + 4) % 31, (i * 9 + 12) % 30, 1, 2);
    }
    ctx.fillStyle = '#356239';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect((i * 25 + 7) % 32, (i * 15 + 8) % 32, 2, 1);
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

  make(TEX.tileWater, (ctx) => {
    // Deep water with light wave dashes (the tileSprite drifts to sell flow).
    ctx.fillStyle = '#2a5a8a';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#356a9c';
    for (let i = 0; i < 10; i++) {
      ctx.fillRect((i * 13 + 4) % 32, (i * 7 + 3) % 32, 5, 2);
    }
    ctx.fillStyle = '#7ab8e0';
    ctx.fillRect(3, 6, 8, 1);
    ctx.fillRect(18, 14, 9, 1);
    ctx.fillRect(8, 24, 7, 1);
    ctx.fillStyle = '#1f4a75';
    for (let i = 0; i < 8; i++) {
      ctx.fillRect((i * 11 + 7) % 32, (i * 17 + 9) % 32, 4, 1);
    }
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
  // 16x16 UI icons for the touch buttons (white; buttons tint via alpha bg).
  make(TEX.iconSword, (ctx) => {
    ctx.fillStyle = '#ffffff';
    // Diagonal blade
    for (let i = 0; i < 8; i++) ctx.fillRect(11 - i, 2 + i, 2, 2);
    // Guard + grip
    ctx.fillRect(3, 9, 5, 2);
    ctx.fillRect(2, 12, 3, 3);
    ctx.fillStyle = '#ffd86b';
    ctx.fillRect(5, 10, 2, 2);
  }, 16, 16);
  make(TEX.iconRoll, (ctx) => {
    ctx.fillStyle = '#ffffff';
    // Double chevron (dash direction)
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(3 + i, 4 + i, 2, 2);
      ctx.fillRect(3 + i, 10 - i, 2, 2);
      ctx.fillRect(8 + i, 4 + i, 2, 2);
      ctx.fillRect(8 + i, 10 - i, 2, 2);
    }
  }, 16, 16);
  make(TEX.iconFlask, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(6, 2, 4, 3); // neck
    ctx.fillRect(4, 5, 8, 8); // body
    ctx.fillStyle = '#ff8a9a';
    ctx.fillRect(5, 8, 6, 4); // liquid
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(5, 1, 6, 1); // cork line
  }, 16, 16);
  make(TEX.iconBag, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(3, 6, 10, 8);
    ctx.fillRect(5, 3, 6, 3);
    ctx.fillStyle = '#c0a060';
    ctx.fillRect(3, 8, 10, 2);
  }, 16, 16);
  make(TEX.iconMap, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 3, 12, 10);
    ctx.fillStyle = '#5a9ad0';
    ctx.fillRect(3, 4, 4, 8);
    ctx.fillStyle = '#9fe3a0';
    ctx.fillRect(8, 4, 5, 8);
    ctx.fillStyle = '#d05a6e';
    ctx.fillRect(9, 6, 2, 2); // pin
  }, 16, 16);

  // Inventory item icons (16x16, white so the cell can tint by rarity/type).
  make(TEX.iconGem, (ctx) => {
    // Faceted diamond.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(6, 2, 4, 1);
    ctx.fillRect(4, 3, 8, 2);
    ctx.fillRect(3, 5, 10, 2);
    ctx.fillRect(4, 7, 8, 2);
    ctx.fillRect(6, 9, 4, 2);
    ctx.fillRect(7, 11, 2, 1);
    ctx.fillStyle = '#c8d4ff';
    ctx.fillRect(5, 4, 2, 4); // facet shade
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(9, 4, 1, 3); // highlight
  }, 16, 16);
  make(TEX.iconStaff, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(8, 4, 2, 10); // shaft
    ctx.fillStyle = '#7ad0ff';
    ctx.fillRect(6, 2, 5, 3); // orb
    ctx.fillRect(7, 1, 3, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(7, 2, 1, 1);
  }, 16, 16);
  make(TEX.iconBow, (ctx) => {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 10; i++) {
      const dx = Math.round(3 + 3 * Math.sin((i / 9) * Math.PI));
      ctx.fillRect(4 + dx - 1, 2 + i, 2, 1);
    }
    ctx.fillStyle = '#c0a060';
    ctx.fillRect(4, 3, 1, 10); // string
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, 7, 9, 1); // arrow
    ctx.fillRect(11, 6, 2, 3);
  }, 16, 16);
  make(TEX.iconShield, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, 2, 8, 2);
    ctx.fillRect(3, 4, 10, 5);
    ctx.fillRect(4, 9, 8, 2);
    ctx.fillRect(6, 11, 4, 2);
    ctx.fillStyle = '#ffd86b';
    ctx.fillRect(7, 5, 2, 5); // emblem stripe
    ctx.fillRect(5, 6, 6, 2);
  }, 16, 16);
  make(TEX.iconHelm, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, 4, 8, 6); // dome
    ctx.fillRect(3, 5, 10, 3);
    ctx.fillRect(4, 10, 8, 2); // rim
    ctx.fillStyle = '#5a9ad0';
    ctx.fillRect(6, 6, 4, 2); // visor slit
  }, 16, 16);
  make(TEX.iconArmor, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, 3, 8, 2); // shoulders
    ctx.fillRect(3, 5, 10, 7); // chest
    ctx.fillRect(5, 12, 6, 1);
    ctx.fillStyle = '#c8d4ff';
    ctx.fillRect(7, 5, 2, 7); // center seam
  }, 16, 16);
  make(TEX.iconRing, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(5, 6, 6, 2);
    ctx.fillRect(4, 8, 2, 4);
    ctx.fillRect(10, 8, 2, 4);
    ctx.fillRect(5, 12, 6, 2);
    ctx.fillStyle = '#ff8ad0';
    ctx.fillRect(7, 3, 2, 3); // gem
    ctx.fillRect(6, 4, 4, 1);
  }, 16, 16);

  make(TEX.decorCrack, (ctx) => {
    ctx.fillStyle = '#1a1c24';
    ctx.fillRect(3, 7, 6, 1);
    ctx.fillRect(8, 8, 4, 1);
    ctx.fillRect(6, 4, 1, 4);
    ctx.fillRect(11, 9, 1, 3);
  }, 16, 16);

  // 9-slice UI panel frame (48x48, 16px corners). Soft rounded modern panel:
  // a real assets/ui/frame.png drops straight in via the manifest and restyles
  // every ninePanel() at once. Rounded corners live inside the fixed 16px corner
  // slices so they stay crisp at any stretched size.
  make(
    TEX.uiFrame,
    (ctx) => {
      const rr = (x: number, y: number, w: number, h: number, r: number): void => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      };
      const rad = 11;
      // Body: soft vertical gradient (lighter slate → deep navy).
      const grad = ctx.createLinearGradient(0, 0, 0, 48);
      grad.addColorStop(0, '#333c5c');
      grad.addColorStop(1, '#1c2238');
      ctx.fillStyle = grad;
      rr(1, 1, 46, 46, rad);
      ctx.fill();
      // Top sheen for a gentle glossy lift.
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      rr(3, 3, 42, 15, rad - 3);
      ctx.fill();
      // Soft light border (no hard gold hairline → far less retro).
      ctx.strokeStyle = 'rgba(150,168,220,0.55)';
      ctx.lineWidth = 1.5;
      rr(1.5, 1.5, 45, 45, rad);
      ctx.stroke();
      // Faint inner keyline for a touch of depth.
      ctx.strokeStyle = 'rgba(10,12,22,0.5)';
      ctx.lineWidth = 1;
      rr(3, 3, 42, 42, rad - 2);
      ctx.stroke();
    },
    48,
    48,
  );

  // Chibi townsperson, parameterised by role. Drawn with an outline + shading
  // so NPCs read as designed characters, not tinted blobs. Frame 64x96, feet at
  // ~y70 (origin 0.5,0.875). Silhouettes differ per role (hat/apron/beard/hood).
  interface NpcLook {
    skin: string;
    hair: string;
    outfit: string;
    outfitDark: string;
    trim: string;
    hat?: string; // brimmed cap crown colour
    hood?: string; // pointed hood/robe colour (covers hair)
    apron?: string; // apron panel colour
    beard?: string; // beard colour
  }
  const OUTLINE = '#1a1526';
  const drawNpc = (ctx: CanvasRenderingContext2D, o: NpcLook): void => {
    const rect = (x: number, y: number, w: number, h: number, c: string): void => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
    // Ground contact shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(21, 68, 22, 4);
    // Silhouette outline (draw the body area 1px larger in dark first).
    rect(19, 21, 26, 50, OUTLINE);
    // Legs + boots.
    rect(24, 56, 7, 12, o.outfitDark);
    rect(33, 56, 7, 12, o.outfitDark);
    rect(23, 66, 8, 4, OUTLINE);
    rect(33, 66, 8, 4, OUTLINE);
    // Torso (outfit) with a lighter centre and darker sides for volume.
    rect(21, 40, 22, 18, o.outfit);
    rect(21, 40, 4, 18, o.outfitDark);
    rect(39, 40, 4, 18, o.outfitDark);
    rect(26, 42, 12, 4, o.trim); // collar/shoulders trim
    // Arms.
    rect(19, 42, 5, 14, o.outfitDark);
    rect(40, 42, 5, 14, o.outfitDark);
    rect(20, 41, 4, 4, o.skin);
    rect(40, 41, 4, 4, o.skin);
    // Apron (smith/merchant) over the torso.
    if (o.apron) {
      rect(27, 44, 10, 14, o.apron);
      rect(27, 44, 10, 1, '#00000033');
    }
    // Head (skin) with outline.
    rect(23, 22, 18, 18, OUTLINE);
    rect(24, 23, 16, 16, o.skin);
    rect(24, 23, 16, 3, '#ffffff22'); // forehead light
    // Eyes + smile.
    rect(28, 30, 2, 3, '#1c1230');
    rect(34, 30, 2, 3, '#1c1230');
    rect(30, 35, 4, 1, '#a85c4a');
    // Hair / hood / hat.
    if (o.hood) {
      rect(21, 18, 22, 14, o.hood); // hood shell
      rect(24, 24, 16, 8, o.skin); // face opening
      rect(28, 30, 2, 3, '#1c1230');
      rect(34, 30, 2, 3, '#1c1230');
      rect(30, 35, 4, 1, '#a85c4a');
      rect(21, 18, 22, 3, OUTLINE);
    } else {
      rect(22, 19, 20, 8, o.hair); // hair cap
      rect(22, 24, 3, 8, o.hair); // side burns
      rect(39, 24, 3, 8, o.hair);
    }
    if (o.hat) {
      rect(20, 18, 24, 4, OUTLINE); // brim
      rect(21, 19, 22, 2, o.hat === OUTLINE ? '#333' : o.hat);
      rect(24, 12, 16, 8, o.hat); // crown
      rect(24, 12, 16, 2, '#ffffff22');
      rect(23, 11, 18, 2, OUTLINE);
    }
    if (o.beard) {
      rect(25, 36, 14, 6, o.beard);
      rect(27, 42, 10, 3, o.beard);
    }
  };

  const NPC_LOOKS: Record<string, NpcLook> = {
    [TEX.npcMerchant]: {
      skin: '#e6a878', hair: '#5a3a24', outfit: '#3f8f5a', outfitDark: '#2c6b41',
      trim: '#f0d68a', apron: '#d9c48a',
    },
    [TEX.npcSmith]: {
      skin: '#d68a5b', hair: '#2a1c14', outfit: '#7a4030', outfitDark: '#5a2c22',
      trim: '#c9722f', apron: '#3a3038', hat: '#8a1f1f',
    },
    [TEX.npcGuild]: {
      skin: '#eab890', hair: '#caa23a', outfit: '#3a5aa0', outfitDark: '#28407a',
      trim: '#e6c860', hat: '#2a3f78',
    },
    [TEX.npcElder]: {
      skin: '#e0b48c', hair: '#e8e8ee', outfit: '#6a4ea0', outfitDark: '#4c3778',
      trim: '#caa8ff', hood: '#5a3f90', beard: '#e8e8ee',
    },
    [TEX.npcVillager]: {
      skin: '#e6a878', hair: '#8a5a34', outfit: '#b0683a', outfitDark: '#8a4e2a',
      trim: '#e0b070',
    },
  };
  for (const [key, look] of Object.entries(NPC_LOOKS)) {
    make(key, (ctx) => drawNpc(ctx, look), 64, 96);
  }
  // Back-compat generic NPC = villager look.
  make(TEX.npc, (ctx) => drawNpc(ctx, NPC_LOOKS[TEX.npcVillager]), 64, 96);

  // Hanging wooden signboard (used behind an NPC's name). 9-sliceable-ish but we
  // just stretch a plaque; posts/rope drawn within the fixed ends.
  make(
    TEX.sign,
    (ctx) => {
      // Rope hangers.
      ctx.fillStyle = '#6a5236';
      ctx.fillRect(10, 0, 2, 5);
      ctx.fillRect(52, 0, 2, 5);
      // Plaque body (wood) with border + grain.
      ctx.fillStyle = '#2a1d12';
      ctx.fillRect(4, 4, 56, 20);
      ctx.fillStyle = '#7a5636';
      ctx.fillRect(6, 6, 52, 16);
      ctx.fillStyle = '#8a6642';
      ctx.fillRect(6, 6, 52, 4);
      ctx.fillStyle = '#63472c';
      ctx.fillRect(6, 14, 52, 1);
      ctx.fillStyle = '#5a3f28';
      ctx.fillRect(6, 19, 52, 3);
    },
    64,
    26,
  );
}
