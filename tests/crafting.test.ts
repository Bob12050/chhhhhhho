import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { craft, canCraft, craftBlock } from '@/crafting/crafting';
import { getRecipe, allRecipes } from '@/crafting/recipes';
import { getMaterial, getEquipment } from '@/data/items';
import dropsJson from '@/data/defs/drops.json';

describe('crafting', () => {
  it('blocks when materials or gold are missing', () => {
    const gs = new GameState();
    gs.gold = 0;
    const r = getRecipe('craft_potion_hp')!; // herb1 + slime_jelly1
    expect(craftBlock(gs, r)).toBe('materials');
    gs.addMaterial('slime_jelly', 2);
    gs.addMaterial('herb', 1);
    expect(craftBlock(gs, r)).toBe('gold');
    gs.addGold(r.gold);
    expect(canCraft(gs, r)).toBe(true);
  });

  it('consumes inputs and grants the result', () => {
    const gs = new GameState();
    gs.addMaterial('iron_ore', 3);
    gs.addMaterial('soft_leather', 2);
    gs.addMaterial('mana_stone', 1);
    gs.addGold(100);
    const r = getRecipe('craft_iron_sword')!;
    const goldBefore = gs.gold;
    expect(craft(gs, r)).toBe(true);
    expect(gs.equipmentOwned).toContain('iron_sword');
    expect(gs.materials.iron_ore ?? 0).toBe(0);
    expect(gs.materials.mana_stone ?? 0).toBe(0);
    expect(gs.gold).toBe(goldBefore - r.gold);
  });

  it('does not craft when unaffordable', () => {
    const gs = new GameState();
    const r = getRecipe('craft_iron_helm')!;
    expect(craft(gs, r)).toBe(false);
  });

  it('mixes an early material into a late recipe (return-to-old-map)', () => {
    const elixir = getRecipe('craft_elixir')!;
    expect(Object.keys(elixir.materials)).toContain('slime_jelly');
  });

  it('ships 246 recipes', () => {
    expect(allRecipes().length).toBe(246);
  });

  it('boss signature materials drop and craft themed gear (MH loop)', () => {
    const SIG = [
      'treant_sap', 'night_fang', 'flame_core', 'alpha_pelt', 'royal_ichor', 'dragon_scale',
      'spore_sac', 'garo_fang', 'frost_heart', 'dread_carapace', 'abyss_core', 'stone_heart',
    ];
    const dropItems = new Set<string>();
    for (const t of (dropsJson as { tables: { entries: { itemId: string }[] }[] }).tables)
      for (const e of t.entries) dropItems.add(e.itemId);
    for (const m of SIG) {
      expect(getMaterial(m), `${m} is a material`).toBeDefined();
      expect(dropItems.has(m), `${m} drops from a boss`).toBe(true);
      const recipe = allRecipes().find((r) => r.materials[m]);
      expect(recipe, `${m} is used in a recipe`).toBeDefined();
      expect(getEquipment(recipe!.resultItemId), `${m} recipe makes equipment`).toBeDefined();
    }
  });
});
