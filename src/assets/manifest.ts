import { TEX } from '@/assets/gen/textures';
import { CHAR_FRAME_W, CHAR_FRAME_H } from '@/config/resolution';

/**
 * Optional real-art manifest. Drop PNGs into `public/assets/...` and they
 * replace the procedural placeholders with NO code change: Boot preloads each
 * entry under its final texture key; any file that is absent simply fails to
 * load and the generated placeholder is used instead (see boot-scene +
 * ensureGeneratedTextures, which only fills missing keys).
 *
 * Character/equipment/enemy sheets MUST follow the pose-atlas layout
 * (96x96 frames, rows = direction x animation; see docs/ART_SPEC.md).
 */
export interface AssetEntry {
  key: string;
  type: 'spritesheet' | 'image';
  src: string; // under public/, base-prefixed at load time
  frameWidth?: number;
  frameHeight?: number;
}

const sheet = (key: string, src: string): AssetEntry => ({
  key,
  type: 'spritesheet',
  src,
  frameWidth: CHAR_FRAME_W,
  frameHeight: CHAR_FRAME_H,
});
const img = (key: string, src: string): AssetEntry => ({ key, type: 'image', src });

export const ASSET_MANIFEST: AssetEntry[] = [
  // Paper-doll layers + enemy (pose-atlas spritesheets).
  sheet(TEX.playerBody, 'assets/char/player_body-storybook-v2.png'),
  sheet(TEX.playerBodyBald, 'assets/char/player_body_bald.png'),
  // Job-fixed appearance bodies (drop these PNGs to give a job its own look).
  sheet(TEX.jobFighter, 'assets/char/job_fighter-storybook-v2.png'),
  sheet(TEX.jobMage, 'assets/char/job_mage-storybook-v2.png'),
  sheet(TEX.jobPriest, 'assets/char/job_priest-storybook-v2.png'),
  sheet(TEX.jobThief, 'assets/char/job_thief-storybook-v2.png'),
  sheet(TEX.jobPetRaiser, 'assets/char/job_pet_raiser-storybook-v2.png'),
  sheet(TEX.capLeather, 'assets/equip/cap_leather.png'),
  sheet(TEX.helmIron, 'assets/equip/helm_iron.png'),
  sheet(TEX.vestCloth, 'assets/equip/vest_cloth.png'),
  sheet(TEX.plateIron, 'assets/equip/plate_iron.png'),
  sheet(TEX.swordWood, 'assets/equip/sword_wood.png'),
  sheet(TEX.swordIron, 'assets/equip/sword_iron.png'),
  // Enemies. A single 96×96 PNG drops in as a static sprite (Enemy detects the
  // single frame and skips frame-cycling); a full pose-atlas sheet animates.
  sheet(TEX.slime, 'assets/enemy/slime.png'),
  sheet(TEX.bat, 'assets/enemy/bat.png'),
  sheet(TEX.wolf, 'assets/enemy/wolf.png'),
  sheet(TEX.mushroom, 'assets/enemy/mushroom.png'),
  sheet(TEX.golem, 'assets/enemy/golem.png'),
  sheet(TEX.lizard, 'assets/enemy/lizard.png'),
  sheet(TEX.wisp, 'assets/enemy/wisp.png'),
  sheet(TEX.knight, 'assets/enemy/knight.png'),
  sheet(TEX.treant, 'assets/enemy/treant.png'),
  sheet(TEX.dragon, 'assets/enemy/dragon.png'),
  // AI-art-only bosses (fallback alias in ensureGeneratedTextures).
  // Zephys is a single large illustration rather than a pose sheet, so the
  // enemy renderer keeps it static and lets its configured scale own the arena.
  img(TEX.zephys, 'assets/enemy/zephys-hunt.png'),
  sheet(TEX.hydra, 'assets/enemy/hydra.png'),
  sheet(TEX.sandgoa, 'assets/enemy/sandgoa.png'),
  sheet(TEX.almagia, 'assets/enemy/almagia.png'),
  // Environment (single images).
  img(TEX.tileGrass, 'assets/tiles/grass.png'),
  img(TEX.tileGrass2, 'assets/tiles/grass2.png'),
  img(TEX.tilePath, 'assets/tiles/path.png'),
  img(TEX.tileStone, 'assets/tiles/stone.png'),
  img(TEX.tileFloor, 'assets/tiles/floor.png'),
  img(TEX.townMap, 'assets/maps/town-storybook.png'),
  img(TEX.fieldMap, 'assets/maps/field-storybook.png'),
  img(TEX.forestMap, 'assets/maps/forest-storybook.png'),
  img(TEX.dungeonMap, 'assets/maps/dungeon-storybook.png'),
  img(TEX.canyonMap, 'assets/maps/canyon-storybook.png'),
  img(TEX.volcanoMap, 'assets/maps/volcano-storybook.png'),
  img(TEX.snowfieldMap, 'assets/maps/snowfield-storybook.png'),
  img(TEX.desertMap, 'assets/maps/desert-storybook.png'),
  img(TEX.arenaMap, 'assets/maps/arena-storybook.png'),
  img(TEX.obstacle, 'assets/env/obstacle.png'),
  img(TEX.wall, 'assets/env/wall.png'),
  img(TEX.npc, 'assets/env/npc-storybook-v2.png'),
  // Role-specific town NPCs (drop real art to replace the placeholders).
  img(TEX.npcMerchant, 'assets/env/npc_merchant-storybook-v2.png'),
  // 鍛冶屋(craft) NPC: AI生成PNG差し替えテスト対象。
  // があればそれを優先、無ければコード生成のチビにフォールバック（96×96・透明）。
  img(TEX.npcSmith, 'assets/env/npc_craft-storybook-v2.png'),
  img(TEX.npcGuild, 'assets/env/npc_guild-storybook-v2.png'),
  img(TEX.npcElder, 'assets/env/npc_elder-storybook-v2.png'),
  img(TEX.npcVillager, 'assets/env/npc_villager-storybook-v2.png'),
  img(TEX.sign, 'assets/env/sign.png'),
  img(TEX.groundShadow, 'assets/env/shadow.png'),
  // UI: one 9-slice frame drives every menu panel (48x48, ~16px corners).
  img(TEX.uiFrame, 'assets/ui/frame.png'),
];
