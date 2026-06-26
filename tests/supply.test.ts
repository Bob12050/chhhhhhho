import { describe, it, expect } from 'vitest';
import dropsJson from '@/data/defs/drops.json';
import { allRecipes } from '@/crafting/recipes';
import { getMaterial } from '@/data/items';

/**
 * Supply guard: every material consumed by a recipe must be obtainable, either
 * by dropping from an enemy or by being the result of another recipe (e.g.
 * steel_ingot is smelted). Catches dead-end materials like the earlier
 * steel_ingot/mythril_ore gap before they ship.
 */
describe('material supply', () => {
  const dropItems = new Set<string>();
  for (const t of (dropsJson as { tables: { entries: { itemId: string }[] }[] }).tables) {
    for (const e of t.entries) dropItems.add(e.itemId);
  }
  const craftResults = new Set(allRecipes().map((r) => r.resultItemId));

  it('every material used in a recipe is droppable or craftable', () => {
    const unobtainable: string[] = [];
    for (const r of allRecipes()) {
      for (const id of Object.keys(r.materials)) {
        if (!getMaterial(id)) continue; // non-materials handled elsewhere
        if (!dropItems.has(id) && !craftResults.has(id)) unobtainable.push(`${r.id}:${id}`);
      }
    }
    expect(unobtainable, `unobtainable materials: ${unobtainable.join(', ')}`).toEqual([]);
  });
});
