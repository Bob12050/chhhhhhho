import { describe, expect, it } from 'vitest';
import { getConsumable, getEquipment } from '@/data/items';
import { getEnemyDef } from '@/enemies/enemy-defs';

describe('expanded combat number progression', () => {
  it('gives every weapon rank a clearly larger attack step', () => {
    const progression = [
      ['wood_sword', 12],
      ['hunters_sword', 32],
      ['iron_sword', 65],
      ['steel_sword', 117],
      ['gale_sword', 225],
      ['storm_sword', 374],
      ['moonlit_sword', 621],
      ['whitesilver_sword', 960],
      ['thunderpeal_sword', 1482],
      ['skyvault_sword', 2400],
    ] as const;

    const values = progression.map(([id, expected]) => {
      const attack = getEquipment(id)?.derived.physAtk;
      expect(attack, id).toBe(expected);
      return attack!;
    });
    for (let index = 1; index < values.length; index++) {
      expect(values[index] / values[index - 1]).toBeGreaterThan(1.45);
    }
  });

  it('raises armour and healing alongside offensive stats', () => {
    expect(getEquipment('iron_helm')?.derived).toMatchObject({ def: 22, maxHp: 43 });
    expect(getEquipment('skyvault_armor')?.derived).toMatchObject({ def: 1232, maxHp: 2346 });
    expect(getConsumable('potion_hp')?.effect.hp).toBe(60);
    expect(getConsumable('potion_mp')?.effect.mp).toBe(20);
  });

  it('scales attack, survival, and rate stats on accessories too', () => {
    expect(getEquipment('ring_astral')?.derived).toMatchObject({
      physAtk: 240,
      magAtk: 240,
      accuracy: 16,
      critRate: 0.148,
    });
    expect(getEquipment('hero_emblem')?.derived).toMatchObject({
      physAtk: 400,
      magAtk: 400,
      maxHp: 1020,
      maxMp: 240,
      dropRate: 0.131,
      goldRate: 0.131,
    });
  });

  it('moves enemies into the same larger combat-number scale', () => {
    expect(getEnemyDef('slime')).toMatchObject({ maxHp: 75, contactDamage: 12 });
    expect(getEnemyDef('boss_treant')).toMatchObject({ maxHp: 1650, contactDamage: 40 });
  });
});
