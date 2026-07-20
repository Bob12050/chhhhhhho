import { TEX } from '@/assets/gen/textures';
import { CHAR_FRAME_W, CHAR_FRAME_H } from '@/config/resolution';

/**
 * Optional real-art manifest. Drop PNGs into `public/assets/...` and they
 * replace the procedural placeholders with NO code change: Boot preloads each
 * entry under its final texture key; any file that is absent simply fails to
 * load and the generated placeholder is used instead (see boot-scene +
 * ensureGeneratedTextures, which only fills missing keys).
 *
 * Character/equipment/enemy sheets MUST follow the pose-atlas layout. Most
 * use 96x96 cells; HD variants may use larger cells while preserving the same
 * rows/columns (see docs/ART_SPEC.md).
 */
export interface AssetEntry {
  key: string;
  type: 'spritesheet' | 'image';
  src: string; // under public/, base-prefixed at load time
  frameWidth?: number;
  frameHeight?: number;
}

const sheet = (
  key: string,
  src: string,
  frameWidth = CHAR_FRAME_W,
  frameHeight = CHAR_FRAME_H,
): AssetEntry => ({
  key,
  type: 'spritesheet',
  src,
  frameWidth,
  frameHeight,
});
const img = (key: string, src: string): AssetEntry => ({ key, type: 'image', src });

