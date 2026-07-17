import { describe, expect, it } from 'vitest';
import {
  hasIronEquipmentAppearance,
  resolveIronEquipmentAppearance,
} from '@/paperdoll/iron-equipment';

describe('iron equipment appearance', () => {
  it('maps equipment to the three stable appearance slots', () => {
    const state = resolveIronEquipmentAppearance({
      head: 'iron_helm',
      torso: 'iron_plate',
      hands: 'iron_gloves',
      feet: 'iron_boots',
      main_hand: 'iron_sword',
    });

    expect(state).toEqual({
      head: true,
      outfit: true,
      weapon: true,
    });
    expect(hasIronEquipmentAppearance(state)).toBe(true);
  });

  it('does not reuse the iron art for other equipment families', () => {
    const state = resolveIronEquipmentAppearance({
      head: 'steel_helm',
      torso: 'knight_plate',
      hands: 'steel_gloves',
      feet: 'steel_boots',
      main_hand: 'steel_sword',
    });

    expect(hasIronEquipmentAppearance(state)).toBe(false);
    expect(Object.values(state).every((visible) => !visible)).toBe(true);
  });

  it('keeps hands and feet as stat slots without creating visual layers', () => {
    const state = resolveIronEquipmentAppearance({
      hands: 'iron_gloves',
      feet: 'iron_boots',
    });

    expect(state).toEqual({ head: false, outfit: false, weapon: false });
    expect(hasIronEquipmentAppearance(state)).toBe(false);
  });
});
