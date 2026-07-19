import type { EquipmentDef } from '@/data/items';

export const WEAPON_FILTER_OPTIONS = [
  { id: 'all', label: 'すべて' },
  { id: 'sword', label: '剣' },
  { id: 'katana', label: '刀' },
  { id: 'axe', label: '斧' },
  { id: 'spear', label: '槍' },
  { id: 'mace', label: 'メイス' },
  { id: 'dagger', label: '短剣' },
  { id: 'whip', label: '鞭' },
  { id: 'bow', label: '弓' },
  { id: 'shuriken', label: '手裏剣' },
  { id: 'staff', label: '杖' },
  { id: 'wand', label: 'ワンド' },
  { id: 'shield', label: '盾' },
] as const;

export const RARITY_FILTER_OPTIONS = [
  { id: 'all', label: 'すべて', shortLabel: 'すべて' },
  { id: 'common', label: 'R1-2 コモン', shortLabel: 'R1-2' },
  { id: 'uncommon', label: 'R3-4 アンコモン', shortLabel: 'R3-4' },
  { id: 'rare', label: 'R5-6 レア', shortLabel: 'R5-6' },
  { id: 'epic', label: 'R7 エピック', shortLabel: 'R7' },
  { id: 'legendary', label: 'R8 レジェンド', shortLabel: 'R8' },
  { id: 'mythic', label: 'R9 ミシック', shortLabel: 'R9' },
  { id: 'divine', label: 'R10 ディヴァイン', shortLabel: 'R10' },
] as const;

export const EQUIPMENT_SORT_OPTIONS = [
  { id: 'recommended', label: 'おすすめ順', shortLabel: 'おすすめ' },
  { id: 'rarity_desc', label: 'レア度：高い順', shortLabel: 'レア高' },
  { id: 'rarity_asc', label: 'レア度：低い順', shortLabel: 'レア低' },
  { id: 'level_desc', label: '装備Lv：高い順', shortLabel: 'Lv高' },
  { id: 'attack_desc', label: '攻撃力：高い順', shortLabel: '攻撃高' },
  { id: 'defense_desc', label: '防御力：高い順', shortLabel: '防御高' },
  { id: 'name', label: '名前順', shortLabel: '名前' },
] as const;

export type WeaponFilter = (typeof WEAPON_FILTER_OPTIONS)[number]['id'];
export type EquipmentRarityFilter = (typeof RARITY_FILTER_OPTIONS)[number]['id'];
export type EquipmentSort = (typeof EQUIPMENT_SORT_OPTIONS)[number]['id'];

export interface EquipmentListItem {
  id: string;
  count: number;
  def: EquipmentDef;
  equipped: boolean;
  canEquip: boolean;
}

export interface EquipmentListFilters {
  weapon: WeaponFilter;
  rarity: EquipmentRarityFilter;
  sort: EquipmentSort;
}

const RARITY_RANGES: Record<Exclude<EquipmentRarityFilter, 'all'>, readonly [number, number]> = {
  common: [1, 2],
  uncommon: [3, 4],
  rare: [5, 6],
  epic: [7, 7],
  legendary: [8, 8],
  mythic: [9, 9],
  divine: [10, 10],
};

export function matchesEquipmentRarity(
  rarity: number,
  filter: EquipmentRarityFilter,
): boolean {
  if (filter === 'all') return true;
  const [min, max] = RARITY_RANGES[filter];
  return rarity >= min && rarity <= max;
}

function attackScore(def: EquipmentDef): number {
  return Math.max(def.derived.physAtk ?? 0, def.derived.magAtk ?? 0);
}

function defenseScore(def: EquipmentDef): number {
  return (def.derived.def ?? 0) + (def.derived.magDef ?? 0);
}

function stableFallback(a: EquipmentListItem, b: EquipmentListItem): number {
  return (
    (b.def.rarity ?? 1) - (a.def.rarity ?? 1) ||
    (b.def.levelRequirement ?? 1) - (a.def.levelRequirement ?? 1) ||
    a.def.name.localeCompare(b.def.name, 'ja') ||
    a.id.localeCompare(b.id)
  );
}

export function filterAndSortEquipment(
  entries: readonly EquipmentListItem[],
  filters: EquipmentListFilters,
): EquipmentListItem[] {
  const filtered = entries.filter((entry) => {
    if (!matchesEquipmentRarity(entry.def.rarity, filters.rarity)) return false;
    if (filters.weapon !== 'all' && !entry.def.weaponTags?.includes(filters.weapon)) return false;
    return true;
  });

  return filtered.sort((a, b) => {
    if (filters.sort === 'recommended') {
      return (
        Number(b.equipped) - Number(a.equipped) ||
        Number(b.canEquip) - Number(a.canEquip) ||
        stableFallback(a, b)
      );
    }
    if (filters.sort === 'rarity_desc') return stableFallback(a, b);
    if (filters.sort === 'rarity_asc') {
      return (
        (a.def.rarity ?? 1) - (b.def.rarity ?? 1) ||
        (a.def.levelRequirement ?? 1) - (b.def.levelRequirement ?? 1) ||
        a.def.name.localeCompare(b.def.name, 'ja') ||
        a.id.localeCompare(b.id)
      );
    }
    if (filters.sort === 'level_desc') {
      return (
        (b.def.levelRequirement ?? 1) - (a.def.levelRequirement ?? 1) ||
        stableFallback(a, b)
      );
    }
    if (filters.sort === 'attack_desc') {
      return attackScore(b.def) - attackScore(a.def) || stableFallback(a, b);
    }
    if (filters.sort === 'defense_desc') {
      return defenseScore(b.def) - defenseScore(a.def) || stableFallback(a, b);
    }
    return (
      a.def.name.localeCompare(b.def.name, 'ja') ||
      (b.def.rarity ?? 1) - (a.def.rarity ?? 1) ||
      a.id.localeCompare(b.id)
    );
  });
}
