import { describe, expect, it } from 'vitest';
import { getConsumable, getEquipment } from '@/data/items';
import { getEnemyDef } from '@/enemies/enemy-defs';

describe('expanded combat number progression', () => {
  it('gives every weapon rank a clearly larger attack step', () => {
    const progression = [
      ['wood_sword', 12],
      ['hunters_sword', 25],
      ['iron_sword', 42],
      ['steel_sword', 62],
      ['gale_sword', 99],
      ['storm_sword', 136],
      ['moonlit_sword', 189],
      ['whitesilver_sword', 250],
      ['thunderpeal_sword', 334],
      ['skyvault_sword', 480],
    ] as const;

    const values = progression.map(([id, expected]) => {
      const attack = getEquipment(id)?.derived.physAtk;
      expect(attack, id).toBe(expected);
      return attack!;
    });
    for (let index = 1; index < values.length; index++) {
      expect(values[index]).toBeGreaterThan(values[index - 1]);
    }
  });

  it('raises armor and healing alongside offensive stats', () => {
    expect(getEquipment('iron_helm')?.derived).toMatchObject({ def: 15, maxHp: 26 });
    expect(getEquipment('skyvault_armor')?.derived).toMatchObject({ def: 229, maxHp: 276 });
    expect(getConsumable('potion_hp')?.effect.hp).toBe(60);
    expect(getConsumable('potion_mp')?.effect.mp).toBe(20);
  });

  it('moves enemies into the same larger combat-number scale', () => {
    expect(getEnemyDef('slime')).toMatchObject({ maxHp: 75, contactDamage: 12 });
    expect(getEnemyDef('boss_treant')).toMatchObject({ maxHp: 1650, contactDamage: 40 });
  });
});
