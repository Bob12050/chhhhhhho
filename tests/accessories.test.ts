import { describe, it, expect } from 'vitest';
import { allEquipment, getMaterial } from '@/data/items';
import { allRecipes } from '@/crafting/recipes';
import dropsJson from '@/data/defs/drops.json';

/**
 * Accessory slots (accessory_1 / accessory_2) shipped empty for a long time.
 * These lock in that both slots have wearable items and that every accessory is
 * actually obtainable (craftable from droppable/craftable materials).
 */
describe('accessories', () => {
  const accessories = allEquipment().filter((e) => e.slot.startsWith('accessory'));

  it('ships items for both accessory slots', () => {
    const slots = new Set(accessories.map((e) => e.slot));
    expect(slots.has('accessory_1'), 'accessory_1 line').toBe(true);
    expect(slots.has('accessory_2'), 'accessory_2 line').toBe(true);
    expect(accessories.length).toBeGreaterThanOrEqual(10);
  });

  it('every accessory is obtainable (recipe, enemy drop, or quest reward)', async () => {
    const craftResults = new Set(allRecipes().map((r) => r.resultItemId));
    const dropItems = new Set<string>();
    for (const t of (dropsJson as { tables: { entries: { itemId: string }[] }[] }).tables)
      for (const e of t.entries) dropItems.add(e.itemId);
    const questsJson = (await import('@/data/defs/quests.json')).default as {
      quests: { rewards?: { items?: Record<string, number> } }[];
    };
    const questItems = new Set<string>();
    for (const q of questsJson.quests)
      for (const id of Object.keys(q.rewards?.items ?? {})) questItems.add(id);
    for (const a of accessories) {
      const obtainable = craftResults.has(a.id) || dropItems.has(a.id) || questItems.has(a.id);
      expect(obtainable, `${a.id} is obtainable somehow`).toBe(true);
    }
  });

  it('accessory recipe materials are obtainable (drop or craft)', () => {
    const dropItems = new Set<string>();
    for (const t of (dropsJson as { tables: { entries: { itemId: string }[] }[] }).tables)
      for (const e of t.entries) dropItems.add(e.itemId);
    const craftResults = new Set(allRecipes().map((r) => r.resultItemId));
    const accIds = new Set(accessories.map((a) => a.id));
    for (const r of allRecipes()) {
      if (!accIds.has(r.resultItemId)) continue;
      for (const m of Object.keys(r.materials)) {
        if (!getMaterial(m)) continue;
        expect(dropItems.has(m) || craftResults.has(m), `${r.id}:${m} obtainable`).toBe(true);
      }
    }
  });

  it('accessories carry no offensive element (weapons-only field)', () => {
    for (const a of accessories) {
      expect(a.element == null || a.element === 'none', a.id).toBe(true);
    }
  });
});
