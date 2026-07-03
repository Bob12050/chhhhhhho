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
  sheet(TEX.playerBody, 'assets/char/player_body.png'),
  sheet(TEX.playerBodyBald, 'assets/char/player_body_bald.png'),
  // Job-fixed appearance bodies (drop these PNGs to give a job its own look).
  sheet(TEX.jobFighter, 'assets/char/job_fighter.png'),
  sheet(TEX.jobMage, 'assets/char/job_mage.png'),
  sheet(TEX.jobPriest, 'assets/char/job_priest.png'),
  sheet(TEX.jobThief, 'assets/char/job_thief.png'),
  sheet(TEX.jobPetRaiser, 'assets/char/job_pet_raiser.png'),
  sheet(TEX.capLeather, 'assets/equip/cap_leather.png'),
  sheet(TEX.helmIron, 'assets/equip/helm_iron.png'),
  sheet(TEX.vestCloth, 'assets/equip/vest_cloth.png'),
  sheet(TEX.plateIron, 'assets/equip/plate_iron.png'),
  sheet(TEX.swordWood, 'assets/equip/sword_wood.png'),
  sheet(TEX.swordIron, 'assets/equip/sword_iron.png'),
  sheet(TEX.slime, 'assets/enemy/slime.png'),
  // Environment (single images).
  img(TEX.tileGrass, 'assets/tiles/grass.png'),
  img(TEX.tilePath, 'assets/tiles/path.png'),
  img(TEX.tileStone, 'assets/tiles/stone.png'),
  img(TEX.tileFloor, 'assets/tiles/floor.png'),
  img(TEX.obstacle, 'assets/env/obstacle.png'),
  img(TEX.wall, 'assets/env/wall.png'),
  img(TEX.npc, 'assets/env/npc.png'),
  // Role-specific town NPCs (drop real art to replace the placeholders).
  img(TEX.npcMerchant, 'assets/env/npc_merchant.png'),
  img(TEX.npcSmith, 'assets/env/npc_smith.png'),
  img(TEX.npcGuild, 'assets/env/npc_guild.png'),
  img(TEX.npcElder, 'assets/env/npc_elder.png'),
  img(TEX.npcVillager, 'assets/env/npc_villager.png'),
  img(TEX.sign, 'assets/env/sign.png'),
  // UI: one 9-slice frame drives every menu panel (48x48, ~16px corners).
  img(TEX.uiFrame, 'assets/ui/frame.png'),
];
