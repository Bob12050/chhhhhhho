import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { createDefaultSave } from '@/save/schema';
import { craft } from '@/crafting/crafting';
import { getRecipe } from '@/crafting/recipes';
import { getEquipment, getMaterial } from '@/data/items';
import { rarityRank } from '@/data/rarity';

/**
 * Rare-material crafting (Phase 2): special gear is obtained ONLY by crafting,
 * and its recipes require rare (epic/legendary) drop materials.
 */
describe('rare-material crafting', () => {
  const SPECIALS = ['craft_radiant_blade', 'craft_aegis_plate', 'craft_starlight_crown'];

  it('special recipes require an epic+ material and yield rare+ gear', () => {
    for (const rid of SPECIALS) {
      const r = getRecipe(rid)!;
      expect(r).toBeTruthy();
      const usesRareMat = Object.keys(r.materials).some(
        (m) => rarityRank(getMaterial(m)?.rarity) >= rarityRank('epic'),
      );
      expect(usesRareMat, `${rid} should need an epic+ material`).toBe(true);
      const result = getEquipment(r.resultItemId)!;
      expect(rarityRank(result.rarity)).toBeGreaterThanOrEqual(rarityRank('epic'));
    }
  });

  it('cannot craft a special without the rare material; can with it', () => {
    const gs = new GameState();
    gs.loadFrom(createDefaultSave(0));
    const r = getRecipe('craft_radiant_blade')!;
    // Give everything EXCEPT the rare golem_core, plus gold.
    gs.addGold(1000);
    for (const [id, qty] of Object.entries(r.materials)) {
      if (id !== 'golem_core') gs.addMaterial(id, qty);
    }
    expect(craft(gs, r)).toBe(false);
    gs.addMaterial('golem_core', r.materials['golem_core']);
    expect(craft(gs, r)).toBe(true);
    expect(gs.equipmentOwned).toContain('radiant_blade');
  });
});
