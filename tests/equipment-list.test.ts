import { describe, expect, it } from 'vitest';
import type { EquipmentDef } from '@/data/items';
import {
  filterAndSortEquipment,
  equipmentPowerScore,
  matchesEquipmentRarity,
  type EquipmentListItem,
} from '@/equipment/equipment-list';

function item(
  id: string,
  overrides: Partial<EquipmentDef> = {},
  state: Partial<Pick<EquipmentListItem, 'equipped' | 'canEquip'>> = {},
): EquipmentListItem {
  const def: EquipmentDef = {
    id,
    name: id,
    slot: 'main_hand',
    rarity: 1,
    visualId: id,
    weaponTags: ['sword'],
    levelRequirement: 1,
    derived: {},
    sellPrice: 1,
    description: '',
    ...overrides,
  };
  return {
    id,
    count: 1,
    def,
    equipped: state.equipped ?? false,
    canEquip: state.canEquip ?? true,
  };
}

describe('equipment list filters', () => {
  it('groups the ten rarity ranks into readable rarity bands', () => {
    expect(matchesEquipmentRarity(1, 'common')).toBe(true);
    expect(matchesEquipmentRarity(2, 'common')).toBe(true);
    expect(matchesEquipmentRarity(3, 'common')).toBe(false);
    expect(matchesEquipmentRarity(6, 'rare')).toBe(true);
    expect(matchesEquipmentRarity(7, 'epic')).toBe(true);
    expect(matchesEquipmentRarity(10, 'divine')).toBe(true);
  });

  it('filters weapons by their weapon tag and rarity together', () => {
    const entries = [
      item('iron_sword', { rarity: 3, weaponTags: ['sword'] }),
      item('rare_katana', { rarity: 6, weaponTags: ['katana'] }),
      item('common_katana', { rarity: 2, weaponTags: ['katana'] }),
    ];

    const result = filterAndSortEquipment(entries, {
      weapon: 'katana',
      rarity: 'rare',
      sort: 'recommended',
    });

    expect(result.map((entry) => entry.id)).toEqual(['rare_katana']);
  });

  it('keeps equipped and usable gear first in the recommended order', () => {
    const entries = [
      item('locked', { rarity: 9 }, { canEquip: false }),
      item('usable', { rarity: 4 }),
      item('equipped', { rarity: 2 }, { equipped: true }),
    ];

    const result = filterAndSortEquipment(entries, {
      weapon: 'all',
      rarity: 'all',
      sort: 'recommended',
    });

    expect(result.map((entry) => entry.id)).toEqual(['equipped', 'usable', 'locked']);
  });

  it('sorts by rarity, level, attack, defense, and name', () => {
    const entries = [
      item('zeta', { name: 'ゼータ', rarity: 3, levelRequirement: 9, derived: { physAtk: 7, def: 2 } }),
      item('alpha', { name: 'アルファ', rarity: 8, levelRequirement: 4, derived: { magAtk: 11, def: 1 } }),
      item('beta', { name: 'ベータ', rarity: 5, levelRequirement: 20, derived: { physAtk: 4, def: 8, magDef: 4 } }),
    ];
    const run = (sort: 'power_desc' | 'rarity_desc' | 'rarity_asc' | 'level_desc' | 'attack_desc' | 'defense_desc' | 'name') =>
      filterAndSortEquipment(entries, { weapon: 'all', rarity: 'all', sort }).map((entry) => entry.id);

    expect(run('power_desc')).toEqual(['beta', 'alpha', 'zeta']);
    expect(run('rarity_desc')).toEqual(['alpha', 'beta', 'zeta']);
    expect(run('rarity_asc')).toEqual(['zeta', 'beta', 'alpha']);
    expect(run('level_desc')).toEqual(['beta', 'zeta', 'alpha']);
    expect(run('attack_desc')).toEqual(['alpha', 'zeta', 'beta']);
    expect(run('defense_desc')).toEqual(['beta', 'zeta', 'alpha']);
    expect(run('name')).toEqual(['alpha', 'zeta', 'beta']);
  });

  it('expresses mixed equipment stats as one readable power value', () => {
    const weapon = item('weapon', { derived: { physAtk: 200, critRate: 0.1 } });
    const charm = item('charm', { slot: 'accessory_1', derived: { maxHp: 500, def: 80 } });
    expect(equipmentPowerScore(weapon.def)).toBeGreaterThan(0);
    expect(equipmentPowerScore(charm.def)).toBeGreaterThan(0);
    expect(equipmentPowerScore(weapon.def)).toBeGreaterThan(equipmentPowerScore(charm.def));
  });
});
