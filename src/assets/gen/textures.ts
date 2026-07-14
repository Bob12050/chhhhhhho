import Phaser from 'phaser';
import { renderSheet, type LayerSpec } from './placeholder';
import { PALETTES, EQUIP_RAMPS } from './palette';
import { CHAR_FRAME_W, CHAR_FRAME_H } from '@/config/resolution';

/** Generated 16x16 combat-skill icons, keyed by the data definition id. */
export const SKILL_TEX = {
  slash: 'gen.skill.slash',
  power_strike: 'gen.skill.power_strike',
  w_cleave: 'gen.skill.w_cleave',
  w_warcry: 'gen.skill.w_warcry',
  w_whirl: 'gen.skill.w_whirl',
  w_quake: 'gen.skill.w_quake',
  w_calamity: 'gen.skill.w_calamity',
  m_firebolt: 'gen.skill.m_firebolt',
  m_frost: 'gen.skill.m_frost',
  m_thunder: 'gen.skill.m_thunder',
  m_meteor: 'gen.skill.m_meteor',
  c_smite: 'gen.skill.c_smite',
  c_holylight: 'gen.skill.c_holylight',
  c_judgment: 'gen.skill.c_judgment',
  c_genesis: 'gen.skill.c_genesis',
  t_quickstab: 'gen.skill.t_quickstab',
  t_doublecut: 'gen.skill.t_doublecut',
  t_shadowfang: 'gen.skill.t_shadowfang',
  t_phantom: 'gen.skill.t_phantom',
  b_beastclaw: 'gen.skill.b_beastclaw',
  b_volley: 'gen.skill.b_volley',
  b_stampede: 'gen.skill.b_stampede',
  b_genesis: 'gen.skill.b_genesis',
} as const;

/**
 * Texture keys for generated placeholder sheets. Keeping them in one place
 * avoids stringly typed lookups scattered around scenes.
 */
