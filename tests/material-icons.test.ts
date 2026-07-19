import { describe, expect, it } from 'vitest';
import { allMaterials, getMaterial } from '@/data/items';
import {
  MATERIAL_ICON_TEXTURES,
  materialIconKind,
  materialIconTexture,
} from '@/data/material-icons';
import { rarityColorHex } from '@/data/rarity';

describe('material icon categories', () => {
  it('explicitly classifies every authored material', () => {
    const missing = allMaterials()
      .filter((material) => materialIconKind(material.id) === undefined)
      .map((material) => material.id);

    expect(missing).toEqual([]);
  });

  it('provides a distinct texture for each category', () => {
    const textures = Object.values(MATERIAL_ICON_TEXTURES);
    expect(textures).toHaveLength(20);
    expect(new Set(textures).size).toBe(textures.length);
  });

  it('reuses one silhouette across all jelly materials', () => {
    const jellyIds = [
      'slime_jelly',
      'king_jelly',
      'royal_ichor',
      'crown_droplet',
      'abyss_dreg',
      'aurum_jelly',
    ];

    expect(new Set(jellyIds.map(materialIconTexture))).toEqual(
      new Set([MATERIAL_ICON_TEXTURES.jelly]),
    );
  });

  it('keeps rarity colour independent from the shared silhouette', () => {
    expect(materialIconTexture('slime_jelly')).toBe(materialIconTexture('aurum_jelly'));
    expect(rarityColorHex(getMaterial('slime_jelly')?.rarity)).not.toBe(
      rarityColorHex(getMaterial('aurum_jelly')?.rarity),
    );
  });
});
