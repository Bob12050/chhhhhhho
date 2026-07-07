import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { craft, canCraft, craftBlock, isRecipeVisible, visibleRecipes } from '@/crafting/crafting';
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

  it('ships a substantial recipe catalogue (property, not a pinned count)', () => {
    expect(allRecipes().length).toBeGreaterThanOrEqual(300);
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

describe('recipe visibility (MH-style discovery)', () => {
  it('hides recipes until any material has been seen', () => {
    const gs = new GameState();
    const r = getRecipe('craft_potion_hp')!;
    expect(isRecipeVisible(gs, r)).toBe(false);
    gs.addMaterial('herb', 1);
    expect(isRecipeVisible(gs, r)).toBe(true);
  });

  it('visibility survives spending the material', () => {
    const gs = new GameState();
    gs.addMaterial('herb', 1);
    gs.consumeMaterials({ herb: 1 });
    const r = getRecipe('craft_potion_hp')!;
    expect(gs.materials['herb'] ?? 0).toBe(0);
    expect(isRecipeVisible(gs, r)).toBe(true);
  });

  it('upgrade recipes show when the base gear is owned', () => {
    const gs = new GameState();
    const upgrade = allRecipes().find((r) => (r.consumeEquipment ?? []).length > 0)!;
    expect(isRecipeVisible(gs, upgrade)).toBe(false);
    gs.addEquipment(upgrade.consumeEquipment![0]);
    expect(isRecipeVisible(gs, upgrade)).toBe(true);
  });

  it('sorts craftable recipes first and counts hidden ones', () => {
    const gs = new GameState();
    gs.addMaterial('slime_jelly', 2);
    gs.addMaterial('herb', 1);
    gs.addGold(9999);
    const { visible, hidden } = visibleRecipes(gs, allRecipes());
    expect(visible.length).toBeGreaterThan(0);
    expect(hidden).toBeGreaterThan(0);
    expect(visible.length + hidden).toBe(allRecipes().length);
    // every craftable entry precedes every non-craftable entry
    const flags = visible.map((r) => craftBlock(gs, r) === null);
    const firstBlocked = flags.indexOf(false);
    if (firstBlocked >= 0) expect(flags.slice(firstBlocked)).not.toContain(true);
  });

  it('seenMaterials round-trips through save/load', () => {
    const gs = new GameState();
    gs.addMaterial('herb', 1);
    gs.consumeMaterials({ herb: 1 });
    const data = gs.toSave(0);
    const gs2 = new GameState();
    gs2.loadFrom(data);
    expect(gs2.seenMaterials['herb']).toBe(true);
  });
});
