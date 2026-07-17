import { describe, expect, it } from 'vitest';
import {
  hasIronEquipmentAppearance,
  resolveIronEquipmentAppearance,
} from '@/paperdoll/iron-equipment';

describe('iron equipment appearance', () => {
  it('maps each supported iron item to its own visual layer', () => {
    const state = resolveIronEquipmentAppearance({
      head: 'iron_helm',
      torso: 'iron_plate',
      hands: 'iron_gloves',
      feet: 'iron_boots',
      main_hand: 'iron_sword',
    });

    expect(state).toEqual({
      head: true,
      torso: true,
      hands: true,
      feet: true,
      sword: true,
      shield: true,
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

  it('bundles the shield with the iron plate until an off-hand slot exists', () => {
    expect(resolveIronEquipmentAppearance({ torso: 'iron_plate' }).shield).toBe(true);
    expect(resolveIronEquipmentAppearance({ torso: null }).shield).toBe(false);
  });
});
