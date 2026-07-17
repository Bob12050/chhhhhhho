import { allEnemyDefs, getEnemyDef, type EnemyDef } from '@/enemies/enemy-defs';
import { allMaps, getMap } from '@/maps/map-def';
import { allQuests } from '@/quests/quest-defs';
import { getDropTable } from '@/loot/drop-table';
import { allRecipes } from '@/crafting/recipes';
import { getBossRareExchangeForDropTable } from '@/crafting/boss-rare-exchange';
import { allBossSetBonuses } from '@/equipment/boss-set-bonuses';
import { getEquipment, itemDisplayName } from '@/data/items';

export interface BestiaryRegionReward {
  gold: number;
  materialId: string;
  quantity: number;
}

export interface BestiaryRegionDef {
  id: string;
  name: string;
  hint: string;
  accent: number;
  enemyIds: readonly string[];
  reward: BestiaryRegionReward;
}

export interface BestiaryRegionProgress {
  found: number;
  total: number;
  ratio: number;
  complete: boolean;
}

export interface BestiaryHabitatGuide {
  short: string;
  undiscovered: string;
  discovered: string;
  rank?: number;
}

export interface BestiaryEquipmentGuide {
  title: string;
  itemIds: string[];
}

export const BESTIARY_REGIONS: readonly BestiaryRegionDef[] = [
  {
    id: 'grassland',
    name: '草原地方',
    hint: 'みどりの草原と平原の狩猟地',
    accent: 0x72bd69,
    enemyIds: ['slime', 'bat', 'boss_zephys', 'boss_wolf_alpha', 'boss_skoll'],
    reward: { gold: 500, materialId: 'sky_crown', quantity: 1 },
  },
  {
    id: 'forest',
    name: '森と湿地',
    hint: 'ささやきの森と沼地の狩猟地',
    accent: 0x4f9d67,
    enemyIds: [
      'green_wolf', 'cap_shroom', 'boss_treant', 'boss_dross', 'boss_mushroom',
      'boss_miasma', 'boss_hydra', 'boss_slime', 'boss_aurum',
    ],
    reward: { gold: 800, materialId: 'spirit_amber', quantity: 1 },
  },
  {
    id: 'cavern',
    name: '洞窟と渓谷',
    hint: 'うすぐらい洞窟とひびわれ渓谷',
    accent: 0x9b8668,
    enemyIds: [
      'golem', 'rock_lizard', 'cave_bat', 'boss_stone', 'boss_obsidion',
      'boss_lizard_king',
    ],
    reward: { gold: 1200, materialId: 'earth_coreorb', quantity: 1 },
  },
  {
    id: 'volcano',
    name: '火山と竜峰',
    hint: '灼熱の火山と竜の巣',
    accent: 0xd66b43,
    enemyIds: [
      'flame_hound', 'boss_flame', 'boss_azvurm', 'boss_ignigaro',
      'boss_dragon', 'boss_varganos',
    ],
    reward: { gold: 1800, materialId: 'flame_guren', quantity: 1 },
  },
  {
    id: 'snowfield',
    name: '雪原と氷域',
    hint: '凍てつく雪原と氷霜の聖域',
    accent: 0x79c9df,
    enemyIds: [
      'frost_wisp', 'ice_wolf', 'snow_shroom', 'frost_knight',
      'boss_wisp_queen', 'boss_flarelis',
    ],
    reward: { gold: 2200, materialId: 'eternal_ice', quantity: 1 },
  },
  {
    id: 'desert',
    name: '星降りの砂漠',
    hint: '砂漠と断崖の狩猟地',
    accent: 0xd6b35b,
    enemyIds: ['sand_lizard', 'mirage_wisp', 'dune_golem', 'boss_sandgoa'],
    reward: { gold: 2600, materialId: 'sand_heart', quantity: 1 },
  },
  {
    id: 'night',
    name: '夜と古城',
    hint: '常闇の祭壇と古城の広間',
    accent: 0x8972bb,
    enemyIds: [
      'shadow_knight', 'boss_bat_lord', 'boss_cruor', 'boss_knight_dread',
      'boss_luxmordo',
    ],
    reward: { gold: 3200, materialId: 'dread_crownpiece', quantity: 1 },
  },
  {
    id: 'abyss',
    name: '深淵',
    hint: '★7で開かれる最深部の狩猟地',
    accent: 0xc05278,
    enemyIds: ['boss_slime_abyss', 'boss_crimson_abyss', 'boss_almagia'],
    reward: { gold: 5000, materialId: 'abyss_truecore', quantity: 1 },
  },
];

const regionByEnemy = new Map<string, BestiaryRegionDef>();
for (const region of BESTIARY_REGIONS) {
  for (const enemyId of region.enemyIds) regionByEnemy.set(enemyId, region);
}