export const TEX = {
  shadow: 'gen.shadow',
  playerBody: 'gen.player.body',
  playerBodyDiagonal: 'art.player.body.diagonal',
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
  jobSamurai: 'gen.char.samurai',
  jobSorcerer: 'gen.char.sorcerer',
  jobHolyKnight: 'gen.char.holy_knight',
  jobNinja: 'gen.char.ninja',
  jobRanger: 'gen.char.ranger',
  jobSwordKaiser: 'gen.char.sword_kaiser',
  jobGrandMagia: 'gen.char.grand_magia',
  jobGrandMagiaDiagonal: 'art.char.grand_magia.diagonal',
  jobShieldSaber: 'gen.char.shield_saber',
  jobAvengista: 'gen.char.avengista',
  jobDualStar: 'gen.char.dual_star',
  jobAramikagura: 'gen.char.aramikagura',
  jobAlvride: 'gen.char.alvride',
  jobNirvadio: 'gen.char.nirvadio',
  jobNoxtia: 'gen.char.noxtia',
  jobOltarie: 'gen.char.oltarie',
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
  // AI-art-only bosses (no procedural generator; boot aliases a stand-in
  // texture if the PNG fails to load — see ensureGeneratedTextures).
  zephys: 'gen.enemy.zephys',
  hydra: 'gen.enemy.hydra',
  sandgoa: 'gen.enemy.sandgoa',
  almagia: 'gen.enemy.almagia',
  tileGrass: 'gen.tile.grass',
  tileGrass2: 'gen.tile.grass2',
  tilePath: 'gen.tile.path',
  tileStone: 'gen.tile.stone',
  tileFloor: 'gen.tile.floor',
  tileWater: 'gen.tile.water',
  townMap: 'art.map.town.storybook',
  fieldMap: 'art.map.field.storybook',
  forestMap: 'art.map.forest.storybook',
  dungeonMap: 'art.map.dungeon.storybook',
  canyonMap: 'art.map.canyon.storybook',
  volcanoMap: 'art.map.volcano.storybook',
  snowfieldMap: 'art.map.snowfield.storybook',
  desertMap: 'art.map.desert.storybook',
  arenaMap: 'art.map.arena.storybook',
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
  // Generated storybook menu art. Text and live values stay code-driven while
  // these raster layers provide the shared material/world finish.
  uiMenuBackdrop: 'art.ui.menu.backdrop',
  uiMapBackdrop: 'art.ui.map.backdrop',
  uiRibbonFrame: 'art.ui.ribbon.frame',
  // Illustrated HUD skin. These are real transparent PNGs rather than canvas
  // primitives so the always-visible game screen shares one art direction.
  hudStatusFrame: 'art.ui.hud.status_frame',
  hudQuestFrame: 'art.ui.hud.quest_frame',
  hudMinimapFrame: 'art.ui.hud.minimap_frame',
  hudStickBase: 'art.ui.hud.stick_base',
  hudActionButton: 'art.ui.hud.action_button',
  hudUtilityButton: 'art.ui.hud.utility_button',
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
/**
 * AI-art-only textures with NO procedural generator: if their PNG failed to
 * load (offline first run with a stale cache), alias a visually-plausible
 * stand-in so nothing renders as a missing-texture box.
 */
const ART_FALLBACK: Record<string, string> = {
  [TEX.zephys]: TEX.bat,
  [TEX.hydra]: TEX.lizard,
  [TEX.sandgoa]: TEX.golem,
  [TEX.almagia]: TEX.knight,
};

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
  for (const [key, standIn] of Object.entries(ART_FALLBACK)) {
    if (scene.textures.exists(key) || !scene.textures.exists(standIn)) continue;
    // Copy the stand-in's pixels into a fresh canvas: addSpriteSheet reuses
    // the source texture's key (gotcha #2 above), so a direct alias is out.
    const src = scene.textures.get(standIn).getSourceImage() as HTMLCanvasElement;
    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    canvas.getContext('2d')?.drawImage(src, 0, 0);
    const tex = scene.textures.addCanvas(key, canvas);
    if (tex) {
      scene.textures.addSpriteSheet(key, tex, {
        frameWidth: CHAR_FRAME_W,
        frameHeight: CHAR_FRAME_H,
      });
    }
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

  // Every active skill gets a compact silhouette of its own. Keeping these at
  // 16x16 lets the HUD use integer scaling without blurring the pixel edges.
  const skillIcon = (key: string, draw: (ctx: CanvasRenderingContext2D) => void): void => {
    make(key, draw, 16, 16);
  };
  skillIcon(SKILL_TEX.slash, (ctx) => {
    ctx.fillStyle = '#83d8ff';
    for (let i = 0; i < 10; i++) ctx.fillRect(13 - i, 2 + i, 2, 2);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 7; i++) ctx.fillRect(11 - i, 2 + i, 1, 1);
    ctx.fillRect(2, 12, 5, 2);
  });
  skillIcon(SKILL_TEX.power_strike, (ctx) => {
    ctx.fillStyle = '#e97462';
    ctx.fillRect(6, 1, 4, 14);
    ctx.fillRect(1, 6, 14, 4);
    ctx.fillRect(3, 3, 10, 10);
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(5, 5, 6, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(7, 7, 2, 2);
  });
  skillIcon(SKILL_TEX.w_cleave, (ctx) => {
    ctx.fillStyle = '#9b6a47';
    for (let i = 0; i < 10; i++) ctx.fillRect(4 + i, 12 - i, 2, 2);
    ctx.fillStyle = '#f3f0df';
    ctx.fillRect(2, 2, 7, 3);
    ctx.fillRect(2, 5, 5, 3);
    ctx.fillStyle = '#d26755';
    ctx.fillRect(4, 4, 3, 2);
  });
  skillIcon(SKILL_TEX.w_warcry, (ctx) => {
    ctx.fillStyle = '#f0aa55';
    ctx.fillRect(2, 5, 5, 6);
    ctx.fillRect(4, 3, 3, 2);
    ctx.fillStyle = '#4b2530';
    ctx.fillRect(5, 7, 3, 2);
    ctx.fillStyle = '#ffd86b';
    ctx.fillRect(9, 5, 2, 6);
    ctx.fillRect(12, 3, 2, 10);
  });
  skillIcon(SKILL_TEX.w_whirl, (ctx) => {
    ctx.fillStyle = '#8edcf2';
    ctx.fillRect(4, 2, 7, 2);
    ctx.fillRect(11, 4, 3, 6);
    ctx.fillRect(5, 12, 7, 2);
    ctx.fillRect(2, 7, 3, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(7, 5, 5, 2);
    ctx.fillRect(4, 9, 5, 2);
  });
  skillIcon(SKILL_TEX.w_quake, (ctx) => {
    ctx.fillStyle = '#d5ad63';
    ctx.fillRect(1, 10, 14, 4);
    ctx.fillStyle = '#fff0b0';
    ctx.fillRect(3, 8, 3, 3);
    ctx.fillRect(10, 7, 3, 4);
    ctx.fillStyle = '#513c42';
    ctx.fillRect(7, 3, 2, 6);
    ctx.fillRect(5, 5, 2, 2);
    ctx.fillRect(9, 7, 2, 2);
  });
  skillIcon(SKILL_TEX.w_calamity, (ctx) => {
    ctx.fillStyle = '#6d2841';
    ctx.fillRect(2, 3, 12, 10);
    ctx.fillStyle = '#f05f62';
    ctx.fillRect(7, 1, 3, 12);
    ctx.fillRect(4, 9, 9, 2);
    ctx.fillStyle = '#fff1c9';
    ctx.fillRect(8, 2, 1, 7);
    ctx.fillStyle = '#25213a';
    ctx.fillRect(7, 12, 3, 3);
  });
  skillIcon(SKILL_TEX.m_firebolt, (ctx) => {
    ctx.fillStyle = '#b84038';
    ctx.fillRect(2, 9, 4, 3);
    ctx.fillRect(4, 6, 5, 5);
    ctx.fillStyle = '#f27a38';
    ctx.fillRect(7, 4, 6, 7);
    ctx.fillRect(10, 2, 2, 3);
    ctx.fillStyle = '#ffe27a';
    ctx.fillRect(8, 6, 3, 3);
  });
  skillIcon(SKILL_TEX.m_frost, (ctx) => {
    ctx.fillStyle = '#a9edff';
    ctx.fillRect(7, 1, 2, 14);
    ctx.fillRect(1, 7, 14, 2);
    ctx.fillRect(3, 3, 2, 2);
    ctx.fillRect(11, 3, 2, 2);
    ctx.fillRect(3, 11, 2, 2);
    ctx.fillRect(11, 11, 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(7, 7, 2, 2);
  });
  skillIcon(SKILL_TEX.m_thunder, (ctx) => {
    ctx.fillStyle = '#fff08a';
    ctx.fillRect(8, 1, 5, 3);
    ctx.fillRect(6, 4, 5, 4);
    ctx.fillRect(4, 8, 5, 3);
    ctx.fillRect(2, 11, 5, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(9, 2, 2, 2);
  });
  skillIcon(SKILL_TEX.m_meteor, (ctx) => {
    ctx.fillStyle = '#f0a34c';
    ctx.fillRect(2, 2, 2, 6);
    ctx.fillRect(4, 4, 2, 6);
    ctx.fillStyle = '#f36a47';
    ctx.fillRect(6, 6, 7, 7);
    ctx.fillStyle = '#6a3b3a';
    ctx.fillRect(8, 8, 5, 5);
    ctx.fillStyle = '#ffd47a';
    ctx.fillRect(7, 7, 2, 2);
  });
  skillIcon(SKILL_TEX.c_smite, (ctx) => {
    ctx.fillStyle = '#f4dc7d';
    ctx.fillRect(7, 1, 2, 11);
    ctx.fillRect(3, 4, 10, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(6, 2, 4, 3);
    ctx.fillStyle = '#d8a84d';
    ctx.fillRect(4, 12, 8, 2);
  });
  skillIcon(SKILL_TEX.c_holylight, (ctx) => {
    ctx.fillStyle = '#8fe3a4';
    ctx.fillRect(6, 2, 4, 12);
    ctx.fillRect(2, 6, 12, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(7, 4, 2, 8);
    ctx.fillRect(4, 7, 8, 2);
  });
  skillIcon(SKILL_TEX.c_judgment, (ctx) => {
    ctx.fillStyle = '#ffe28a';
    ctx.fillRect(7, 1, 2, 10);
    ctx.fillRect(4, 3, 8, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(6, 2, 4, 3);
    ctx.fillStyle = '#d9b85f';
    ctx.fillRect(3, 12, 10, 2);
    ctx.fillRect(5, 10, 6, 2);
  });
  skillIcon(SKILL_TEX.c_genesis, (ctx) => {
    ctx.fillStyle = '#ffe68f';
    ctx.fillRect(6, 1, 4, 14);
    ctx.fillRect(1, 6, 14, 4);
    ctx.fillRect(3, 3, 10, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(6, 6, 4, 4);
  });
  skillIcon(SKILL_TEX.t_quickstab, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(5, 7, 9, 2);
    ctx.fillRect(11, 6, 3, 4);
    ctx.fillStyle = '#a99ae8';
    ctx.fillRect(3, 6, 2, 4);
    ctx.fillRect(1, 4, 4, 1);
    ctx.fillRect(1, 11, 5, 1);
  });
  skillIcon(SKILL_TEX.t_doublecut, (ctx) => {
    ctx.fillStyle = '#b8adff';
    for (let i = 0; i < 9; i++) {
      ctx.fillRect(2 + i, 2 + i, 2, 2);
      ctx.fillRect(12 - i, 2 + i, 2, 2);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(7, 7, 2, 2);
  });
  skillIcon(SKILL_TEX.t_shadowfang, (ctx) => {
    ctx.fillStyle = '#7153a6';
    ctx.fillRect(3, 2, 10, 6);
    ctx.fillRect(5, 8, 3, 6);
    ctx.fillRect(9, 8, 3, 4);
    ctx.fillStyle = '#d4c3ff';
    ctx.fillRect(5, 4, 2, 2);
    ctx.fillRect(10, 4, 2, 2);
  });
  skillIcon(SKILL_TEX.t_phantom, (ctx) => {
    ctx.fillStyle = '#7b67bd';
    ctx.fillRect(3, 3, 10, 9);
    ctx.fillRect(5, 1, 6, 2);
    ctx.fillStyle = '#e5ddff';
    ctx.fillRect(5, 6, 2, 2);
    ctx.fillRect(10, 6, 2, 2);
    ctx.fillRect(7, 10, 3, 2);
    ctx.fillStyle = '#4b3b73';
    ctx.fillRect(1, 5, 2, 6);
    ctx.fillRect(13, 5, 2, 6);
  });
  skillIcon(SKILL_TEX.b_beastclaw, (ctx) => {
    ctx.fillStyle = '#e0b784';
    for (let i = 0; i < 9; i++) {
      ctx.fillRect(3 + i, 2 + i, 2, 1);
      ctx.fillRect(1 + i, 5 + i, 2, 1);
      ctx.fillRect(7 + i, i, 1, 1);
    }
    ctx.fillStyle = '#fff0d1';
    ctx.fillRect(10, 3, 2, 2);
  });
  skillIcon(SKILL_TEX.b_volley, (ctx) => {
    ctx.fillStyle = '#d8e8ef';
    ctx.fillRect(2, 3, 10, 1);
    ctx.fillRect(2, 7, 12, 2);
    ctx.fillRect(2, 12, 10, 1);
    ctx.fillStyle = '#9dc5dd';
    ctx.fillRect(11, 2, 3, 3);
    ctx.fillRect(12, 6, 3, 4);
    ctx.fillRect(11, 11, 3, 3);
  });
  skillIcon(SKILL_TEX.b_stampede, (ctx) => {
    ctx.fillStyle = '#b88967';
    ctx.fillRect(3, 4, 4, 6);
    ctx.fillRect(9, 3, 4, 7);
    ctx.fillStyle = '#efd0a5';
    ctx.fillRect(4, 3, 2, 2);
    ctx.fillRect(10, 2, 2, 2);
    ctx.fillStyle = '#9e7b66';
    ctx.fillRect(1, 12, 13, 2);
    ctx.fillRect(4, 10, 2, 2);
    ctx.fillRect(10, 10, 2, 2);
  });
  skillIcon(SKILL_TEX.b_genesis, (ctx) => {
    ctx.fillStyle = '#d79bd9';
    ctx.fillRect(5, 7, 6, 6);
    ctx.fillRect(2, 3, 3, 4);
    ctx.fillRect(6, 1, 3, 4);
    ctx.fillRect(11, 3, 3, 4);
    ctx.fillStyle = '#fff0ff';
    ctx.fillRect(7, 8, 2, 3);
  });

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
      // Bright enamel frame used by the friendlier storybook-JRPG HUD.
      const grad = ctx.createLinearGradient(0, 0, 0, 48);
      grad.addColorStop(0, '#416b9b');
      grad.addColorStop(0.45, '#294f80');
      grad.addColorStop(1, '#17365f');
      ctx.fillStyle = grad;
      rr(1, 1, 46, 46, rad);
      ctx.fill();
      // Top sheen for a gentle glossy lift.
      ctx.fillStyle = 'rgba(255,248,218,0.16)';
      rr(3, 3, 42, 15, rad - 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,211,112,0.88)';
      ctx.lineWidth = 1.5;
      rr(1.5, 1.5, 45, 45, rad);
      ctx.stroke();
      // Faint inner keyline for a touch of depth.
      ctx.strokeStyle = 'rgba(255,247,220,0.24)';
      ctx.lineWidth = 1;
      rr(3, 3, 42, 42, rad - 2);
      ctx.stroke();
    },
    48,
    48,
  );

  // Chibi townsperson (~2.5 heads tall), parameterised by role. Big head + big
  // eyes + hairstyle + job prop + shaded clothes. Drawn crisp (fillRect only) so
  // it stays pixel-art. Coordinates are pre-translate (centred +16x, feet +14y →
  // feet ≈ y84 on the 96×96 frame). Ground shadow is the external §6 texture.
  interface NpcLook {
    skin: string; skinSh: string;
    hair: string; hairSh: string;
    hairStyle: 'short' | 'neat' | 'bun' | 'spiky' | 'bald';
    outfit: string; outfitSh: string; outfitHi: string; trim: string;
    prop: 'coin' | 'hammer' | 'book' | 'staff' | 'basket' | 'none';
    cap?: string; bandana?: string; hood?: string; apron?: string; beard?: string;
  }
  const OUTLINE = '#20182c';
  const drawNpc = (ctx: CanvasRenderingContext2D, o: NpcLook): void => {
    const px = (x: number, y: number, w: number, h: number, c: string): void => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
    // ── Back prop: staff (behind the body).
    if (o.prop === 'staff') {
      px(46, 26, 3, 44, '#6a4a2c');
      px(46, 30, 3, 1, '#8a6444');
      px(44, 23, 6, 6, OUTLINE);
      px(45, 24, 4, 4, '#8fe0ff');
      px(45, 24, 2, 2, '#e8fbff');
    }
    // ── Legs + boots.
    px(25, 55, 6, 12, o.outfitSh);
    px(33, 55, 6, 12, o.outfitSh);
    px(24, 66, 7, 4, OUTLINE);
    px(33, 66, 7, 4, OUTLINE);
    px(25, 66, 5, 1, '#4a3a2a');
    // ── Torso (outline → base → light/shade → collar).
    px(22, 36, 20, 20, OUTLINE);
    px(23, 37, 18, 18, o.outfit);
    px(23, 37, 6, 18, o.outfitHi); // top-left light
    px(37, 37, 4, 18, o.outfitSh); // right shade
    px(23, 52, 18, 3, o.outfitSh); // bottom shade
    px(26, 37, 12, 3, o.trim); // collar
    // ── Arms + hands.
    px(19, 38, 5, 15, o.outfitSh);
    px(41, 38, 5, 15, o.outfitSh);
    px(19, 38, 1, 15, OUTLINE);
    px(45, 38, 1, 15, OUTLINE);
    px(19, 51, 5, 4, o.skin);
    px(41, 51, 5, 4, o.skin);
    // ── Apron.
    if (o.apron) {
      px(28, 40, 8, 15, o.apron);
      px(28, 40, 8, 2, '#ffffff18');
      px(31, 40, 1, 15, '#00000018');
    }
    // ── Head (rounded silhouette via stepped rows: outline then skin inset).
    px(23, 14, 18, 1, OUTLINE);
    px(21, 15, 22, 2, OUTLINE);
    px(20, 17, 24, 16, OUTLINE);
    px(21, 33, 22, 2, OUTLINE);
    px(23, 35, 18, 2, OUTLINE);
    px(24, 15, 16, 1, o.skin);
    px(22, 16, 20, 2, o.skin);
    px(21, 18, 22, 15, o.skin);
    px(22, 33, 20, 2, o.skin);
    px(24, 35, 16, 1, o.skin);
    px(22, 17, 5, 3, '#ffffff18'); // forehead highlight
    px(38, 19, 3, 13, o.skinSh); // right cheek shade
    px(20, 24, 2, 4, o.skinSh); // ears
    px(42, 24, 2, 4, o.skinSh);
    // ── Hair / hood.
    if (o.hood) {
      px(19, 13, 26, 4, o.hood);
      px(19, 13, 26, 15, o.hood);
      px(23, 20, 18, 14, o.skin); // face opening
      px(38, 20, 3, 13, o.skinSh);
      px(19, 12, 26, 2, OUTLINE);
      px(19, 13, 26, 2, '#ffffff10');
    } else {
      if (o.hairStyle === 'short' || o.hairStyle === 'neat') {
        px(21, 13, 22, 5, o.hair);
        px(21, 16, 3, 8, o.hair);
        px(40, 16, 3, 8, o.hair);
        px(24, 17, 5, 2, o.hair); // bangs
        px(35, 17, 5, 2, o.hair);
        px(24, 13, 15, 2, '#ffffff18');
        if (o.hairStyle === 'neat') px(31, 13, 2, 4, o.hairSh); // side part
      } else if (o.hairStyle === 'bun') {
        px(21, 14, 22, 4, o.hair);
        px(21, 16, 3, 7, o.hair);
        px(40, 16, 3, 7, o.hair);
        px(28, 8, 8, 6, o.hair); // bun
        px(29, 9, 6, 2, '#ffffff20');
        px(27, 9, 2, 4, OUTLINE);
        px(35, 9, 2, 4, OUTLINE);
      } else if (o.hairStyle === 'spiky') {
        px(21, 18, 3, 8, o.hair); // side hair (rest hidden by bandana)
        px(40, 18, 3, 8, o.hair);
      }
    }
    // ── Cap / bandana (over hair).
    if (o.cap) {
      px(20, 13, 24, 4, OUTLINE);
      px(21, 14, 22, 2, o.cap);
      px(23, 7, 18, 7, o.cap);
      px(23, 7, 18, 2, '#ffffff20');
      px(22, 6, 20, 2, OUTLINE);
    }
    if (o.bandana) {
      px(20, 17, 24, 4, o.bandana);
      px(20, 17, 24, 1, '#ffffff22');
      px(18, 20, 3, 5, o.bandana); // knot tail
    }
    // ── Face: big eyes + blush + mouth.
    px(26, 26, 4, 6, '#2a2036');
    px(35, 26, 4, 6, '#2a2036');
    px(27, 27, 2, 2, '#ffffff');
    px(36, 27, 2, 2, '#ffffff');
    px(27, 30, 2, 1, '#6a74a0');
    px(36, 30, 2, 1, '#6a74a0');
    px(24, 31, 3, 2, 'rgba(230,150,150,0.45)');
    px(38, 31, 3, 2, 'rgba(230,150,150,0.45)');
    px(30, 33, 4, 1, '#b5654a');
    // ── Beard (over lower face).
    if (o.beard) {
      px(23, 32, 18, 5, o.beard);
      px(26, 37, 12, 3, o.beard);
      px(23, 32, 18, 1, '#ffffff18');
      px(30, 33, 4, 2, '#c9968a'); // mouth gap
    }
    // ── Front prop.
    if (o.prop === 'coin') {
      px(42, 47, 7, 8, '#a9741f');
      px(42, 47, 7, 2, '#c08a3a');
      px(43, 45, 5, 2, '#7a5216');
      px(44, 44, 3, 3, '#f5c542');
    } else if (o.prop === 'hammer') {
      px(44, 40, 3, 14, '#6a4a2c');
      px(41, 38, 9, 5, '#9aa0ac');
      px(41, 38, 9, 1, '#c6ccd8');
      px(41, 42, 9, 1, '#6a7080');
    } else if (o.prop === 'book') {
      px(26, 45, 13, 9, OUTLINE);
      px(27, 46, 11, 7, '#c0492f');
      px(32, 46, 1, 7, '#e8dcb0');
      px(28, 48, 4, 1, '#e8dcb0');
    } else if (o.prop === 'basket') {
      px(26, 50, 14, 8, OUTLINE);
      px(27, 51, 12, 6, '#a9741f');
      px(27, 51, 12, 1, '#c8933f');
      px(30, 51, 1, 6, '#7a5216');
      px(34, 51, 1, 6, '#7a5216');
      px(29, 49, 3, 2, '#d05a5a'); // apple
      px(34, 49, 2, 2, '#6db06a'); // veg
    }
  };

  const NPC_LOOKS: Record<string, NpcLook> = {
    [TEX.npcMerchant]: {
      skin: '#e8b088', skinSh: '#cf9468', hair: '#6a4326', hairSh: '#4a2c18',
      hairStyle: 'bun', outfit: '#3f9a5e', outfitSh: '#2c6b41', outfitHi: '#54b070',
      trim: '#f0d68a', apron: '#e2cf98', prop: 'coin',
    },
    [TEX.npcSmith]: {
      skin: '#d68a5b', skinSh: '#b06a40', hair: '#2a1c14', hairSh: '#160e08',
      hairStyle: 'spiky', outfit: '#7a4030', outfitSh: '#5a2c22', outfitHi: '#96503a',
      trim: '#c9722f', apron: '#3a3038', bandana: '#b0342e', prop: 'hammer',
    },
    [TEX.npcGuild]: {
      skin: '#ecbf96', skinSh: '#cf9e6c', hair: '#d8b04a', hairSh: '#a8842c',
      hairStyle: 'neat', outfit: '#3a5aa0', outfitSh: '#28407a', outfitHi: '#4e72c0',
      trim: '#e6c860', cap: '#2a3f78', prop: 'book',
    },
    [TEX.npcElder]: {
      skin: '#e2b892', skinSh: '#c69a70', hair: '#eef0f6', hairSh: '#c8c8d2',
      hairStyle: 'bald', outfit: '#6a4ea0', outfitSh: '#4c3778', outfitHi: '#8264c0',
      trim: '#caa8ff', hood: '#5a3f90', beard: '#eef0f6', prop: 'staff',
    },
    [TEX.npcVillager]: {
      skin: '#e8b088', skinSh: '#cf9468', hair: '#8a5a34', hairSh: '#66401f',
      hairStyle: 'short', outfit: '#b0683a', outfitSh: '#8a4e2a', outfitHi: '#c8824c',
      trim: '#e0b070', prop: 'basket',
    },
  };
  // Frame is 96×96 (matches CHAR_FRAME so real art drops in). The chibi is centred
  // (+16x) with feet on the standard anchor line (+14y → feet ≈ y84, origin 0.875),
  // so the external ground shadow sits under the feet.
  for (const [key, look] of Object.entries(NPC_LOOKS)) {
    make(key, (ctx) => { ctx.translate(16, 14); drawNpc(ctx, look); }, 96, 96);
  }
  // Back-compat generic NPC = villager look.
  make(TEX.npc, (ctx) => { ctx.translate(16, 14); drawNpc(ctx, NPC_LOOKS[TEX.npcVillager]); }, 96, 96);

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
