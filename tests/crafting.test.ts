import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { craft, canCraft, craftBlock } from '@/crafting/crafting';
import { getRecipe, allRecipes } from '@/crafting/recipes';

describe('crafting', () => {
  it('blocks when materials or gold are missing', () => {
    const gs = new GameState();
    gs.gold = 0;
    const r = getRecipe('craft_potion_hp')!;
    expect(craftBlock(gs, r)).toBe('materials');
    gs.addMaterial('slime_jelly', 2);
    expect(craftBlock(gs, r)).toBe('gold');
    gs.addGold(r.gold);
    expect(canCraft(gs, r)).toBe(true);
  });

  it('consumes inputs and grants the result', () => {
    const gs = new GameState();
    gs.addMaterial('iron_ore', 3);
    gs.addMaterial('soft_leather', 2);
    gs.addGold(100);
    const r = getRecipe('craft_iron_sword')!;
    const goldBefore = gs.gold;
    expect(craft(gs, r)).toBe(true);
    expect(gs.equipmentOwned).toContain('iron_sword');
    expect(gs.materials.iron_ore ?? 0).toBe(0);
    expect(gs.gold).toBe(goldBefore - r.gold);
  });

  it('does not craft when unaffordable', () => {
    const gs = new GameState();
    const r = getRecipe('craft_iron_helm')!;
    expect(craft(gs, r)).toBe(false);
  });

  it('ships 6 recipes', () => {
    expect(allRecipes().length).toBe(6);
  });
});