export function bestiaryRegionForEnemy(enemyId: string): BestiaryRegionDef | undefined {
  return regionByEnemy.get(enemyId);
}

export function bestiaryRegionEnemies(region: BestiaryRegionDef): EnemyDef[] {
  return region.enemyIds
    .map((id) => getEnemyDef(id))
    .filter((enemy): enemy is EnemyDef => !!enemy);
}

export function bestiaryRegionProgress(
  region: BestiaryRegionDef,
  killCounts: Readonly<Record<string, number>>,
): BestiaryRegionProgress {
  const total = region.enemyIds.length;
  const found = region.enemyIds.filter((id) => (killCounts[id] ?? 0) > 0).length;
  return {
    found,
    total,
    ratio: total > 0 ? found / total : 0,
    complete: total > 0 && found === total,
  };
}

export function bestiaryRewardFlag(regionId: string): string {
  return `bestiary_region_reward_${regionId}`;
}

interface BestiaryRewardState {
  killCounts: Readonly<Record<string, number>>;
  flags: Record<string, boolean>;
  addGold(amount: number): void;
  addMaterial(id: string, quantity: number): void;
}

export function claimBestiaryRegionReward(
  state: BestiaryRewardState,
  region: BestiaryRegionDef,
): boolean {
  const flag = bestiaryRewardFlag(region.id);
  if (state.flags[flag] || !bestiaryRegionProgress(region, state.killCounts).complete) return false;
  state.flags[flag] = true;
  state.addGold(region.reward.gold);
  state.addMaterial(region.reward.materialId, region.reward.quantity);
  return true;
}

export function bestiaryHabitatGuide(enemyId: string): BestiaryHabitatGuide {
  const fieldMaps = allMaps().filter((map) => map.enemies?.some((enemy) => enemy.type === enemyId));
  if (fieldMaps.length > 0) {
    const names = fieldMaps.map((map) => map.name);
    return {
      short: names.length > 1 ? `${names[0]}ほか` : names[0],
      undiscovered: `${names.join('・')}を探索`,
      discovered: names.join('・'),
    };
  }

  const hunt = allQuests()
    .filter((quest) => quest.huntMap && quest.objectives.some((objective) => objective.enemyId === enemyId))
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0];
  if (hunt?.huntMap) {
    const mapName = getMap(hunt.huntMap)?.name ?? '大型狩猟地';
    const rank = hunt.rank ?? 1;
    return {
      short: `★${rank} 大型狩猟`,
      undiscovered: `★${rank}の依頼・${mapName}で遭遇`,
      discovered: `${mapName} / ${hunt.name}`,
      rank,
    };
  }

  const region = bestiaryRegionForEnemy(enemyId);
  const fallback = region?.hint ?? '未知の狩猟地';
  return { short: fallback, undiscovered: fallback, discovered: fallback };
}

export function bestiaryEquipmentGuide(def: EnemyDef): BestiaryEquipmentGuide | null {
  if (!def.dropTableId) return null;
  const table = getDropTable(def.dropTableId);
  if (!table) return null;

  const exchange = getBossRareExchangeForDropTable(def.dropTableId);
  const set = exchange
    ? allBossSetBonuses().find((entry) => entry.rareMaterialId === exchange.rareMaterialId)
    : undefined;
  if (set) return { title: `${set.name}シリーズ`, itemIds: [...set.pieceIds] };

  const dropIds = new Set(table.entries.map((entry) => entry.itemId));
  const itemIds: string[] = [];
  for (const entry of table.entries) {
    if (getEquipment(entry.itemId) && !itemIds.includes(entry.itemId)) itemIds.push(entry.itemId);
  }
  for (const recipe of allRecipes()) {
    if (!getEquipment(recipe.resultItemId)) continue;
    if (!Object.keys(recipe.materials).some((materialId) => dropIds.has(materialId))) continue;
    if (!itemIds.includes(recipe.resultItemId)) itemIds.push(recipe.resultItemId);
  }
  return itemIds.length > 0 ? { title: '素材から作れる装備', itemIds } : null;
}

export function bestiaryRewardLabel(region: BestiaryRegionDef): string {
  const item = itemDisplayName(region.reward.materialId);
  return `${region.reward.gold.toLocaleString()}G・${item} ×${region.reward.quantity}`;
}

/** Used by validation tests and the completion counter. */
export function catalogedEnemyIds(): string[] {
  return BESTIARY_REGIONS.flatMap((region) => [...region.enemyIds]);
}

export function uncatalogedEnemyIds(): string[] {
  const cataloged = new Set(catalogedEnemyIds());
  return allEnemyDefs().map((enemy) => enemy.id).filter((id) => !cataloged.has(id));
}
