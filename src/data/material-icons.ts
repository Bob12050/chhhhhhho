export const MATERIAL_ICON_TEXTURES = {
  jelly: 'gen.icon.material.jelly',
  pelt: 'gen.icon.material.pelt',
  ore: 'gen.icon.material.ore',
  metal: 'gen.icon.material.metal',
  herb: 'gen.icon.material.herb',
  wood_sap: 'gen.icon.material.wood_sap',
  fang: 'gen.icon.material.fang',
  claw: 'gen.icon.material.claw',
  horn: 'gen.icon.material.horn',
  wing: 'gen.icon.material.wing',
  feather: 'gen.icon.material.feather',
  scale: 'gen.icon.material.scale',
  carapace: 'gen.icon.material.carapace',
  core: 'gen.icon.material.core',
  orb: 'gen.icon.material.orb',
  crystal: 'gen.icon.material.crystal',
  spore: 'gen.icon.material.spore',
  machine: 'gen.icon.material.machine',
  sand: 'gen.icon.material.sand',
  proof: 'gen.icon.material.proof',
} as const;

export type MaterialIconKind = keyof typeof MATERIAL_ICON_TEXTURES;

/**
 * Material silhouettes are intentionally shared by category. Rarity remains a
 * separate tint so, for example, every jelly uses one recognisable shape.
 */
const MATERIAL_ICON_KIND_BY_ID: Readonly<Record<string, MaterialIconKind>> = {
  slime_jelly: 'jelly',
  king_jelly: 'jelly',
  royal_ichor: 'jelly',
  crown_droplet: 'jelly',
  abyss_dreg: 'jelly',
  aurum_jelly: 'jelly',

  soft_leather: 'pelt',
  alpha_pelt: 'pelt',
  skoll_pelt: 'pelt',

  iron_ore: 'ore',
  mythril_ore: 'ore',
  guardian_keystone: 'ore',

  steel_ingot: 'metal',
  soul_iron: 'metal',
  dread_crownpiece: 'metal',

  herb: 'herb',

  treant_sap: 'wood_sap',
  lord_hardwood: 'wood_sap',
  dross_rotwood: 'wood_sap',

  night_fang: 'fang',
  garo_fang: 'fang',
  alpha_fang: 'fang',
  moon_fang: 'fang',
  hydra_fang: 'fang',
  ignigaro_fang: 'fang',

  flame_talon: 'claw',

  garo_horn: 'horn',
  skoll_thunder_horn: 'horn',

  shadow_wing: 'wing',
  lord_wing: 'wing',
  dragon_wing: 'wing',
  cruor_wing: 'wing',

  gale_feather: 'feather',
  gale_tailfeather: 'feather',
  sky_crown: 'feather',

  dragon_scale: 'scale',
  garo_scale: 'scale',
  dragon_gekirin: 'scale',
  hydra_scale: 'scale',
  varganos_scale: 'scale',

  dread_carapace: 'carapace',
  lux_carapace: 'carapace',

  golem_core: 'core',
  flame_core: 'core',
  frost_heart: 'core',
  abyss_core: 'core',
  stone_heart: 'core',
  venom_core: 'core',
  abyss_truecore: 'core',
  sand_core: 'core',
  sand_heart: 'core',
  azure_core: 'core',
  flarelis_core: 'core',
  crimson_core: 'core',

  spirit_amber: 'orb',
  earth_coreorb: 'orb',
  night_ruby: 'orb',
  royal_pearl: 'orb',
  flame_guren: 'orb',
  hydra_orb: 'orb',

  mana_stone: 'crystal',
  star_fragment: 'crystal',
  obsidian_shard: 'crystal',
  queen_ice: 'crystal',
  eternal_ice: 'crystal',
  investigation_crystal: 'crystal',

  spore_sac: 'spore',
  mother_cap: 'spore',
  miasma_sac: 'spore',

  ancient_gear: 'machine',
  magia_plate: 'machine',
  magia_reactor: 'machine',

  sand_gold: 'sand',

  hunt_proof_royal_slime: 'proof',
  hunt_proof_treant: 'proof',
  hunt_proof_stone: 'proof',
  hunt_proof_dragon: 'proof',
  hunt_proof_vurm: 'proof',
  hunt_proof_nox: 'proof',
  hunt_proof_fenrir: 'proof',
  hunt_proof_spora: 'proof',
  hunt_proof_garo: 'proof',
  hunt_proof_elemental_queen: 'proof',
  hunt_proof_mordo: 'proof',
  hunt_proof_abyss: 'proof',
  hunt_proof_zephys: 'proof',
  hunt_proof_hydra: 'proof',
  hunt_proof_skoll: 'proof',
  hunt_proof_sandgoa: 'proof',
  hunt_proof_almagia: 'proof',
  investigation_seal: 'proof',
};

export function materialIconKind(itemId: string): MaterialIconKind | undefined {
  return MATERIAL_ICON_KIND_BY_ID[itemId];
}

export function materialIconTexture(itemId: string): string {
  const kind = materialIconKind(itemId) ?? 'crystal';
  return MATERIAL_ICON_TEXTURES[kind];
}