export const ASSET_MANIFEST: AssetEntry[] = [
  // Paper-doll layers + enemy (pose-atlas spritesheets).
  sheet(TEX.playerBody, 'assets/char/player_body-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.playerBodyDiagonal, 'assets/char/player_body-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.playerBodyMale, 'assets/char/player_body-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.playerBodyMaleDiagonal, 'assets/char/player_body-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.playerBodyBald, 'assets/char/player_body_bald.png'),
  // Earlier sheets stay on disk as a rollback. V3 renders only the stable
  // head / precomposed outfit / weapon appearance slots.
  sheet(TEX.paperDollPilotBase, 'assets/paperdoll-pilot/base-cardinal-v3.png'),
  sheet(TEX.paperDollPilotBaseDiagonal, 'assets/paperdoll-pilot/base-diagonal-v3.png'),
  sheet(TEX.paperDollPilotHead, 'assets/paperdoll-pilot/helm-iron-cardinal-v3.png'),
  sheet(TEX.paperDollPilotHeadDiagonal, 'assets/paperdoll-pilot/helm-iron-diagonal-v3.png'),
  sheet(TEX.paperDollPilotOutfit, 'assets/paperdoll-pilot/outfit-iron-cardinal-v3.png'),
  sheet(TEX.paperDollPilotOutfitDiagonal, 'assets/paperdoll-pilot/outfit-iron-diagonal-v3.png'),
  sheet(TEX.paperDollPilotWeapon, 'assets/paperdoll-pilot/weapon-iron-cardinal-v3.png'),
  sheet(TEX.paperDollPilotWeaponDiagonal, 'assets/paperdoll-pilot/weapon-iron-diagonal-v3.png'),
  // Job-fixed appearance bodies (drop these PNGs to give a job its own look).
  sheet(TEX.jobFighter, 'assets/char/job_fighter-storybook-hd-v2.webp', 192, 192),
  sheet(TEX.jobFighterDiagonal, 'assets/char/job_fighter-diagonal-hd-v2.webp', 192, 192),
  sheet(TEX.jobMage, 'assets/char/job_mage-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobMageDiagonal, 'assets/char/job_mage-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobPriest, 'assets/char/job_priest-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobPriestDiagonal, 'assets/char/job_priest-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobThief, 'assets/char/job_thief-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobThiefDiagonal, 'assets/char/job_thief-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobPetRaiser, 'assets/char/job_pet_raiser-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobPetRaiserDiagonal, 'assets/char/job_pet_raiser-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobSamurai, 'assets/char/job_samurai-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobSamuraiDiagonal, 'assets/char/job_samurai-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobSorcerer, 'assets/char/job_sorcerer-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobSorcererDiagonal, 'assets/char/job_sorcerer-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobHolyKnight, 'assets/char/job_holy_knight-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobHolyKnightDiagonal, 'assets/char/job_holy_knight-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobNinja, 'assets/char/job_ninja-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobNinjaDiagonal, 'assets/char/job_ninja-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobRanger, 'assets/char/job_ranger-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobRangerDiagonal, 'assets/char/job_ranger-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobSwordKaiser, 'assets/char/job_sword_kaiser-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobSwordKaiserDiagonal, 'assets/char/job_sword_kaiser-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobGrandMagia, 'assets/char/job_grand_magia-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobGrandMagiaDiagonal, 'assets/char/job_grand_magia-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobShieldSaber, 'assets/char/job_shield_saber-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobShieldSaberDiagonal, 'assets/char/job_shield_saber-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobAvengista, 'assets/char/job_avengista-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobAvengistaDiagonal, 'assets/char/job_avengista-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobDualStar, 'assets/char/job_dual_star-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobDualStarDiagonal, 'assets/char/job_dual_star-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobAramikagura, 'assets/char/job_aramikagura-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobAramikaguraDiagonal, 'assets/char/job_aramikagura-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobAlvride, 'assets/char/job_alvride-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobAlvrideDiagonal, 'assets/char/job_alvride-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobNirvadio, 'assets/char/job_nirvadio-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobNirvadioDiagonal, 'assets/char/job_nirvadio-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobNoxtia, 'assets/char/job_noxtia-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobNoxtiaDiagonal, 'assets/char/job_noxtia-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobOltarie, 'assets/char/job_oltarie-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobOltarieDiagonal, 'assets/char/job_oltarie-diagonal-hd-v1.webp', 192, 192),
  // Male variants preserve the same pose grid and logical feet anchor.
  sheet(TEX.jobFighterMale, 'assets/char/job_fighter-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobFighterMaleDiagonal, 'assets/char/job_fighter-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobMageMale, 'assets/char/job_mage-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobMageMaleDiagonal, 'assets/char/job_mage-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobPriestMale, 'assets/char/job_priest-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobPriestMaleDiagonal, 'assets/char/job_priest-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobThiefMale, 'assets/char/job_thief-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobThiefMaleDiagonal, 'assets/char/job_thief-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobPetRaiserMale, 'assets/char/job_pet_raiser-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobPetRaiserMaleDiagonal, 'assets/char/job_pet_raiser-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobSamuraiMale, 'assets/char/job_samurai-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobSamuraiMaleDiagonal, 'assets/char/job_samurai-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobSorcererMale, 'assets/char/job_sorcerer-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobSorcererMaleDiagonal, 'assets/char/job_sorcerer-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobHolyKnightMale, 'assets/char/job_holy_knight-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobHolyKnightMaleDiagonal, 'assets/char/job_holy_knight-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobNinjaMale, 'assets/char/job_ninja-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobNinjaMaleDiagonal, 'assets/char/job_ninja-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobRangerMale, 'assets/char/job_ranger-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobRangerMaleDiagonal, 'assets/char/job_ranger-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobSwordKaiserMale, 'assets/char/job_sword_kaiser-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobSwordKaiserMaleDiagonal, 'assets/char/job_sword_kaiser-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobGrandMagiaMale, 'assets/char/job_grand_magia-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobGrandMagiaMaleDiagonal, 'assets/char/job_grand_magia-male-diagonal-hd-v2.webp', 192, 192),
  sheet(TEX.jobShieldSaberMale, 'assets/char/job_shield_saber-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobShieldSaberMaleDiagonal, 'assets/char/job_shield_saber-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobAvengistaMale, 'assets/char/job_avengista-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobAvengistaMaleDiagonal, 'assets/char/job_avengista-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobDualStarMale, 'assets/char/job_dual_star-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobDualStarMaleDiagonal, 'assets/char/job_dual_star-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobAramikaguraMale, 'assets/char/job_aramikagura-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobAramikaguraMaleDiagonal, 'assets/char/job_aramikagura-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobAlvrideMale, 'assets/char/job_alvride-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobAlvrideMaleDiagonal, 'assets/char/job_alvride-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobNirvadioMale, 'assets/char/job_nirvadio-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobNirvadioMaleDiagonal, 'assets/char/job_nirvadio-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobNoxtiaMale, 'assets/char/job_noxtia-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobNoxtiaMaleDiagonal, 'assets/char/job_noxtia-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.jobOltarieMale, 'assets/char/job_oltarie-male-storybook-hd-v1.webp', 192, 192),
  sheet(TEX.jobOltarieMaleDiagonal, 'assets/char/job_oltarie-male-diagonal-hd-v1.webp', 192, 192),
  sheet(TEX.capLeather, 'assets/equip/cap_leather.png'),
  sheet(TEX.helmIron, 'assets/equip/helm_iron.png'),
  sheet(TEX.vestCloth, 'assets/equip/vest_cloth.png'),
  sheet(TEX.plateIron, 'assets/equip/plate_iron.png'),
  sheet(TEX.swordWood, 'assets/equip/sword_wood.png'),
  sheet(TEX.swordIron, 'assets/equip/sword_iron.png'),
  // Enemies. A single 96×96 PNG drops in as a static sprite (Enemy detects the
  // single frame and skips frame-cycling); a full pose-atlas sheet animates.
  sheet(TEX.slime, 'assets/enemy/slime-storybook-v3.png'),
  sheet(TEX.slimeRoyal, 'assets/enemy/slime-royal-storybook-v2.png'),
  sheet(TEX.bat, 'assets/enemy/bat-storybook-v2.png'),
  sheet(TEX.wolf, 'assets/enemy/wolf-storybook-v2.png'),
  sheet(TEX.mushroom, 'assets/enemy/mushroom-storybook-v2.png'),
  sheet(TEX.golem, 'assets/enemy/golem-storybook-v2.png'),
  sheet(TEX.lizard, 'assets/enemy/lizard-storybook-v2.png'),
  sheet(TEX.wisp, 'assets/enemy/wisp-storybook-v2.png'),
  sheet(TEX.knight, 'assets/enemy/knight-storybook-v2.png'),
  sheet(TEX.treant, 'assets/enemy/treant-storybook-v2.png'),
  sheet(TEX.dragon, 'assets/enemy/dragon-storybook-v2.png'),
  // AI-art-only bosses (fallback alias in ensureGeneratedTextures).
  // Zephys is loaded as a static image; its configured scale owns the arena size.
  img(TEX.zephys, 'assets/enemy/zephys-storybook-v2.png'),
  sheet(TEX.hydra, 'assets/enemy/hydra-storybook-v2.png'),
  sheet(TEX.sandgoa, 'assets/enemy/sandgoa-storybook-v2.png'),
  sheet(TEX.almagia, 'assets/enemy/almagia-storybook-v2.png'),
  // Environment (single images).
  img(TEX.tileGrass, 'assets/tiles/grass.png'),
  img(TEX.tileGrass2, 'assets/tiles/grass2.png'),
  img(TEX.tilePath, 'assets/tiles/path.png'),
  img(TEX.tileStone, 'assets/tiles/stone.png'),
  img(TEX.tileFloor, 'assets/tiles/floor.png'),
  // Versioned filenames force mobile Safari to discard the previous narrow
  // backgrounds when the painted map dimensions change.
  img(TEX.townMap, 'assets/maps/town-pixel-plaza-hd-v1.webp'),
  img(TEX.fieldMap, 'assets/maps/field-pixel-plaza-hd-v1.webp'),
  img(TEX.forestMap, 'assets/maps/forest-pixel-plaza-hd-v1.webp'),
  img(TEX.dungeonMap, 'assets/maps/dungeon-pixel-plaza-hd-v1.webp'),
  img(TEX.canyonMap, 'assets/maps/canyon-pixel-plaza-hd-v1.webp'),
  img(TEX.volcanoMap, 'assets/maps/volcano-pixel-plaza-hd-v1.webp'),
  img(TEX.snowfieldMap, 'assets/maps/snowfield-pixel-plaza-hd-v1.webp'),
  img(TEX.desertMap, 'assets/maps/desert-pixel-plaza-hd-v1.webp'),
  img(TEX.arenaMap, 'assets/maps/arena-plain-pixel-plaza-hd-v1.webp'),
  img(TEX.arenaGroveMap, 'assets/maps/arena-grove-pixel-plaza-hd-v1.webp'),
  img(TEX.arenaVolcanoMap, 'assets/maps/arena-volcano-pixel-plaza-hd-v1.webp'),
  img(TEX.arenaFrostMap, 'assets/maps/arena-frost-pixel-plaza-hd-v1.webp'),
  img(TEX.arenaCavernMap, 'assets/maps/arena-cavern-pixel-plaza-hd-v1.webp'),
  img(TEX.arenaSwampMap, 'assets/maps/arena-swamp-pixel-plaza-hd-v1.webp'),
  img(TEX.arenaRuinsMap, 'assets/maps/arena-ruins-pixel-plaza-hd-v1.webp'),
  img(TEX.arenaAbyssMap, 'assets/maps/arena-abyss-pixel-plaza-hd-v1.webp'),
  img(TEX.treantRootLane, 'assets/fx/treant-root-lane-v1.png'),
  img(TEX.obstacle, 'assets/env/obstacle.png'),
  img(TEX.wall, 'assets/env/wall.png'),
  img(TEX.npc, 'assets/env/npc-storybook-v2.png'),
  // Compact role-specific town NPCs matched to the low-density plaza art.
  img(TEX.npcMerchant, 'assets/env/npc_merchant-pixel-plaza-v1.png'),
  img(TEX.npcSmith, 'assets/env/npc_craft-pixel-plaza-v1.png'),
  img(TEX.npcGuild, 'assets/env/npc_guild-pixel-plaza-v1.png'),
  img(TEX.npcElder, 'assets/env/npc_elder-pixel-plaza-v1.png'),
  img(TEX.npcVillager, 'assets/env/npc_villager-pixel-plaza-v1.png'),
  img(TEX.npcQuest, 'assets/env/npc_quest-pixel-plaza-v1.png'),
  img(TEX.sign, 'assets/env/sign.png'),
  img(TEX.groundShadow, 'assets/env/shadow.png'),
  // Generated menu skin. The frame is a 48x48 nine-slice; the ribbon is a
  // transparent horizontal nine-slice used by headers and command buttons.
  img(TEX.uiFrame, 'assets/ui/frame-storybook-v1.png'),
  img(TEX.uiMenuBackdrop, 'assets/ui/menu-backdrop-storybook-v1.webp'),
  img(TEX.uiMapBackdrop, 'assets/ui/map-backdrop-storybook-v1.webp'),
  img(TEX.uiCraftingBackdrop, 'assets/ui/crafting-workshop-storybook-v1.webp'),
  img(TEX.uiRibbonFrame, 'assets/ui/ribbon-frame-storybook-v1.png'),
  img(TEX.hudStatusPlazaFrame, 'assets/ui/hud-status-pixel-plaza-v1.png'),
  img(TEX.titleBackdrop, 'assets/ui/title-backdrop-storybook-hd-v1.webp'),
  img(TEX.titleEmblem, 'assets/ui/title-emblem-storybook-v1.png'),
  // Cohesive illustrated battle HUD. Dynamic values/icons remain code-driven;
  // these transparent bezels supply the production-quality material finish.
  img(TEX.hudStatusFrame, 'assets/ui/hud-status-frame.png'),
  img(TEX.hudQuestFrame, 'assets/ui/hud-quest-frame.png'),
  img(TEX.hudMinimapFrame, 'assets/ui/hud-minimap-frame.png'),
  img(TEX.hudStickBase, 'assets/ui/hud-stick-base.png'),
  img(TEX.hudActionButton, 'assets/ui/hud-action-button.png'),
  img(TEX.hudUtilityButton, 'assets/ui/hud-utility-button.png'),
  img(TEX.npcInteractMarker, 'assets/ui/npc-interact-marker-v1.png'),
];
