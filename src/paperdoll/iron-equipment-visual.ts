import type Phaser from 'phaser';
import { TEX } from '@/assets/gen/textures';
import type { DrawGroup } from '@/config/layers';
import type { IronEquipmentAppearance } from '@/paperdoll/iron-equipment';
import { PaperDollAnimator } from '@/paperdoll/paper-doll-animator';

export const IRON_APPEARANCE_GROUPS: readonly DrawGroup[] = [
  'base_body',
  'feet',
  'torso',
  'far_hand',
  'far_weapon',
  'head',
  'near_hand',
  'near_weapon',
  'front_accessory',
  'front_effect',
];

const REQUIRED_TEXTURES = [
  TEX.paperDollPilotBase,
  TEX.paperDollPilotBaseDiagonal,
  TEX.paperDollPilotHead,
  TEX.paperDollPilotHeadDiagonal,
  TEX.paperDollPilotTorso,
  TEX.paperDollPilotTorsoDiagonal,
  TEX.paperDollPilotNearHand,
  TEX.paperDollPilotNearHandDiagonal,
  TEX.paperDollPilotFeet,
  TEX.paperDollPilotFeetDiagonal,
  TEX.paperDollPilotSword,
  TEX.paperDollPilotSwordDiagonal,
  TEX.paperDollPilotShield,
  TEX.paperDollPilotShieldDiagonal,
] as const;

export function ironEquipmentTexturesAvailable(scene: Phaser.Scene): boolean {
  return REQUIRED_TEXTURES.every((key) => scene.textures.exists(key));
}

export function clearIronEquipmentAppearance(doll: PaperDollAnimator): void {
  for (const group of IRON_APPEARANCE_GROUPS) doll.setLayer(group, null);
}

export function applyIronEquipmentAppearance(
  doll: PaperDollAnimator,
  state: IronEquipmentAppearance,
): void {
  doll.setLayer('base_body', TEX.paperDollPilotBase, {
    diagonalTextureKey: TEX.paperDollPilotBaseDiagonal,
  });
  setPart(doll, 'head', state.head, TEX.paperDollPilotHead, TEX.paperDollPilotHeadDiagonal);
  setPart(doll, 'torso', state.torso, TEX.paperDollPilotTorso, TEX.paperDollPilotTorsoDiagonal);
  setPart(doll, 'near_hand', state.hands, TEX.paperDollPilotNearHand, TEX.paperDollPilotNearHandDiagonal);
  setPart(doll, 'feet', state.feet, TEX.paperDollPilotFeet, TEX.paperDollPilotFeetDiagonal);
  // Weapon layers contain their gripping hands, so they stay in the two
  // always-front groups instead of disappearing behind the body when facing up.
  setPart(doll, 'front_effect', state.sword, TEX.paperDollPilotSword, TEX.paperDollPilotSwordDiagonal);
  setPart(doll, 'front_accessory', state.shield, TEX.paperDollPilotShield, TEX.paperDollPilotShieldDiagonal);
}

function setPart(
  doll: PaperDollAnimator,
  group: DrawGroup,
  visible: boolean,
  cardinalTextureKey: string,
  diagonalTextureKey: string,
): void {
  doll.setLayer(group, visible ? cardinalTextureKey : null, {
    diagonalTextureKey: visible ? diagonalTextureKey : null,
  });
}
